<script lang="ts">
	import { onMount } from 'svelte';
	import IconMoon from '@tabler/icons-svelte/icons/moon';
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import IconBolt from '@tabler/icons-svelte/icons/bolt';
	import IconShieldCheck from '@tabler/icons-svelte/icons/shield-check';
	import IconPlayerPause from '@tabler/icons-svelte/icons/player-pause';
	import IconPlayerPlay from '@tabler/icons-svelte/icons/player-play';
	import IconPlugConnected from '@tabler/icons-svelte/icons/plug-connected';
	import IconPlugOff from '@tabler/icons-svelte/icons/plug-off';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import IconHandClick from '@tabler/icons-svelte/icons/hand-click';
	import type { PageProps } from './$types';

	type AfkState = {
		enabled: boolean;
		coinsPerMinute: number;
		dailyCapMinutes: number;
		minimumPayoutMinutes: number;
		heartbeatSeconds: number;
		maxHeartbeatGapSeconds: number;
		idleTimeoutSeconds: number;
		requireVisible: boolean;
		requireFocus: boolean;
		requireInteraction: boolean;
		challengeEnabled: boolean;
		challengeWindowSeconds: number;
		dayResetHourUtc: number;
		earnedToday: number;
		remainingMinutes: number;
		pendingSeconds: number;
		nextCreditInSeconds: number;
		totalEarned: number;
		balance: number;
		strikes: number;
		cooldownUntil: string | null;
		serverTime: number;
	};

	type Challenge = {
		id: string;
		kind: string;
		prompt: string;
		options: Array<{ id: string; label: string }>;
		issuedAt: number;
		deadline: number;
		minResponseMs: number;
	};

	type ServerMessage =
		| { type: 'hello'; serverTime: number; sessionId: string; config: unknown; state: AfkState }
		| {
				type: 'tick';
				serverTime: number;
				state: AfkState;
				active?: boolean;
				reason?: string;
				eligibleSeconds?: number;
				awarded?: number;
				payoutMinutes?: number;
				capped?: boolean;
		  }
		| { type: 'challenge'; challenge: Challenge }
		| { type: 'challengeResult'; ok: boolean; reason?: string; message?: string }
		| { type: 'cooldown'; until: string; message?: string }
		| { type: 'paused' | 'resumed'; state: AfkState }
		| { type: 'error'; code: number | string; message: string };

	let { data }: PageProps = $props();

	let current = $state<AfkState>(data.state);
	let stateSyncedAt = $state(Date.now());
	let phase = $state<
		'idle' | 'requesting' | 'connecting' | 'live' | 'paused' | 'challenge' | 'cooldown' | 'disabled' | 'error'
	>('idle');
	let socket: WebSocket | null = null;
	let socketLive = $state(false);
	let socketUrl = $state('');
	let seq = 0;
	let interactions = 0;
	let visible = $state(true);
	let focused = $state(true);
	let paused = $state(false);
	let answering = $state(false);
	let challenge = $state<Challenge | null>(null);
	let notice = $state('');
	let error = $state('');
	let activityReason = $state('');
	let lastSync = $state<Date | null>(null);
	let sessionEarned = $state(0);
	let sessionStarted = $state<Date | null>(null);
	let nowTick = $state(Date.now());
	let reconnectAttempts = 0;
	let manualStop = false;
	let starting = $state(false);
	let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	const applyState = (next: AfkState) => {
		current = next;
		stateSyncedAt = Date.now();
	};

	const cooldownSeconds = $derived(
		current.cooldownUntil
			? Math.max(0, Math.ceil((Date.parse(current.cooldownUntil) - nowTick) / 1000))
			: 0
	);
	const challengeSeconds = $derived(
		challenge ? Math.max(0, Math.ceil((challenge.deadline - nowTick) / 1000)) : 0
	);
	const sessionSeconds = $derived(
		sessionStarted ? Math.max(0, Math.floor((nowTick - sessionStarted.getTime()) / 1000)) : 0
	);
	const capPercent = $derived(
		current.dailyCapMinutes > 0
			? Math.min(100, (current.earnedToday / current.dailyCapMinutes) * 100)
			: 0
	);

	const counting = $derived(
		phase === 'live' &&
			!paused &&
			!challenge &&
			cooldownSeconds <= 0 &&
			(activityReason === 'eligible' || activityReason === '')
	);
	const elapsedSinceSync = $derived(
		counting
			? Math.min(
					Math.max(0, (nowTick - stateSyncedAt) / 1000),
					Math.max(0, current.nextCreditInSeconds)
				)
			: 0
	);
	const nextCreditRemaining = $derived(Math.max(0, current.nextCreditInSeconds - elapsedSinceSync));
	const pendingPercent = $derived(
		current.minimumPayoutMinutes > 0
			? Math.min(
					100,
					((current.pendingSeconds + elapsedSinceSync) / (current.minimumPayoutMinutes * 60)) * 100
				)
			: 0
	);
	const earnedTodayCredits = $derived(current.earnedToday * current.coinsPerMinute);
	const challengeOptions = $derived(challenge?.options ?? []);

	const formatDuration = (totalSeconds: number) => {
		const seconds = Math.max(0, Math.floor(totalSeconds));
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const rest = seconds % 60;

		return hours > 0
			? `${hours}h ${String(minutes).padStart(2, '0')}m`
			: `${minutes}m ${String(rest).padStart(2, '0')}s`;
	};

	const reasonLabel = $derived(
		activityReason === 'hidden'
			? 'Tab hidden — time is not counted'
			: activityReason === 'unfocused'
				? 'Window not focused — time is not counted'
				: activityReason === 'idle'
					? 'No recent interaction — move your mouse or press a key'
					: activityReason === 'challenge'
						? 'Complete the presence check to keep earning'
						: activityReason === 'cooldown'
							? 'Cooldown active — presence checks were missed'
							: activityReason === 'too-soon'
								? 'Sync in progress'
								: activityReason === 'paused'
									? 'Session paused'
									: ''
	);

	const statusText = $derived(
		phase === 'disabled'
			? 'Disabled'
			: phase === 'cooldown'
				? 'Cooldown'
				: phase === 'challenge'
					? 'Presence check'
					: phase === 'paused'
						? 'Paused'
						: phase === 'requesting'
							? 'Starting'
							: phase === 'connecting'
								? 'Connecting'
								: phase === 'error'
									? 'Disconnected'
									: phase === 'live'
										? activityReason === 'eligible' || activityReason === ''
											? 'Earning'
											: 'Connected'
										: 'Idle'
	);

	const statusTone = $derived(
		phase === 'live' && (activityReason === 'eligible' || activityReason === '')
			? 'emerald'
			: phase === 'challenge' || phase === 'cooldown'
				? 'amber'
				: phase === 'error' || phase === 'disabled'
					? 'red'
					: 'slate'
	);

	const heartbeatLabel = $derived(
		current.heartbeatSeconds > 0 ? `${current.heartbeatSeconds}s` : '—'
	);

	const setPresence = () => {
		visible = document.visibilityState === 'visible';
		focused = document.hasFocus();
	};

	const markInteraction = () => {
		interactions = Math.min(1000, interactions + 1);
	};

	const clearTimers = () => {
		if (heartbeatTimer) clearTimeout(heartbeatTimer);
		heartbeatTimer = undefined;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	};

	const scheduleHeartbeat = (delayMs?: number) => {
		if (heartbeatTimer) clearTimeout(heartbeatTimer);

		const interval = Math.max(5, current.heartbeatSeconds || 15) * 1000;
		const jitter = Math.round(interval * (0.94 + Math.random() * 0.12));

		heartbeatTimer = setTimeout(() => {
			sendHeartbeat();
		}, delayMs ?? jitter);
	};

	const sendHeartbeat = () => {
		if (!socket || socket.readyState !== WebSocket.OPEN) return;

		seq += 1;
		socket.send(
			JSON.stringify({
				type: 'heartbeat',
				seq,
				visible,
				focused,
				interactions
			})
		);
		interactions = 0;
		scheduleHeartbeat();
	};

	const handleServerMessage = (message: ServerMessage) => {
		if (message.type === 'hello') {
			applyState(message.state);
			socketUrl = socket?.url ?? socketUrl;
			phase = current.enabled ? 'live' : 'disabled';
			paused = false;
			challenge = null;
			activityReason = '';
			error = '';
			notice = '';
			reconnectAttempts = 0;
			sessionStarted = sessionStarted ?? new Date();
			scheduleHeartbeat(250);
			return;
		}

		if (message.type === 'tick') {
			applyState(message.state);
			lastSync = new Date();
			activityReason = message.reason ?? activityReason;

			if (typeof message.awarded === 'number' && message.awarded > 0) {
				sessionEarned += message.awarded;
				notice = `+${message.awarded} credit(s) added.`;
			}

			if (message.capped) {
				notice = 'Daily AFK limit reached. Time is no longer counted today.';
			}

			if (!current.enabled) {
				phase = 'disabled';
			} else if (cooldownSeconds > 0) {
				phase = 'cooldown';
			} else if (challenge) {
				phase = 'challenge';
			} else if (paused) {
				phase = 'paused';
			} else {
				phase = 'live';
			}
			return;
		}

		if (message.type === 'challenge') {
			challenge = message.challenge;
			answering = false;
			phase = 'challenge';
			activityReason = 'challenge';
			notice = '';
			return;
		}

		if (message.type === 'challengeResult') {
			challenge = null;
			answering = false;
			if (message.ok) {
				notice = message.message ?? 'Presence confirmed.';
				phase = paused ? 'paused' : 'live';
			} else {
				notice = message.message ?? 'Presence check missed.';
				activityReason = 'challenge';
				if (!current.enabled) phase = 'disabled';
				else phase = cooldownSeconds > 0 ? 'cooldown' : 'live';
			}
			return;
		}

		if (message.type === 'cooldown') {
			current = { ...current, cooldownUntil: message.until };
			phase = 'cooldown';
			activityReason = 'cooldown';
			notice = message.message ?? 'AFK earnings are paused.';
			return;
		}

		if (message.type === 'paused') {
			applyState(message.state);
			paused = true;
			challenge = null;
			phase = 'paused';
			activityReason = 'paused';
			return;
		}

		if (message.type === 'resumed') {
			applyState(message.state);
			paused = false;
			phase = 'live';
			activityReason = '';
			notice = 'Session resumed.';
			scheduleHeartbeat(250);
			return;
		}

		if (message.type === 'error') {
			error = message.message;
			if (message.code === 4003 || message.code === 4029) {
				manualStop = true;
				phase = message.code === 4003 ? 'disabled' : 'error';
			}
			return;
		}
	};

	const attachSocket = (url: string) => {
		clearTimers();
		socketUrl = url;
		phase = 'connecting';
		error = '';
		notice = 'Opening AFK socket…';

		const ws = new WebSocket(url);
		socket = ws;

		ws.onopen = () => {
			socketLive = true;
			notice = 'Connected. Waiting for the server handshake…';
		};

		ws.onmessage = (event) => {
			try {
				handleServerMessage(JSON.parse(String(event.data)) as ServerMessage);
			} catch {}
		};

		ws.onerror = () => {
			if (!manualStop) error = 'The AFK socket reported an error.';
		};

		ws.onclose = (event) => {
			if (socket === ws) socket = null;
			socketLive = false;
			clearTimers();

			if (manualStop || event.code === 1000) {
				phase = 'idle';
				challenge = null;
				return;
			}

			if ([4001, 4003, 4029, 1008, 1009].includes(event.code)) {
				phase = event.code === 4003 ? 'disabled' : 'error';
				error = event.reason || 'The AFK session was closed by the server.';
				challenge = null;
				return;
			}

			challenge = null;

			if (current.enabled && reconnectAttempts < 3 && document.visibilityState === 'visible') {
				reconnectAttempts += 1;
				phase = 'connecting';
				notice = `Reconnecting (${reconnectAttempts}/3)…`;
				reconnectTimer = setTimeout(() => {
					void startSession();
				}, 1500 * reconnectAttempts);
				return;
			}

			phase = 'error';
			error = 'The AFK socket disconnected. Press reconnect to continue.';
		};
	};

	const startSession = async () => {
		if (starting) return;
		if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
			return;
		}

		starting = true;
		manualStop = false;
		error = '';
		notice = '';
		phase = 'requesting';

		try {
			const response = await fetch('/api/afk/session', {
				method: 'POST',
				headers: { accept: 'application/json' },
				credentials: 'same-origin'
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				code?: string;
				retryAfter?: number;
				state?: AfkState;
				wsUrl?: string;
			};

			if (!response.ok || !payload.wsUrl) {
				error = payload.error ?? 'Unable to start an AFK session.';
				if (payload.code === 'COOLDOWN' && payload.retryAfter) {
					current = {
						...current,
						cooldownUntil: new Date(Date.now() + payload.retryAfter * 1000).toISOString()
					};
					phase = 'cooldown';
				} else if (response.status === 403) {
					phase = 'disabled';
				} else {
					phase = 'error';
				}
				return;
			}

			if (payload.state) applyState(payload.state);
			seq = 0;
			interactions = 0;
			sessionEarned = 0;
			sessionStarted = new Date();
			attachSocket(payload.wsUrl);
		} catch {
			phase = 'error';
			error = 'Unable to reach the server. Press reconnect to try again.';
		} finally {
			starting = false;
		}
	};

	const stopSession = () => {
		manualStop = true;
		clearTimers();
		if (socket) {
			try {
				socket.close(1000, 'Stopped by user');
			} catch {
				socket = null;
			}
		}
		socket = null;
		socketLive = false;
		challenge = null;
		paused = false;
		phase = 'idle';
		activityReason = '';
		notice = 'Session stopped.';
	};

	const answerChallenge = (optionId: string) => {
		if (!socket || socket.readyState !== WebSocket.OPEN || !challenge || answering) return;

		answering = true;
		socket.send(
			JSON.stringify({
				type: 'answer',
				id: challenge.id,
				option: optionId
			})
		);
	};

	const togglePause = () => {
		if (!socket || socket.readyState !== WebSocket.OPEN) return;

		if (paused) {
			paused = false;
			phase = 'live';
			activityReason = '';
			stateSyncedAt = Date.now();
			socket.send(JSON.stringify({ type: 'resume', visible, focused }));
		} else {
			paused = true;
			challenge = null;
			phase = 'paused';
			activityReason = 'paused';
			socket.send(JSON.stringify({ type: 'pause' }));
		}
	};

	onMount(() => {
		setPresence();

		if (typeof WebSocket === 'undefined') {
			phase = 'error';
			error = 'This browser does not support WebSockets.';
			return;
		}

		const clock = setInterval(() => {
			nowTick = Date.now();
		}, 100);

		const onVisibility = () => {
			setPresence();
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'state', visible, focused }));
			}
		};

		const onFocus = () => {
			setPresence();
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'state', visible, focused }));
			}
		};

		const onBlur = () => {
			setPresence();
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'state', visible, focused }));
			}
		};

		window.addEventListener('pointerdown', markInteraction, { passive: true });
		window.addEventListener('keydown', markInteraction);
		window.addEventListener('touchstart', markInteraction, { passive: true });
		window.addEventListener('wheel', markInteraction, { passive: true });
		window.addEventListener('focus', onFocus);
		window.addEventListener('blur', onBlur);
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			clearInterval(clock);
			manualStop = true;
			clearTimers();
			if (socket) {
				try {
					socket.close(1000, 'Page closed');
				} catch {}
			}
			socket = null;
			window.removeEventListener('pointerdown', markInteraction);
			window.removeEventListener('keydown', markInteraction);
			window.removeEventListener('touchstart', markInteraction);
			window.removeEventListener('wheel', markInteraction);
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('blur', onBlur);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<svelte:head>
	<title>AFK - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-xl font-semibold tracking-tight text-white">AFK Earnings</h1>
				<span
					class="inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase
					{statusTone === 'emerald'
						? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
						: statusTone === 'amber'
							? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
							: statusTone === 'red'
								? 'border-red-500/30 bg-red-500/10 text-red-300'
								: 'border-white/10 bg-white/5 text-white/50'}"
				>
					<span class="relative flex size-1.5">
						{#if statusTone === 'emerald'}
							<span
								class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"
							></span>
						{/if}
						<span
							class="relative inline-flex size-1.5 rounded-full {statusTone === 'emerald'
								? 'bg-emerald-400'
								: statusTone === 'amber'
									? 'bg-amber-300'
									: statusTone === 'red'
										? 'bg-red-400'
										: 'bg-white/40'}"
						></span>
					</span>
					{statusText}
				</span>
			</div>
			<p class="mt-1 max-w-2xl text-sm text-white/50">
				Keep this tab open and focused. Time is counted by the server over a WebSocket, in
				{current.heartbeatSeconds}s heartbeats, and converted to credits every
				{current.minimumPayoutMinutes} minute(s).
			</p>
		</div>
		<div class="flex items-center gap-2 border border-white/10 bg-[#1a1a1a] px-4 py-2">
			<IconCoin class="size-4 text-amber-400" />
			<span class="text-lg font-semibold text-white">{current.balance}</span>
			<span class="text-[10px] tracking-widest text-white/40 uppercase">{data.currency}</span>
		</div>
	</div>

	{#if error}
		<div
			class="flex items-start gap-3 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
			role="alert"
		>
			<IconAlertTriangle class="mt-0.5 size-4 shrink-0" />
			<span>{error}</span>
		</div>
	{/if}

	{#if notice}
		<div
			class="border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200"
			aria-live="polite"
		>
			{notice}
		</div>
	{/if}

	{#if !current.enabled}
		<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			AFK earnings are currently disabled by an administrator.
		</div>
	{/if}

	{#if challenge}
		<section
			class="border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-[#1a1a1a] to-[#1a1a1a] p-5 shadow-2xl shadow-amber-950/20"
			aria-live="assertive"
		>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex items-start gap-3">
					<div
						class="mt-0.5 flex size-9 shrink-0 items-center justify-center border border-amber-400/30 bg-amber-400/10"
					>
						<IconHandClick class="size-5 text-amber-300" />
					</div>
					<div>
						<div class="text-[10px] font-semibold tracking-widest text-amber-300 uppercase">
							Presence check
						</div>
						<h2 class="mt-1 text-lg font-semibold text-white">{challenge.prompt}</h2>
						<p class="mt-1 text-xs text-white/50">
							Answer within {challengeSeconds}s to keep earning. A missed or incorrect
							check pauses the timer and adds a strike.
						</p>
					</div>
				</div>
				<div class="text-right">
					<div class="text-2xl font-semibold text-amber-200">{challengeSeconds}s</div>
					<div class="text-[10px] tracking-widest text-white/35 uppercase">Remaining</div>
				</div>
			</div>

			<div class="mt-4 h-1 w-full overflow-hidden bg-white/5">
				<div
					class="h-full bg-amber-400"
					style="width: {challenge && current.challengeWindowSeconds > 0
						? Math.max(
								0,
								Math.min(
									100,
									((challenge.deadline - nowTick) / 1000 / current.challengeWindowSeconds) * 100
								)
							)
						: 0}%"
				></div>
			</div>

			<div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{#each challengeOptions as option (option.id)}
					<button
						type="button"
						class="border border-white/15 bg-black/25 px-4 py-3 text-sm font-semibold text-white transition hover:border-amber-300/60 hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={answering || challengeSeconds <= 0}
						onclick={() => answerChallenge(option.id)}
					>
						{option.label}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
		<section class="relative overflow-hidden border border-white/10 bg-[#1a1a1a] p-6">
			<div
				class="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-indigo-500/10 blur-3xl"
			></div>
			<div class="relative flex flex-wrap items-start justify-between gap-6">
				<div>
					<div class="flex items-center gap-3">
						<div
							class="flex size-14 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/15 shadow-[0_0_40px_-10px_rgba(99,102,241,0.7)]"
						>
							<IconMoon class="size-7 text-indigo-200" />
						</div>
						<div>
							<div class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
								Session
							</div>
							<div class="mt-0.5 text-lg font-semibold text-white">
								{phase === 'live'
									? 'Earning credits'
									: phase === 'challenge'
										? 'Waiting for you'
										: phase === 'cooldown'
											? `Cooldown · ${formatDuration(cooldownSeconds)}`
											: phase === 'paused'
												? 'Paused'
												: phase === 'connecting' || phase === 'requesting'
													? 'Connecting…'
													: phase === 'error'
														? 'Disconnected'
														: 'Ready when you are'}
							</div>
						</div>
					</div>

					<div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
						<span class="inline-flex items-center gap-1.5">
							<IconClock class="size-3.5" />
							Session {formatDuration(sessionSeconds)}
						</span>
						<span class="inline-flex items-center gap-1.5">
							{#if socketLive}
								<IconPlugConnected class="size-3.5 text-emerald-400" />
								WebSocket live
							{:else}
								<IconPlugOff class="size-3.5 text-white/35" />
								Socket offline
							{/if}
						</span>
						<span class="inline-flex items-center gap-1.5">
							<IconBolt class="size-3.5" />
							{current.coinsPerMinute} credit(s) / minute
						</span>
					</div>

					{#if reasonLabel && phase !== 'challenge'}
						<div class="mt-3 text-xs text-amber-200/80">{reasonLabel}</div>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#if phase === 'idle' || phase === 'error' || phase === 'disabled'}
						<button
							type="button"
							class="inline-flex items-center gap-2 bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!current.enabled || starting}
							onclick={() => void startSession()}
						>
							{#if starting}
								<IconRefresh class="size-4 animate-spin" />
								Starting…
							{:else}
								<IconPlayerPlay class="size-4" />
								Start earning
							{/if}
						</button>
						{#if phase === 'error'}
							<button
								type="button"
								class="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
								onclick={() => void startSession()}
							>
								<IconRefresh class="size-4" />
								Reconnect
							</button>
						{/if}
					{:else}
						<button
							type="button"
							class="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
							onclick={togglePause}
						>
							{#if paused}
								<IconPlayerPlay class="size-4" />
								Resume
							{:else}
								<IconPlayerPause class="size-4" />
								Pause
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-2 border border-red-500/25 px-4 py-2.5 text-sm font-semibold text-red-300/80 transition hover:border-red-500/50 hover:text-red-200"
							onclick={stopSession}
						>
							Stop
						</button>
					{/if}
				</div>
			</div>

			<div class="relative mt-6 grid gap-3 sm:grid-cols-3">
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/35 uppercase">This session</div>
					<div class="mt-1 text-2xl font-semibold text-white">{sessionEarned}</div>
					<div class="mt-0.5 text-[11px] text-white/35">credits earned</div>
				</div>
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/35 uppercase">Next credit</div>
					<div class="mt-1 text-2xl font-semibold text-white tabular-nums">
						{nextCreditRemaining <= 0 ? 'Ready' : `${Math.ceil(nextCreditRemaining)}s`}
					</div>
					<div class="mt-2 h-1 w-full overflow-hidden bg-white/5">
						<div class="h-full bg-indigo-400" style="width: {pendingPercent}%"></div>
					</div>
				</div>
				<div class="border border-white/10 bg-black/20 p-4">
					<div class="text-[10px] tracking-widest text-white/35 uppercase">Last sync</div>
					<div class="mt-1 text-sm font-semibold text-white">
						{lastSync ? lastSync.toLocaleTimeString() : '—'}
					</div>
					<div class="mt-0.5 text-[11px] text-white/35">
						{lastSync ? `${heartbeatLabel} heartbeat` : 'No heartbeat yet'}
					</div>
				</div>
			</div>
		</section>

		<div class="space-y-4">
			<section class="border border-white/10 bg-[#1a1a1a] p-5">
				<div class="flex items-center justify-between">
					<div class="text-[10px] tracking-widest text-white/40 uppercase">Today</div>
					<div class="text-[10px] tracking-widest text-white/30 uppercase">UTC reset</div>
				</div>
				<div class="mt-2 flex items-end justify-between gap-3">
					<div class="text-2xl font-semibold text-white">{earnedTodayCredits}</div>
					<div class="text-right text-xs text-white/40">
						{current.earnedToday} / {current.dailyCapMinutes > 0
							? `${current.dailyCapMinutes} min`
							: 'unlimited'}
					</div>
				</div>
				<div class="mt-3 h-1.5 w-full overflow-hidden bg-white/5">
					<div class="h-full bg-emerald-400" style="width: {capPercent}%"></div>
				</div>
				<div class="mt-2 text-[11px] text-white/35">
					{current.dailyCapMinutes > 0
						? `${current.remainingMinutes} minute(s) remaining today`
						: 'No daily cap is configured'}
				</div>
			</section>

			<section class="border border-white/10 bg-[#1a1a1a] p-5">
				<div class="text-[10px] tracking-widest text-white/40 uppercase">Lifetime</div>
				<div class="mt-2 text-2xl font-semibold text-white">{current.totalEarned}</div>
				<div class="mt-0.5 text-xs text-white/40">credits earned from AFK</div>
				{#if current.strikes > 0}
					<div class="mt-3 border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
						{current.strikes} presence strike(s) recorded.
					</div>
				{/if}
			</section>
		</div>
	</div>

	<div class="flex items-start gap-3 border border-white/10 bg-[#1a1a1a] p-4 text-xs text-white/40">
		<IconMoon class="mt-0.5 size-4 shrink-0" />
		<p>
			AFK is intentionally interactive. Leaving a headless browser or an auto-clicker running
			will fail the presence checks, so keep the tab visible and respond when the panel asks.
		</p>
	</div>
</div>