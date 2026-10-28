import { error, json } from '@sveltejs/kit';
import { serverEnv } from '#lib/server/config/env.ts';
import { AfkError, startAfkSession } from '#lib/server/afk/service.ts';
import { AFK_WS_PATH } from '#lib/server/afk/token.ts';
import type { RequestHandler } from './$types';

const noStore = {
	'cache-control': 'no-store, max-age=0',
	'content-type': 'application/json'
};

const allowedOrigins = (url: URL) =>
	new Set([url.origin, serverEnv.ORIGIN, serverEnv.BETTER_AUTH_URL].filter(Boolean) as string[]);

export const POST: RequestHandler = async ({ locals, request, url, getClientAddress }) => {
	if (!locals.user) {
		return json({ error: 'Sign in to start an AFK session.' }, { status: 401, headers: noStore });
	}

	const origin = request.headers.get('origin');
	if (origin && !allowedOrigins(url).has(origin)) {
		return json({ error: 'This request came from an unexpected origin.' }, {
			status: 403,
			headers: noStore
		});
	}

	try {
		const grant = await startAfkSession(locals.user.id, {
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? ''
		});

		const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${url.host}${AFK_WS_PATH}?ticket=${encodeURIComponent(grant.ticket)}`;

		return json(
			{
				...grant,
				wsUrl
			},
			{ headers: noStore }
		);
	} catch (cause) {
		if (cause instanceof AfkError) {
			const status =
				cause.code === 'DISABLED'
					? 403
					: cause.code === 'COOLDOWN'
						? 429
						: cause.code === 'CAP_REACHED'
							? 409
							: 400;

			return json(
				{ error: cause.message, code: cause.code, retryAfter: cause.retryAfterSeconds },
				{
					status,
					headers: {
						...noStore,
						...(cause.retryAfterSeconds
							? { 'retry-after': String(cause.retryAfterSeconds) }
							: {})
					}
				}
			);
		}

		console.error('[afk] Unable to issue a session ticket.', cause);
		error(500, { message: 'Unable to start an AFK session.' });
	}
};
