import { NodeOperationError, type IDataObject, type INode } from 'n8n-workflow';

/** A "json"-type parameter arrives as a string when typed and as an object when it is an expression result. */
export function readJsonParam(value: unknown, node: INode): IDataObject | unknown[] | string {
	if (typeof value !== 'string') return value as IDataObject;
	const trimmed = value.trim();
	if (trimmed === '') return {};
	try {
		return JSON.parse(trimmed) as IDataObject;
	} catch {
		throw new NodeOperationError(node, 'Payload must be valid JSON');
	}
}
