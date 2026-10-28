import { randomInt } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { evaluateAfkBeat, type AfkActivity } from './eligibility.ts';
import type { AfkConfig } from './config.ts';
import type { AfkState } from './service.ts';
import {
	AFK_WS_PATH,
	hashClientAddress,
	hashUserAgent,
	signInternalRequest,
	verifyAfkTicket,
	type AfkTicket
} from './token.ts';

export type AfkGatewayOptions = {
	secret: string;
	/** Full URL of the HMAC-protected SvelteKit ingest endpoint. */
	internalUrl: string;
	/** Browser origins allowed to open the socket. */
	allowedOrigins?: string[];
	path?: string;
};

type IngestKind = 'start' | 'beat' | 'challenge-pass' | 'challenge-fail' | 'flag' | 'end';

type IngestResponse = {
	state: AfkState;
	config: AfkConfig;
	awarded: number;
	payoutMinutes: number;
	capped: boolean;
};

type ChallengeOption = {
	id: string;
	label: string;
};

type Challenge = {
	id: string;
	kind: 'math' | 'match' | 'sequence';
	prompt: string;
	options: ChallengeOption[];
	answer: string;
	issuedAt: number;
	deadline: number;
	minResponseMs: number;
};

type Connection = {
	id: string;
	userId: string;
	sessionId: string;
	socket: WebSocket;
	ip: string;
	userAgent: string;
	startedAt: number;
	closed: boolean;
	ready: boolean;

	lastBeatAt: number;
	lastSeq: number;
	previous: AfkActivity;
	lastInteractionAt: number;
	eligibleRemainderMs: number;

	paused: boolean;
	cooldownUntil: number;
	challenge: Challenge | null;
	challengeTimer?: ReturnType<typeof setTimeout>;
	challengeDeadlineTimer?: ReturnType<typeof setTimeout>;
	nextChallengeTimer?: ReturnType<typeof setTimeout>;
	pendingBeat: boolean;

	config: AfkConfig;
	state: AfkState;

	messageWindowStart: number;
	messageCount: number;
	heartbeatIntervals: number[];
	suspicion: number;
	flaggedRegularity: boolean;
	fastAnswers: number;

	alive: boolean;
	pingTimer?: ReturnType<typeof setInterval>;
};

type ClientMessage =
	| {
			type: 'heartbeat';
			seq: number;
			visible?: boolean;
			focused?: boolean;
			interactions?: number;
	  }
	| { type: 'answer'; id: string; option: string }
	| { type: 'pause' }
	| { type: 'resume'; visible?: boolean; focused?: boolean }
	| { type: 'state'; visible?: boolean; focused?: boolean };

const MAX_MESSAGE_BYTES = 8 * 1024;
const MAX_MESSAGES_PER_WINDOW = 24;
const MESSAGE_WINDOW_MS = 10_000;
const MAX_INTERACTIONS_PER_BEAT = 240;
const PING_INTERVAL_MS = 30_000;

const nowMs = () => Date.now();

const timer = (fn: () => void, delayMs: number) => {
	const handle = setTimeout(fn, Math.max(0, delayMs));
	handle.unref?.();
	return handle;
};

const interval = (fn: () => void, delayMs: number) => {
	const handle = setInterval(fn, Math.max(1, delayMs));
	handle.unref?.();
	return handle;
};

const randomBetween = (min: number, max: number) => {
	const low = Math.ceil(Math.min(min, max));
	const high = Math.floor(Math.max(min, max));

	return randomInt(low, high + 1);
};

const shuffle = <T>(values: T[]): T[] => {
	const copy = [...values];

	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = randomInt(index + 1);
		const value = copy[index]!;
		copy[index] = copy[swap]!;
		copy[swap] = value;
	}

	return copy;
};

const optionId = () => randomInt(0, 0x7fffffff).toString(36);

const uniqueDistractors = (answer: number, count: number) => {
	const values = new Set<number>();
	const candidates = [
		answer + 1,
		answer - 1,
		answer + 2,
		answer - 2,
		answer + 3,
		answer - 3,
		answer + 4,
		answer + 5,
		answer - 4,
		answer * 2,
		Math.max(1, answer - 5)
	];

	for (const candidate of candidates) {
		if (values.size >= count) break;
		if (candidate !== answer && candidate > 0) values.add(candidate);
	}

	let offset = 6;

	while (values.size < count) {
		values.add(Math.max(1, answer + offset));
		offset += 1;
	}

	return [...values].slice(0, count);
};

