import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { getConfig, idempotencyKey, postJson } from '../shared/client';
import { MAIN } from '../shared/connection';

export class A2aFirewallDlp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'A2A Firewall DLP',
		name: 'a2aFirewallDlp',
		icon: 'file:a2aFirewall.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Tokenize sensitive data before sending it to an LLM, and detokenize the result',
		defaults: { name: 'A2A Firewall DLP' },
		inputs: [MAIN],
		outputs: [MAIN],
		credentials: [{ name: 'a2aFirewallApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'tokenize',
				options: [
					{
						name: 'Tokenize',
						value: 'tokenize',
						description: 'Replace sensitive values with secure cryptographic tokens',
						action: 'Tokenize sensitive data',
					},
					{
						name: 'Detokenize',
						value: 'detokenize',
						description: 'Restore original values (requires permission and recorded purpose)',
						action: 'Detokenize text',
					},
				],
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '={{ $json.text }}',
				required: true,
			},
			{
				displayName: 'Destination',
				name: 'destination',
				type: 'string',
				default: '',
				placeholder: 'e.g. openai, anthropic, external',
				description: 'Where the tokenized text will be sent; lets policies choose mask vs block vs tokenize',
				displayOptions: { show: { operation: ['tokenize'] } },
			},
			{
				displayName: 'Purpose',
				name: 'purpose',
				type: 'string',
				default: 'workflow_processing',
				description: 'Recorded in the audit log for every detokenize call',
				displayOptions: { show: { operation: ['detokenize'] } },
			},
			{
				displayName: 'Output Field',
				name: 'outputField',
				type: 'string',
				default: 'text',
				description: 'Field that receives the result',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cfg = await getConfig(this);
		const node = this.getNode();
		const executionId = this.getExecutionId();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as 'tokenize' | 'detokenize';
				const text = this.getNodeParameter('text', i) as string;
				const outputField = this.getNodeParameter('outputField', i) as string;

				// Request schema matches POST /v1/dlp/tokenize and /v1/dlp/detokenize
				const body: IDataObject = { text };
				if (operation === 'tokenize') {
					body.destination = this.getNodeParameter('destination', i, '') as string;
					body.entity_type = 'pii';
				} else {
					body.purpose = this.getNodeParameter('purpose', i, 'workflow_processing') as string;
				}

				const res = await postJson(
					this,
					cfg,
					`/v1/dlp/${operation}`,
					body,
					idempotencyKey(executionId, node.name, i, body),
				);

				const result = (res.tokenized_text ?? res.text) as string | undefined;
				if (typeof result !== 'string') {
					throw new NodeOperationError(node, 'Unexpected DLP response shape', { itemIndex: i });
				}

				returnData.push({
					json: {
						...items[i].json,
						[outputField]: result,
						_a2aDlp: { operation, success: true },
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				// DLP fails closed: never pass un-tokenized data along silently.
				if (this.continueOnFail()) {
					returnData.push({
						json: { ...items[i].json, error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
