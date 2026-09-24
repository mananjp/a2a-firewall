import { randomUUID } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import {
	buildGuardInspectBody,
	failVerdict,
	getConfig,
	idempotencyKey,
	mapGuardOutput,
	parseVerdict,
	postJson,
	type Decision,
	type FirewallVerdict,
} from '../shared/client';
import { MAIN } from '../shared/connection';
import { readJsonParam } from '../shared/params';

const OUTPUT_INDEX: Record<Decision, number> = { allow: 0, block: 1, review: 2 };

export class A2aFirewallGuard implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'A2A Firewall Guard',
		name: 'a2aFirewallGuard',
		icon: 'file:a2aFirewall.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["taskType"]}}',
		description: 'Inspect an agent, tool or LLM step with A2A Firewall and route by decision',
		defaults: { name: 'A2A Firewall Guard' },
		inputs: [MAIN],
		outputs: [MAIN, MAIN, MAIN],
		outputNames: ['Allow', 'Block', 'Review'],
		credentials: [{ name: 'a2aFirewallApi', required: true }],
		properties: [
			{
				displayName: 'Task Type',
				name: 'taskType',
				type: 'string',
				default: 'workflow_step',
				description: 'Label used by policies, e.g. llm_call, tool_call, agent_handoff, http_request',
			},
			{
				displayName: 'Receiver',
				name: 'receiverAgentId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. openai:gpt-4o or a registered agent UUID',
				description: 'The agent, tool or model this step is about to talk to',
			},
			{
				displayName: 'Payload (JSON)',
				name: 'payload',
				type: 'json',
				default: '={{ $json }}',
				description: 'The content to inspect. Defaults to the entire input item.',
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
						description: 'Whether to add an `_a2aFirewall` object (decision, risk score, evidence ID) to each output item',
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
						description: 'What to do if the firewall cannot be reached or returns an error',
					},
					{
						displayName: 'Review Callback URL',
						name: 'reviewCallbackUrl',
						type: 'string',
						default: '',
						placeholder: '={{ $execution.resumeUrl }}',
						description:
							'If set, the firewall POSTs the analyst decision here when a Review item is resolved. Use with a Wait node (Resume: On Webhook Call).',
					},
					{
						displayName: 'Root Task ID (UUID)',
						name: 'rootTaskId',
						type: 'string',
						default: '',
						description:
							'Groups steps into one workflow graph for cumulative risk and cascade quarantine. Must be a valid UUID. Generated automatically if omitted.',
					},
					{
						displayName: 'Sender Agent ID',
						name: 'senderAgentId',
						type: 'string',
						default: '',
						description: 'Overrides the default agent ID from the credential (useful for per-workflow identities)',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cfg = await getConfig(this);
		const node = this.getNode();
		const workflow = this.getWorkflow();
		const executionId = this.getExecutionId();

		const out: INodeExecutionData[][] = [[], [], []];

		for (let i = 0; i < items.length; i++) {
			const taskType = this.getNodeParameter('taskType', i) as string;
			const receiver = this.getNodeParameter('receiverAgentId', i) as string;
			const payload = readJsonParam(this.getNodeParameter('payload', i), node);
			const o = this.getNodeParameter('options', i, {}) as {
				attachVerdict?: boolean;
				onError?: 'closed' | 'open';
				reviewCallbackUrl?: string;
				rootTaskId?: string;
				senderAgentId?: string;
			};

			const taskId = randomUUID();
			const rootTaskId = o.rootTaskId && o.rootTaskId.trim() ? o.rootTaskId.trim() : randomUUID();

			const body = buildGuardInspectBody({
				taskId,
				rootTaskId,
				receiverAgentId: receiver || cfg.agentId,
				taskType,
				payload,
				reviewCallbackUrl: o.reviewCallbackUrl,
				workflowId: workflow.id,
				workflowName: workflow.name,
				executionId,
				nodeName: node.name,
			});

			let verdict: FirewallVerdict;
			let error: string | undefined;
			try {
				const res = await postJson(
					this,
					cfg,
					'/v1/firewall/inspect',
					body,
					idempotencyKey(executionId, node.name, i, payload),
				);
				verdict = parseVerdict(res);
			} catch (e) {
				error = (e as Error).message;
				verdict = failVerdict((o.onError ?? 'closed') === 'closed' ? 'block' : 'allow', error);
			}

			const json = mapGuardOutput(items[i].json, verdict, o.attachVerdict !== false, error);

			out[OUTPUT_INDEX[verdict.decision]].push({
				json,
				binary: items[i].binary,
				pairedItem: { item: i },
			});
		}

		return out;
	}
}
