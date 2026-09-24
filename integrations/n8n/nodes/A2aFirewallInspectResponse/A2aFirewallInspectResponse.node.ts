import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import {
	buildInspectResponseBody,
	failVerdict,
	getConfig,
	idempotencyKey,
	mapInspectResponseOutput,
	parseVerdict,
	postJson,
	type Decision,
	type FirewallVerdict,
} from '../shared/client';
import { MAIN } from '../shared/connection';

const OUTPUT_INDEX: Record<Decision, number> = { allow: 0, block: 1, review: 2 };

export class A2aFirewallInspectResponse implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'A2A Firewall Inspect Response',
		name: 'a2aFirewallInspectResponse',
		icon: 'file:a2aFirewall.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["sourceType"]}}',
		description: 'Inspect and sanitise content returned to an agent (tool results, web pages, DB rows, LLM output)',
		defaults: { name: 'A2A Firewall Inspect Response' },
		inputs: [MAIN],
		outputs: [MAIN, MAIN, MAIN],
		outputNames: ['Allow', 'Block', 'Review'],
		credentials: [{ name: 'a2aFirewallApi', required: true }],
		properties: [
			{
				displayName: 'Source Type',
				name: 'sourceType',
				type: 'options',
				default: 'tool_result',
				options: [
					{ name: 'Tool Result', value: 'tool_result' },
					{ name: 'Web Content', value: 'web_content' },
					{ name: 'Database Result', value: 'database_result' },
					{ name: 'RAG / Retrieved Chunk', value: 'retrieved_chunk' },
					{ name: 'LLM Completion', value: 'llm_completion' },
				],
			},
			{
				displayName: 'Source Name',
				name: 'sourceName',
				type: 'string',
				default: '',
				placeholder: 'e.g. github_search, https://example.com, postgres_orders',
				description: 'Tool name or URL, used by policies and shown in the audit log',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '={{ JSON.stringify($json) }}',
				description: 'The content to inspect',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Attach Verdict to Output',
						name: 'attachVerdict',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'On Firewall Error',
						name: 'onError',
						type: 'options',
						default: 'closed',
						options: [
							{ name: 'Block (Fail Closed)', value: 'closed' },
							{ name: 'Allow (Fail Open)', value: 'open' },
						],
					},
					{
						displayName: 'Redact PII',
						name: 'redactPii',
						type: 'boolean',
						default: true,
						description: 'Whether to redact detected PII spans in the returned content',
					},
					{
						displayName: 'Sanitised Content Field',
						name: 'sanitizedField',
						type: 'string',
						default: 'sanitizedContent',
						description: 'Output field that receives sanitised/redacted content',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cfg = await getConfig(this);
		const node = this.getNode();
		const executionId = this.getExecutionId();
		const out: INodeExecutionData[][] = [[], [], []];

		for (let i = 0; i < items.length; i++) {
			const sourceType = this.getNodeParameter('sourceType', i) as string;
			const content = this.getNodeParameter('content', i) as string;
			const o = this.getNodeParameter('options', i, {}) as {
				attachVerdict?: boolean;
				onError?: 'closed' | 'open';
				redactPii?: boolean;
				sanitizedField?: string;
			};

			if (typeof content !== 'string') {
				throw new NodeOperationError(node, 'Content must resolve to text', { itemIndex: i });
			}

			// Matches real InspectResponseRequest schema: { response_body, context, redact_pii }
			const body = buildInspectResponseBody(content, sourceType, o.redactPii !== false);

			let verdict: FirewallVerdict;
			let error: string | undefined;
			try {
				const res = await postJson(
					this,
					cfg,
					'/v1/firewall/inspect-response',
					body,
					idempotencyKey(executionId, node.name, i, content),
				);
				verdict = parseVerdict(res);
			} catch (e) {
				error = (e as Error).message;
				verdict = failVerdict((o.onError ?? 'closed') === 'closed' ? 'block' : 'allow', error);
			}

			const json = mapInspectResponseOutput(items[i].json, verdict, {
				attachVerdict: o.attachVerdict,
				sanitizedField: o.sanitizedField,
			}, error);

			out[OUTPUT_INDEX[verdict.decision]].push({
				json,
				binary: items[i].binary,
				pairedItem: { item: i },
			});
		}

		return out;
	}
}
