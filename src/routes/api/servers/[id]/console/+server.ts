import { error } from '@sveltejs/kit';
import { AdapterError } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.session || !locals.user) {
		error(401, { message: 'Unauthorized' });
	}

	const adapter = getUserAdapter(locals.panelUserId);

	if (!adapter.capabilities.console.websocket) {
		error(404, { message: 'Console streaming is not supported by this adapter.' });
	}

	let credentials;

	try {
		credentials = await adapter.getWebsocket(params.id);
	} catch (cause) {
		if (cause instanceof AdapterError) {
			error(cause.statusCode ?? 502, { message: cause.message });
		}

		throw cause;
	}

	const encoder = new TextEncoder();
	let socket: WebSocket | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let done = false;
	let stop: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (payload: unknown) => {
				if (done) return;

				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
				} catch {
					finish();
				}
			};

			const sendToPanel = (payload: unknown) => {
				if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
			};

			const finish = () => {
				if (done) return;
				done = true;

				if (heartbeat) clearInterval(heartbeat);
				request.signal.removeEventListener('abort', finish);
				socket?.close();
				socket = null;

				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};

			stop = finish;

			socket = new WebSocket(credentials.url);
			socket.onopen = () => sendToPanel({ event: 'auth', args: [credentials.token] });
			socket.onmessage = (message) => {
				let payload: { event?: string; args?: string[] };

				try {
					payload = JSON.parse(String(message.data));
				} catch {
					return;
				}

				switch (payload.event) {
					case 'auth success':
						send({ event: 'ready' });
						sendToPanel({ event: 'send logs' });
						sendToPanel({ event: 'send stats' });
						break;
					case 'console output':
					case 'install output':
						send(payload);

						void adapter
							.getPanelPrompts('server', params.id, {
								output: (payload.args ?? []).join('')
							})
							.then((prompts) => {
								if (prompts.length) send({ event: 'prompt', prompts });
							})
							.catch(() => {
								/* prompts are best-effort */
							});
						break;
					case 'status':
						send(payload);
						if (payload.args?.[0] === 'running') sendToPanel({ event: 'send stats' });
						break;
					case 'token expiring':
					case 'token expired':
					case 'jwt error':
					case 'daemon error':
						send(payload);
						socket?.close();
						break;
					default:
						send(payload);
				}
			};
			socket.onerror = () => socket?.close();
			socket.onclose = () => finish();

			heartbeat = setInterval(() => {
				if (done) return;

				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					finish();
				}
			}, 15_000);

			request.signal.addEventListener('abort', finish, { once: true });
		},
		cancel() {
			stop?.();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			'x-accel-buffering': 'no'
		}
	});
};
