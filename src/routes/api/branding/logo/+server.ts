import { error } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { getSetting } from '#lib/server/config/settings.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const logo = getSetting('brand.logo');

	if (!logo.startsWith('data:')) {
		error(404, 'No custom logo is stored.');
	}

	const match = /^data:([^;,]+);base64,(.+)$/s.exec(logo);

	if (!match) {
		error(404, 'The stored logo is invalid.');
	}

	const [, mimeType, encoded] = match;

	if (!mimeType || !encoded) {
		error(404, 'The stored logo is invalid.');
	}

	const body = Buffer.from(encoded, 'base64');

	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': mimeType,
			'cache-control': 'public, max-age=60',
			'content-length': String(body.byteLength)
		}
	});
};
