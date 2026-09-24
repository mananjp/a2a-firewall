import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class A2aFirewallApi implements ICredentialType {
	name = 'a2aFirewallApi';
	displayName = 'A2A Firewall API';
	documentationUrl = 'https://github.com/mananjp/a2a-firewall/tree/main/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'Firewall URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8000',
			placeholder: 'https://firewall.internal.example.com',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Workspace API key (required for Detokenize and administrative actions) or Agent API key',
		},
		{
			displayName: 'Workspace ID',
			name: 'workspaceId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Default Agent ID',
			name: 'agentId',
			type: 'string',
			default: '',
			required: false,
			description:
				'Default registered agent identity this n8n instance or workflow acts as',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if SSL certificate validation fails (self-signed / private CA)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
