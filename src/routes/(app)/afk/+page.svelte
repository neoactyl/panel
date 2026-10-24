<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import IconMoon from '@tabler/icons-svelte/icons/moon';
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let current = $state(untrack(() => data.state));
	let awarded = $state(0);
	let active = $state(true);
	let busy = $state(false);
	let error = $state('');
	let lastPing: Date | null = $state(null);

	const ping = async () => {
		if (busy) return;
		busy = true;

		try {
			const response = await fetch('?/ping', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData()
			});
			const result = (await response.json()) as {
				type: string;
				data?: { state?: typeof current; awarded?: number; error?: string };
			};

			if (result.type === 'success' && result.data?.state) {
				current = result.data.state;
				awarded = result.data.awarded ?? 0;
				error = '';
				lastPing = new Date();
			} else {
				error = result.data?.error ?? 'Unable to record this session.';
			}
		} catch {
			error = 'Unable to reach the server. Retrying shortly.';
		} finally {
			busy = false;
		}
	};

	onMount(() => {
		void ping();
		const timer = setInterval(() => {
			if (active) void ping();
		}, 20_000);

		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>AFK - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-white">AFK Earnings</h1>
			<p class="mt-1 text-sm text-white/50">
				Keep this tab open to earn {data.state.coinsPerMinute} credit(s) per minute, up to
				{data.state.dailyCapMinutes} minutes per day.
			</p>
		</div>
		<div class="flex items-center gap-2 border border-white/10 bg-[#1a1a1a] px-4 py-2">
			<IconCoin class="size-4 text-amber-400" />
			<span class="text-lg font-semibold text-white">{current.balance}</span>
			<span class="text-[10px] tracking-widest text-white/40 uppercase">Credits</span>
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Status</div>
			<div class="mt-2 flex items-center gap-2">
				<span class="relative flex size-2.5">
					{#if active && current.enabled}
						<span
							class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"
						></span>
					{/if}
					<span
						class="relative inline-flex size-2.5 rounded-full {active && current.enabled
							? 'bg-emerald-500'
							: 'bg-white/30'}"
					></span>
				</span>
				<span class="text-sm text-white">
					{current.enabled ? (active ? 'Earning' : 'Paused') : 'Disabled'}
				</span>
			</div>
			<button
				type="button"
				class="mt-4 w-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white disabled:opacity-40"
				disabled={!current.enabled}
				onclick={() => (active = !active)}
			>
				{active ? 'Pause session' : 'Resume session'}
			</button>
		</div>

		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Earned today</div>
			<div class="mt-2 text-2xl font-semibold text-white">
				{current.earnedToday * current.coinsPerMinute}
			</div>
			<div class="mt-1 text-xs text-white/40">
				{current.earnedToday} / {current.dailyCapMinutes} minutes used
			</div>
			<div class="mt-3 h-1 w-full bg-white/5">
				<div
					class="h-full bg-indigo-500"
					style="width: {current.dailyCapMinutes
						? Math.min(100, (current.earnedToday / current.dailyCapMinutes) * 100)
						: 0}%"
				></div>
			</div>
		</div>

		<div class="border border-white/10 bg-[#1a1a1a] p-5">
			<div class="text-[10px] tracking-widest text-white/40 uppercase">Lifetime earned</div>
			<div class="mt-2 text-2xl font-semibold text-white">{current.totalEarned}</div>
			<div class="mt-1 text-xs text-white/40">
				{current.remainingMinutes} minutes remaining today
			</div>
			{#if lastPing}
				<div class="mt-3 text-[10px] tracking-widest text-white/30 uppercase">
					Synced {lastPing.toLocaleTimeString()}
				</div>
			{/if}
		</div>
	</div>

	{#if awarded > 0}
		<div
			class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
		>
			<IconCoin class="mr-2 inline size-4" />
			You earned {awarded} credit(s) from this session.
		</div>
	{/if}

	{#if error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
			{error}
		</div>
	{/if}

	{#if !current.enabled}
		<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			AFK earnings are currently disabled by the administrator.
		</div>
	{/if}

	<div class="flex items-start gap-3 border border-white/10 bg-[#1a1a1a] p-4 text-xs text-white/40">
		<IconMoon class="mt-0.5 size-4 shrink-0" />
		<p>
			The timer only counts while this page is open and active. Closing the page stops your
			session immediately. Forms without JavaScript can still submit a single ping below.
		</p>
	</div>

	<form method="POST" action="?/ping">
		<button
			type="submit"
			class="border border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
		>
			Record session now
		</button>
	</form>
</div>
