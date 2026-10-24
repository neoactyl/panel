import { error } from '@sveltejs/kit';
import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { RequestHandler } from './$types';

const filename = (path: string) => {
	const name = decodeURIComponent(path.split('/').pop() || 'download');
	return name.replace(/["\\\r\n]/g, '_');
};

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || !locals.user) {
		error(401, { message: 'Unauthorized' });
	}

	const path = url.searchParams.get('path');

	if (!path) {
		error(400, { message: 'A file path is required.' });
	}

	const adapter = getUserAdapter(locals.panelUserId);
	let target: string | null;

	try {
		target = await adapter.getFileDownloadUrl(params.id, path);
	} catch (cause) {
		if (cause instanceof AdapterError) {
			error(cause.statusCode ?? 502, { message: cause.message });
		}

		throw cause;
	}

	if (!target) {
		error(501, { message: 'This adapter does not expose file downloads.' });
	}

	const response = await fetch(target);

	if (!response.ok || !response.body) {
		error(502, { message: `The file host responded with ${response.status}.` });
	}

	const headers: Record<string, string> = {
		'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
		'content-disposition': `attachment; filename="${filename(path)}"`
	};

	const length = response.headers.get('content-length');
	if (length) headers['content-length'] = length;

	return new Response(response.body, { headers });
};