const createChallenge = (config: AfkConfig): Challenge => {
	const kind = (['math', 'match', 'sequence'] as const)[randomInt(3)]!;
	const minResponseMs = config.challengeMinResponseMs;
	const issuedAt = nowMs();
	const deadline = issuedAt + config.challengeWindowSeconds * 1000;

	if (kind === 'math') {
		const first = randomInt(2, 13);
		const second = randomInt(2, 13);
		const subtract = randomInt(2) === 0 && first > second;
		const answer = subtract ? first - second : first + second;
		const labels = shuffle([
			String(answer),
			...uniqueDistractors(answer, 3).map(String)
		]);
		const options = labels.map((label) => ({ id: optionId(), label }));
		const correct = options.find((option) => option.label === String(answer))!;
		const symbol = subtract ? '−' : '+';

		return {
			id: optionId(),
			kind,
			prompt: `What is ${first} ${symbol} ${second}?`,
			options,
			answer: correct.id,
			issuedAt,
			deadline,
			minResponseMs
		};
	}

	if (kind === 'sequence') {
		const start = randomInt(1, 10);
		const step = randomInt(2, 6);
		const answer = start + step * 3;
		const labels = shuffle([
			String(answer),
			...uniqueDistractors(answer, 3).map(String)
		]);
		const options = labels.map((label) => ({ id: optionId(), label }));
		const correct = options.find((option) => option.label === String(answer))!;

		return {
			id: optionId(),
			kind,
			prompt: `What comes next? ${start}, ${start + step}, ${start + step * 2}, …`,
			options,
			answer: correct.id,
			issuedAt,
			deadline,
			minResponseMs
		};
	}

	const shapes = [
		{ key: 'moon', label: 'Moon' },
		{ key: 'star', label: 'Star' },
		{ key: 'sun', label: 'Sun' },
		{ key: 'cloud', label: 'Cloud' },
		{ key: 'bolt', label: 'Bolt' },
		{ key: 'heart', label: 'Heart' }
	];
	const picked = shuffle(shapes).slice(0, 4);
	const target = picked[randomInt(picked.length)]!;
	const options = picked.map((shape) => ({ id: optionId(), label: shape.label }));
	const correct = options.find((option) => option.label === target.label)!;

	return {
		id: optionId(),
		kind,
		prompt: `Select ${target.label}`,
		options,
		answer: correct.id,
		issuedAt,
		deadline,
		minResponseMs
	};
};

const publicChallenge = (challenge: Challenge) => ({
	id: challenge.id,
	kind: challenge.kind,
	prompt: challenge.prompt,
	options: challenge.options,
	issuedAt: challenge.issuedAt,
	deadline: challenge.deadline,
	minResponseMs: challenge.minResponseMs
});

const send = (connection: Connection, payload: Record<string, unknown>) => {
	if (connection.closed || connection.socket.readyState !== WebSocket.OPEN) return;

	try {
		connection.socket.send(JSON.stringify(payload));
	} catch {
		/* The close handler will clean up. */
	}
};

const close = (connection: Connection, code: number, reason: string) => {
	if (connection.closed) return;

	send(connection, { type: 'error', code, message: reason });

	connection.closed = true;
	connection.ready = false;
	connection.challenge = null;

	if (connection.challengeTimer) clearTimeout(connection.challengeTimer);
	if (connection.challengeDeadlineTimer) clearTimeout(connection.challengeDeadlineTimer);
	if (connection.nextChallengeTimer) clearTimeout(connection.nextChallengeTimer);
	if (connection.pingTimer) clearInterval(connection.pingTimer);

	try {
		connection.socket.close(code, reason.slice(0, 120));
	} catch {
		connection.socket.terminate();
	}
};

/**
 * Mirrors SvelteKit's `getClientAddress()` so the address hashed into the
 * session ticket matches the address seen at upgrade time. `x-forwarded-for`
 * is only trusted when the deployment explicitly opts in through
 * `ADDRESS_HEADER`, otherwise a client could spoof it and dodge per-IP caps.
 */
