import { randomUUID } from 'crypto';
import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import {
	canonicalize,
	failVerdict,
	getConfig,
	idempotencyKey,
	loadPrivateKey,
	parseVerdict,
	postJson,
	sha256Hex,
	signBody,
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
					{
						displayName: 'Sign Requests',
						name: 'sign',
						type: 'boolean',
						default: false,
						description: 'Whether to sign the request with the credential\'s Ed25519 key (ignored if no key is set)',
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

		let key;
		try {
			key = cfg.agentPrivateKey ? loadPrivateKey(cfg.agentPrivateKey) : undefined;
		} catch (e) {
			throw new NodeOperationError(node, (e as Error).message);
		}

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
				sign?: boolean;
			};

			const taskId = randomUUID();
			const rootTaskId = o.rootTaskId && o.rootTaskId.trim() ? o.rootTaskId.trim() : randomUUID();

			const body: IDataObject = {
				task_id: taskId,
				root_task_id: rootTaskId,
				receiver_agent_id: receiver || cfg.agentId,
				task_type: taskType,
				payload: payload as IDataObject,
				sdk_version: 'n8n-0.1.0',
				review_callback_url: o.reviewCallbackUrl || undefined,
				nonce: randomUUID(),
				timestamp: new Date().toISOString(),
				metadata: {
					source: 'n8n',
					workflow_id: workflow.id,
					workflow_name: workflow.name,
					execution_id: executionId,
					node_name: node.name,
					review_callback_url: o.reviewCallbackUrl || undefined,
				},
			};

			if (key && o.sign === true) {
				body.payload_sha256 = sha256Hex(canonicalize(payload));
				body.signature = signBody(body, key);
			}

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

			const json =
				o.attachVerdict === false
					? items[i].json
					: {
							...items[i].json,
							_a2aFirewall: {
								decision: verdict.decision,
								allowedToProceed: verdict.allowedToProceed,
								riskScore: verdict.riskScore,
								violations: verdict.violations,
								taskId: verdict.taskId,
								evidenceId: verdict.evidenceId,
								...(error ? { error } : {}),
							} as IDataObject,
						};

			out[OUTPUT_INDEX[verdict.decision]].push({
				json,
				binary: items[i].binary,
				pairedItem: { item: i },
			});
		}

		return out;
	}
}
