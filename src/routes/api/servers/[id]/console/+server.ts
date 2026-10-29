import { error } from '@sveltejs/kit';
import { WebSocket, type RawData } from 'ws';
import { AdapterError, type WebsocketCredentials } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { RequestHandler } from './$types';

const AUTH_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 15_000;
const RECONNECT_DELAY_MS = 2_000;
const RETRY_CREDENTIALS_MS = 5_000;

type PanelPayload = {
	event?: string;
	args?: unknown[];
};

const asText = (data: RawData): string => {
	if (typeof data === 'string') return data;

	if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');

	if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');

	return data.toString('utf8');
};

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.session || !locals.user) {
		error(401, { message: 'Unauthorized' });
	}

	const adapter = getUserAdapter(locals.panelUserId);

	if (!adapter.capabilities.console.websocket) {
		error(404, { message: 'Console streaming is not supported by this adapter.' });
	}

	let credentials: WebsocketCredentials;

	try {
		credentials = await adapter.getWebsocket(params.id);
	} catch (cause) {
		if (cause instanceof AdapterError) {
			error(cause.statusCode ?? 502, { message: cause.message });
		}

		throw cause;
	}

	const encoder = new TextEncoder();
	let stop: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let socket: WebSocket | null = null;
			let heartbeat: ReturnType<typeof setInterval> | null = null;
			let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
			let authTimer: ReturnType<typeof setTimeout> | null = null;
			let done = false;
			let refreshCredentials = false;
			let connecting = false;

			const send = (payload: unknown) => {
				if (done) return;

				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
				} catch {
					finish();
				}
			};

			const sendToPanel = (payload: unknown) => {
				const current = socket;

				if (!current || current.readyState !== WebSocket.OPEN) return;

				try {
					current.send(JSON.stringify(payload));
				} catch {
					/* the close handler reconnects */
				}
			};

			const closeSocket = () => {
				const current = socket;

				if (!current) return;

				try {
					current.close();
				} catch {
					current.terminate();
				}
			};

			const clearAuthTimer = () => {
				if (authTimer) clearTimeout(authTimer);
				authTimer = null;
			};

			const finish = () => {
				if (done) return;
				done = true;

				if (heartbeat) clearInterval(heartbeat);
				if (reconnectTimer) clearTimeout(reconnectTimer);
				clearAuthTimer();

				heartbeat = null;
				reconnectTimer = null;

				request.signal.removeEventListener('abort', finish);

				const current = socket;
				socket = null;

				if (current) {
					current.removeAllListeners();
					try {
						current.terminate();
					} catch {
						/* already closed */
					}
				}

				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};

			const scheduleReconnect = (delay = RECONNECT_DELAY_MS) => {
				if (done || reconnectTimer) return;

				reconnectTimer = setTimeout(() => {
					reconnectTimer = null;
					void connect();
				}, delay);
			};

			const checkPrompts = (output: string) => {
				void adapter
					.getPanelPrompts('server', params.id, { output })
					.then((prompts) => {
						if (!done && prompts.length) send({ event: 'prompt', prompts });
					})
					.catch(() => {
						/* prompts are best-effort */
					});
			};

			const onMessage = (data: RawData) => {
				let payload: PanelPayload;

				try {
					payload = JSON.parse(asText(data)) as PanelPayload;
				} catch {
					return;
				}

				if (!payload || typeof payload !== 'object') return;

				const args = Array.isArray(payload.args) ? payload.args.map(String) : [];

				switch (payload.event) {
					case 'auth success':
						clearAuthTimer();
						send({ event: 'ready' });

						// Wings defaults to text frames, but pin the mode so the
						// stream stays JSON even if the node was configured
						// differently for another connection.
						sendToPanel({ event: 'configure socket', args: ['transmission mode', 'text'] });
						sendToPanel({ event: 'send logs' });
						sendToPanel({ event: 'send status' });
						sendToPanel({ event: 'send stats' });
						break;
					case 'console output':
					case 'install output': {
						send({ event: payload.event, args });

						const output = args.join('');
						if (/eula/i.test(output)) checkPrompts(output);

						break;
					}
					case 'status':
						send({ event: 'status', args });
						if (args[0] === 'running') sendToPanel({ event: 'send stats' });
						break;
					case 'stats':
						send({ event: 'stats', args });
						break;
					case 'token expiring':
					case 'token expired':
					case 'jwt error':
						refreshCredentials = true;
						send({ event: payload.event, args });
						closeSocket();
						break;
					case 'daemon error':
						send({ event: payload.event, args });
						closeSocket();
						break;
					default:
						send({ event: payload.event, args });
				}
			};

			const connect = async () => {
				if (done || connecting || socket) return;

				connecting = true;

				try {
					if (refreshCredentials) {
						try {
							credentials = await adapter.getWebsocket(params.id);
							refreshCredentials = false;
						} catch {
							scheduleReconnect(RETRY_CREDENTIALS_MS);
							return;
						}
					}

					if (done) return;

					let next: WebSocket;

					try {
						next = new WebSocket(credentials.url, {
							handshakeTimeout: AUTH_TIMEOUT_MS,
							perMessageDeflate: false
						});
					} catch {
						scheduleReconnect(RETRY_CREDENTIALS_MS);
						return;
					}

					socket = next;

					authTimer = setTimeout(() => {
						if (socket === next) {
							try {
								next.terminate();
							} catch {
								/* close handler reconnects */
							}
						}
					}, AUTH_TIMEOUT_MS);

					next.on('open', () => {
						sendToPanel({ event: 'auth', args: [credentials.token] });
					});

					next.on('message', onMessage);

					next.on('error', () => {
						/* the close handler reconnects */
					});

					next.on('close', () => {
						clearAuthTimer();

						if (socket === next) socket = null;

						// The token may have expired while connected, so always
						// request fresh credentials before the next attempt.
						refreshCredentials = true;

						if (!done) scheduleReconnect();
					});
				} finally {
					connecting = false;
				}
			};

			heartbeat = setInterval(() => {
				if (done) return;

				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					finish();
				}
			}, HEARTBEAT_MS);

			stop = finish;
			request.signal.addEventListener('abort', finish, { once: true });

			void connect();
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