const clientIp = (request: IncomingMessage) => {
	const addressHeader = process.env.ADDRESS_HEADER?.trim().toLowerCase();

	if (addressHeader) {
		const value = request.headers[addressHeader];

		if (typeof value === 'string' && value.length > 0) {
			if (addressHeader === 'x-forwarded-for') {
				const depth = Math.max(1, Math.floor(Number(process.env.XFF_DEPTH) || 1));
				const chain = value
					.split(',')
					.map((part) => part.trim())
					.filter(Boolean)
					.reverse();

				return chain[depth - 1] ?? chain[0] ?? 'unknown';
			}

			return value;
		}
	}

	return request.socket.remoteAddress ?? 'unknown';
};

const clientUserAgent = (request: IncomingMessage) =>
	typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';

const postIngest = async (
	options: AfkGatewayOptions,
	connection: Pick<Connection, 'userId' | 'sessionId' | 'ip' | 'userAgent'>,
	kind: IngestKind,
	seq: number,
	seconds = 0,
	meta?: Record<string, unknown>
): Promise<IngestResponse> => {
	const includeClient = kind === 'start' || kind === 'end';
	const body = JSON.stringify({
		userId: connection.userId,
		sessionId: connection.sessionId,
		seq,
		kind,
		seconds,
		...(includeClient ? { ip: connection.ip, userAgent: connection.userAgent } : {}),
		...(meta ? { meta } : {})
	});

	let lastError: unknown;

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const timestamp = nowMs();
		const signature = signInternalRequest(options.secret, timestamp, body);

		try {
			const response = await fetch(options.internalUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-afk-timestamp': String(timestamp),
					'x-afk-signature': signature.signature
				},
				body,
				signal: AbortSignal.timeout(10_000)
			});

			const rawBody = await response.text();
			let payload: IngestResponse | null = null;

			try {
				payload = rawBody ? (JSON.parse(rawBody) as IngestResponse) : null;
			} catch {
				payload = null;
			}

			if (response.ok && payload) {
				return payload;
			}

			lastError = new Error(
				`AFK ingest failed with ${response.status}${rawBody ? `: ${rawBody.slice(0, 160)}` : ''}`
			);

			if (response.status < 500 && response.status !== 429) break;
		} catch (cause) {
			lastError = cause;
		}

		if (attempt < 2) {
			await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
		}
	}

	throw lastError instanceof Error ? lastError : new Error('AFK ingest failed.');
};

const removeFromIndex = (
	connection: Connection,
	byUser: Map<string, Connection>,
	byIp: Map<string, Set<Connection>>
) => {
	if (byUser.get(connection.userId) === connection) byUser.delete(connection.userId);

	const bucket = byIp.get(connection.ip);
	if (bucket) {
		bucket.delete(connection);
		if (bucket.size === 0) byIp.delete(connection.ip);
	}
};

export type AfkGateway = {
	close: () => Promise<void>;
};

/**
 * Attaches the AFK WebSocket gateway to an existing HTTP server. This is the
 * same port and process as SvelteKit: there is no second server to deploy.
 */
