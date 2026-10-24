import { error } from '@sveltejs/kit';
import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { RequestHandler } from './$types';

const filename = (value: string) => value.replace(/["\\\r\n]/g, '_') || 'backup';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.session || !locals.user) {
		error(401, { message: 'Unauthorized' });
	}

	const adapter = getUserAdapter(locals.panelUserId);
	let target: string | null;

	try {
		target = await adapter.getBackupDownloadUrl(params.id, params.backupId);
	} catch (cause) {
		if (cause instanceof AdapterError) {
			error(cause.statusCode ?? 502, { message: cause.message });
		}

		throw cause;
	}

	if (!target) {
		error(501, { message: 'This adapter does not expose backup downloads.' });
	}

	const response = await fetch(target);

	if (!response.ok || !response.body) {
		error(502, { message: `The backup host responded with ${response.status}.` });
	}

	const headers: Record<string, string> = {
		'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
		'content-disposition': `attachment; filename="${filename(url.searchParams.get('name') ?? 'backup')}"`
	};

	const length = response.headers.get('content-length');
	if (length) headers['content-length'] = length;

	return new Response(response.body, { headers });
};
