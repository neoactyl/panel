import { error } from '@sveltejs/kit';
import { AdError, getAdScript } from '#lib/server/billing/ads.ts';
import type { RequestHandler } from './$types';

/**
 * Serves one administrator-configured ad into the global panel widget. The
 * parent renders this inside a sandbox without `allow-same-origin`, so the
 * script cannot reach panel cookies, storage or the parent document.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Sign in to view this ad.');

	let script: string;

	try {
		script = await getAdScript(params.id);
	} catch (cause) {
		if (cause instanceof AdError) error(404, cause.message);
		throw cause;
	}

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Advertisement</title>
<style>
html, body { margin: 0; width: 100%; height: 100%; background: #0b0b0b; color: #e5e7eb; font-family: ui-sans-serif, system-ui, sans-serif; overflow: hidden; }
a { color: #818cf8; }
</style>
</head>
<body>
${script}
</body>
</html>`;

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			'x-robots-tag': 'noindex'
		}
	});
};