export const attachAfkGateway = (
	httpServer: HttpServer,
	options: AfkGatewayOptions
): AfkGateway => {
	const path = options.path ?? AFK_WS_PATH;
	const allowedOrigins = new Set(
		(options.allowedOrigins ?? []).map((origin) => {
			try {
				return new URL(origin).origin;
			} catch {
				return origin;
			}
		})
	);

	const wss = new WebSocketServer({
		noServer: true,
		clientTracking: false,
		perMessageDeflate: false,
		maxPayload: MAX_MESSAGE_BYTES
	});

	const byUser = new Map<string, Connection>();
	const byIp = new Map<string, Set<Connection>>();
	const usedTickets = new Map<string, number>();

	const ticketSweep = interval(() => {
		const now = nowMs();
		for (const [nonce, expiresAt] of usedTickets) {
			if (expiresAt <= now) usedTickets.delete(nonce);
		}
	}, 60_000);

	const updateConnectionFromResponse = (connection: Connection, response: IngestResponse) => {
		connection.config = response.config;
		connection.state = response.state;
		connection.cooldownUntil = response.state.cooldownUntil
			? Date.parse(response.state.cooldownUntil)
			: 0;
	};

	const scheduleChallenge = (connection: Connection, delaySeconds?: number) => {
		if (connection.nextChallengeTimer) clearTimeout(connection.nextChallengeTimer);
		connection.nextChallengeTimer = undefined;

		if (connection.closed || !connection.config.challengeEnabled || !connection.config.enabled) {
			return;
		}

		const cooldownRemaining = connection.cooldownUntil - nowMs();
		const delayMs =
			typeof delaySeconds === 'number'
				? delaySeconds * 1000
				: randomBetween(
						connection.config.challengeMinSeconds,
						connection.config.challengeMaxSeconds
					) * 1000;

		connection.nextChallengeTimer = timer(
			() => {
				connection.nextChallengeTimer = undefined;
				issueChallenge(connection);
			},
			Math.max(delayMs, cooldownRemaining > 0 ? cooldownRemaining + 1_000 : 0)
		);
	};

	const issueChallenge = (connection: Connection) => {
		if (connection.closed || !connection.ready) return;
		if (!connection.config.enabled || !connection.config.challengeEnabled || connection.paused) {
			scheduleChallenge(connection, 15);
			return;
		}
		if (connection.cooldownUntil > nowMs()) {
			scheduleChallenge(connection, Math.ceil((connection.cooldownUntil - nowMs()) / 1000) + 2);
			return;
		}
		if (connection.challenge) return;

		connection.challenge = createChallenge(connection.config);
		send(connection, { type: 'challenge', challenge: publicChallenge(connection.challenge) });

		connection.challengeDeadlineTimer = timer(
			() => failChallenge(connection, 'timeout'),
			connection.config.challengeWindowSeconds * 1000 + 250
		);
	};

	const clearChallenge = (connection: Connection) => {
		connection.challenge = null;
		if (connection.challengeDeadlineTimer) clearTimeout(connection.challengeDeadlineTimer);
		connection.challengeDeadlineTimer = undefined;
	};

	const noteSuspicion = (connection: Connection, points: number, reason: string) => {
		connection.suspicion += points;

		if (connection.suspicion >= 5) {
			connection.suspicion = 0;
			void postIngest(options, connection, 'flag', connection.lastSeq, 0, { reason }).catch(
				() => undefined
			);
			if (!connection.challenge) issueChallenge(connection);
			return;
		}

		if (connection.suspicion >= 2 && !connection.challenge) {
			issueChallenge(connection);
		}
	};

	const failChallenge = async (connection: Connection, reason: string) => {
		const challenge = connection.challenge;
		if (!challenge || connection.closed) return;

		clearChallenge(connection);
		send(connection, {
			type: 'challengeResult',
			ok: false,
			reason,
			message:
				reason === 'too-fast'
					? 'That was too fast. Slow down and complete the next check.'
					: 'Presence check missed. Earnings are paused until the next check.'
		});

		try {
			const response = await postIngest(
				options,
				connection,
				'challenge-fail',
				connection.lastSeq,
				0,
				{ reason }
			);
			updateConnectionFromResponse(connection, response);
			send(connection, { type: 'tick', serverTime: nowMs(), state: response.state });

			if (connection.cooldownUntil > nowMs()) {
				send(connection, {
					type: 'cooldown',
					until: new Date(connection.cooldownUntil).toISOString(),
					message: 'Too many presence checks were missed. AFK earnings are paused.'
				});
			}
		} catch {
			send(connection, {
				type: 'error',
				code: 1011,
				message: 'Unable to record the presence check. Retrying shortly.'
			});
		}

		scheduleChallenge(connection);
	};

	const answerChallenge = async (connection: Connection, message: ClientMessage) => {
		if (message.type !== 'answer' || connection.closed) return;

		const challenge = connection.challenge;
		if (!challenge || challenge.id !== message.id) return;

		const now = nowMs();
		const elapsed = now - challenge.issuedAt;

		if (now > challenge.deadline) {
			await failChallenge(connection, 'timeout');
			return;
		}

		if (elapsed < challenge.minResponseMs) {
			noteSuspicion(connection, 2, 'challenge-too-fast');
			await failChallenge(connection, 'too-fast');
			return;
		}

		if (message.option !== challenge.answer) {
			await failChallenge(connection, 'incorrect');
			return;
		}

		clearChallenge(connection);
		connection.lastInteractionAt = now;

		if (elapsed < challenge.minResponseMs + 120) {
			connection.fastAnswers += 1;
			if (connection.fastAnswers >= 3) {
				connection.fastAnswers = 0;
				noteSuspicion(connection, 3, 'challenge-answers-too-fast');
			}
		} else {
			connection.fastAnswers = 0;
		}

		send(connection, { type: 'challengeResult', ok: true, message: 'Presence confirmed.' });

		try {
			const response = await postIngest(
				options,
				connection,
				'challenge-pass',
				connection.lastSeq
			);
			updateConnectionFromResponse(connection, response);
			send(connection, { type: 'tick', serverTime: nowMs(), state: response.state });
		} catch {
			/* A missed pass is harmless; the next beat refreshes state. */
		}

		scheduleChallenge(connection);
	};

	const handleBeat = async (
		connection: Connection,
		message: Extract<ClientMessage, { type: 'heartbeat' }>
	) => {
		if (connection.closed || !connection.ready || connection.pendingBeat) return;

		const seq = Number(message.seq);
		if (!Number.isInteger(seq) || seq <= connection.lastSeq) {
			noteSuspicion(connection, 1, 'bad-sequence');
			return;
		}

		const config = connection.config;
		const now = nowMs();

		if (connection.lastBeatAt === 0) {
			connection.lastBeatAt = now;
			connection.lastSeq = seq;
			connection.previous = {
				visible: message.visible === true,
				focused: message.focused === true
			};
			connection.lastInteractionAt =
				Number(message.interactions) > 0 ? now : connection.lastInteractionAt;
			send(connection, {
				type: 'tick',
				serverTime: now,
				state: connection.state,
				active: false,
				reason: 'starting',
				eligibleSeconds: 0,
				awarded: 0,
				payoutMinutes: 0,
				capped: false
			});
			return;
		}

		const gapSeconds = Math.max(0, (now - connection.lastBeatAt) / 1000);
		const current: AfkActivity = {
			visible: message.visible === true,
			focused: message.focused === true
		};
		const interactions = Math.max(
			0,
			Math.min(MAX_INTERACTIONS_PER_BEAT, Math.floor(Number(message.interactions) || 0))
		);

		if (interactions > 0) {
			connection.lastInteractionAt = now;
		}
		if (interactions > 160) {
			noteSuspicion(connection, 2, 'implausible-interactions');
		}

		if (config.requireInteraction && connection.lastBeatAt > 0) {
			connection.heartbeatIntervals.push(gapSeconds);
			if (connection.heartbeatIntervals.length > 12) connection.heartbeatIntervals.shift();

			if (!connection.flaggedRegularity && connection.heartbeatIntervals.length >= 10) {
				const values = connection.heartbeatIntervals;
				const average = values.reduce((total, value) => total + value, 0) / values.length;
				const variance =
					values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
				const deviation = Math.sqrt(variance);

				if (average > 0 && deviation < 0.03) {
					connection.flaggedRegularity = true;
					connection.suspicion += 1;
					if (!connection.challenge) issueChallenge(connection);
				}
			}
		}

		const beat = evaluateAfkBeat({
			now,
			gapSeconds,
			previous: connection.previous,
			current,
			interactions,
			lastInteractionAt: connection.lastInteractionAt,
			paused: connection.paused,
			challengePending: connection.challenge !== null,
			cooldownUntil: connection.cooldownUntil,
			config
		});

		connection.lastBeatAt = now;
		connection.lastSeq = seq;
		connection.previous = current;

		if (connection.challenge && now > connection.challenge.deadline) {
			void failChallenge(connection, 'timeout');
		}

		if (!beat.eligible) {
			send(connection, {
				type: 'tick',
				serverTime: now,
				state: connection.state,
				active: false,
				reason: beat.reason,
				eligibleSeconds: 0,
				awarded: 0,
				payoutMinutes: 0,
				capped: false
			});
			return;
		}

		connection.eligibleRemainderMs += beat.seconds * 1000;
		const wholeSeconds = Math.floor(connection.eligibleRemainderMs / 1000);
		connection.eligibleRemainderMs -= wholeSeconds * 1000;

		if (wholeSeconds <= 0) {
			send(connection, {
				type: 'tick',
				serverTime: now,
				state: connection.state,
				active: true,
				reason: 'eligible',
				eligibleSeconds: 0,
				awarded: 0,
				payoutMinutes: 0,
				capped: false
			});
			return;
		}

		connection.pendingBeat = true;

		try {
			const response = await postIngest(
				options,
				connection,
				'beat',
				seq,
				wholeSeconds
			);
			updateConnectionFromResponse(connection, response);

			if (!response.config.enabled) {
				send(connection, {
					type: 'error',
					code: 4033,
					message: 'AFK earning was disabled by an administrator.'
				});
				close(connection, 4003, 'AFK earning disabled');
				return;
			}

			send(connection, {
				type: 'tick',
				serverTime: now,
				state: response.state,
				active: response.config.enabled,
				reason: 'eligible',
				eligibleSeconds: wholeSeconds,
				awarded: response.awarded,
				payoutMinutes: response.payoutMinutes,
				capped: response.capped
			});
		} catch {
			send(connection, {
				type: 'error',
				code: 1011,
				message: 'Unable to save this AFK interval. The next heartbeat will retry.'
			});
		} finally {
			connection.pendingBeat = false;
		}
	};

	const handleConnection = async (
		socket: WebSocket,
		request: IncomingMessage,
		ticket: AfkTicket,
		ip: string,
		userAgent: string
	) => {
		const connection: Connection = {
			id: crypto.randomUUID(),
			userId: ticket.uid,
			sessionId: ticket.sid,
			socket,
			ip,
			userAgent,
			startedAt: nowMs(),
			closed: false,
			ready: false,
			lastBeatAt: 0,
			lastSeq: 0,
			previous: { visible: true, focused: true },
			lastInteractionAt: nowMs(),
			eligibleRemainderMs: 0,
			paused: false,
			cooldownUntil: 0,
			challenge: null,
			config: {} as AfkConfig,
			state: {} as AfkState,
			messageWindowStart: nowMs(),
			messageCount: 0,
			heartbeatIntervals: [],
			suspicion: 0,
			flaggedRegularity: false,
			fastAnswers: 0,
			pendingBeat: false,
			alive: true
		};

		connection.pingTimer = interval(() => {
			if (!connection.alive) {
				close(connection, 4000, 'Connection timed out');
				return;
			}

			connection.alive = false;
			try {
				connection.socket.ping();
			} catch {
				/* Ignore: close handler cleans up. */
			}
		}, PING_INTERVAL_MS);

		socket.on('pong', () => {
			connection.alive = true;
		});

		socket.on('message', (raw) => {
			if (connection.closed) return;

			const now = nowMs();
			if (now - connection.messageWindowStart > MESSAGE_WINDOW_MS) {
				connection.messageWindowStart = now;
				connection.messageCount = 0;
			}
			connection.messageCount += 1;
			if (connection.messageCount > MAX_MESSAGES_PER_WINDOW) {
				noteSuspicion(connection, 5, 'message-flood');
				close(connection, 1008, 'Too many messages');
				return;
			}

			const payload = Array.isArray(raw)
				? Buffer.concat(raw)
				: raw instanceof ArrayBuffer
					? Buffer.from(raw)
					: raw;

			if (payload.length > MAX_MESSAGE_BYTES) {
				close(connection, 1009, 'Message too large');
				return;
			}

			let text: string;
			try {
				text = payload.toString('utf8');
			} catch {
				return;
			}

			if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) {
				close(connection, 1009, 'Message too large');
				return;
			}

			let message: ClientMessage;
			try {
				message = JSON.parse(text) as ClientMessage;
			} catch {
				return;
			}

			if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

			if (message.type === 'heartbeat') {
				void handleBeat(connection, message);
				return;
			}

			if (message.type === 'answer') {
				void answerChallenge(connection, message);
				return;
			}

			if (message.type === 'pause') {
				if (!connection.ready) return;
				connection.paused = true;
				connection.lastBeatAt = nowMs();
				clearChallenge(connection);
				if (connection.nextChallengeTimer) clearTimeout(connection.nextChallengeTimer);
				connection.nextChallengeTimer = undefined;
				send(connection, { type: 'paused', state: connection.state });
				return;
			}

			if (message.type === 'resume') {
				if (!connection.ready) return;
				connection.paused = false;
				connection.lastBeatAt = nowMs();
				connection.previous = {
					visible: message.visible !== false,
					focused: message.focused !== false
				};
				send(connection, { type: 'resumed', state: connection.state });
				scheduleChallenge(connection);
				return;
			}

			if (message.type === 'state') {
				// Heartbeats are authoritative; this message only lets the UI report
				// blur/visibility changes early. It never awards time on its own.
				return;
			}
		});

		socket.on('close', () => {
			if (connection.closed) {
				connection.closed = true;
			}
			if (connection.pingTimer) clearInterval(connection.pingTimer);
			if (connection.challengeTimer) clearTimeout(connection.challengeTimer);
			if (connection.challengeDeadlineTimer) clearTimeout(connection.challengeDeadlineTimer);
			if (connection.nextChallengeTimer) clearTimeout(connection.nextChallengeTimer);
			removeFromIndex(connection, byUser, byIp);
			void postIngest(options, connection, 'end', connection.lastSeq).catch(() => undefined);
		});

		socket.on('error', () => {
			// The close handler performs cleanup.
		});

		try {
			const started = await postIngest(options, connection, 'start', 0);
			updateConnectionFromResponse(connection, started);

			if (
				started.config.bindSessionToIp &&
				ticket.iph &&
				ticket.iph !== hashClientAddress(ip)
			) {
				close(connection, 4003, 'This session ticket belongs to a different network.');
				return;
			}

			if (
				started.config.bindSessionToUserAgent &&
				ticket.uah &&
				ticket.uah !== hashUserAgent(userAgent)
			) {
				close(connection, 4003, 'This session ticket belongs to a different browser.');
				return;
			}

			const previousConnection = byUser.get(connection.userId);
			if (previousConnection && previousConnection !== connection) {
				close(previousConnection, 4001, 'A newer AFK session was opened.');
				byUser.delete(connection.userId);
			}

			const ipSessions = byIp.get(connection.ip) ?? new Set<Connection>();
			if (ipSessions.size >= started.config.maxSessionsPerIp) {
				close(connection, 4029, 'Too many AFK sessions from this network.');
				return;
			}

			byUser.set(connection.userId, connection);
			ipSessions.add(connection);
			byIp.set(connection.ip, ipSessions);

			connection.state = started.state;
			connection.config = started.config;
			connection.cooldownUntil = started.state.cooldownUntil
				? Date.parse(started.state.cooldownUntil)
				: 0;
			connection.ready = true;

			send(connection, {
				type: 'hello',
				serverTime: nowMs(),
				sessionId: connection.sessionId,
				config: started.config.public,
				state: started.state
			});

			if (!started.config.enabled) {
				close(connection, 4003, 'AFK earning is currently disabled.');
				return;
			}

			if (connection.cooldownUntil > nowMs()) {
				send(connection, {
					type: 'cooldown',
					until: new Date(connection.cooldownUntil).toISOString(),
					message: 'AFK earnings are paused after missed presence checks.'
				});
			}

			scheduleChallenge(connection);
		} catch (cause) {
			console.error('[afk] Unable to start WebSocket session.', cause);
			close(connection, 1011, 'AFK service is unavailable. Please try again.');
		}
	};

	const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		let url: URL;

		try {
			url = new URL(request.url ?? '/', 'http://localhost');
		} catch {
			socket.destroy();
			return;
		}

		if (url.pathname !== path) return;

		const originHeader = request.headers.origin;
		if (typeof originHeader === 'string') {
			let origin: URL;

			try {
				origin = new URL(originHeader);
			} catch {
				socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
				socket.destroy();
				return;
			}

			const allowed =
				allowedOrigins.size > 0
					? allowedOrigins.has(origin.origin)
					: // With no explicit allow-list, fall back to same-origin.
						typeof request.headers.host === 'string' &&
						origin.host === request.headers.host;

			if (!allowed) {
				socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
				socket.destroy();
				return;
			}
		}

		const ticketToken = url.searchParams.get('ticket');
		if (!ticketToken) {
			socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}

		const ticket = verifyAfkTicket(options.secret, ticketToken);
		if (!ticket) {
			socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}

		const alreadyUsed = usedTickets.has(ticket.nonce);
		if (alreadyUsed) {
			socket.write('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}

		usedTickets.set(ticket.nonce, ticket.exp);

		const ip = clientIp(request);
		const userAgent = clientUserAgent(request);

		wss.handleUpgrade(request, socket, head, (webSocket) => {
			void handleConnection(webSocket, request, ticket, ip, userAgent);
		});
	};

	httpServer.on('upgrade', onUpgrade);

	const onClose = () => {
		clearInterval(ticketSweep);
		byUser.clear();
		byIp.clear();
		usedTickets.clear();
		wss.close();
	};

	httpServer.once('close', onClose);

	return {
		close: async () => {
			httpServer.off('upgrade', onUpgrade);
			httpServer.off('close', onClose);
			onClose();
		}
	};
};
