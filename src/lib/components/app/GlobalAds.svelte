<script lang="ts">
	import IconSpeakerphone from '@tabler/icons-svelte/icons/speakerphone';
	import IconChevronDown from '@tabler/icons-svelte/icons/chevron-down';
	import IconChevronUp from '@tabler/icons-svelte/icons/chevron-up';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconRefresh from '@tabler/icons-svelte/icons/refresh';

	type Ad = { id: string; label: string; width: number; height: number };
	type ProbeResult = 'pending' | 'ok' | 'blocked';

	let { ads }: { ads: Ad[] } = $props();

	let index = $state(0);
	let collapsed = $state(false);
	let reloadKey = $state(0);

	// Anti-adblock state.
	let bait = $state<HTMLDivElement | null>(null);
	let modal = $state<HTMLDivElement | null>(null);
	let baitHidden = $state(false);
	let baitChecked = $state(false);
	let probeResult = $state<ProbeResult>('pending');
	let checking = $state(true);
	let blocked = $state(false);
	let started = false;

	const current = $derived(ads[index % ads.length] ?? null);

	const baitIsHidden = () => {
		if (!bait) return false;

		const style = getComputedStyle(bait);

		return (
			bait.offsetWidth === 0 ||
			bait.offsetHeight === 0 ||
			style.display === 'none' ||
			style.visibility === 'hidden'
		);
	};

	const evaluate = () => {
		if (ads.length === 0) {
			checking = false;
			blocked = false;
			return;
		}

		if (!checking || !baitChecked || probeResult === 'pending') return;

		blocked = baitHidden || probeResult === 'blocked';
		checking = false;
	};

	const runProbe = () => {
		probeResult = 'pending';

		const image = new Image();
		let settled = false;

		const settle = (result: Exclude<ProbeResult, 'pending'>) => {
			if (settled) return;
			settled = true;
			probeResult = result;
			evaluate();
		};

		image.onload = () => settle('ok');
		image.onerror = () => settle('blocked');
		image.src = `/ads/tracker.gif?cb=${Date.now()}-${Math.random().toString(36).slice(2)}`;

		window.setTimeout(() => settle('blocked'), 4000);
	};

	const runDetection = (keepBlocked = false) => {
		checking = true;
		if (!keepBlocked) blocked = false;
		baitChecked = false;
		baitHidden = false;
		probeResult = 'pending';

		window.setTimeout(() => {
			baitHidden = baitIsHidden();
			baitChecked = true;
			evaluate();
		}, 700);

		runProbe();
	};

	const retry = () => {
		reloadKey += 1;
		runDetection(true);
	};

	$effect(() => {
		if (ads.length === 0) {
			started = false;
			checking = false;
			blocked = false;
			return;
		}

		if (started) return;
		started = true;
		runDetection();
	});

	$effect(() => {
		if (ads.length < 2) return;

		const timer = setInterval(() => (index = (index + 1) % ads.length), 60_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!blocked) return;

		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const blockInteraction = (event: Event) => {
			if (modal?.contains(event.target as Node)) return;
			event.preventDefault();
			event.stopPropagation();
		};

		window.addEventListener('keydown', blockInteraction, true);
		window.addEventListener('keyup', blockInteraction, true);
		window.addEventListener('pointerdown', blockInteraction, true);
		window.addEventListener('click', blockInteraction, true);
		window.addEventListener('wheel', blockInteraction, { capture: true, passive: false });

		return () => {
			document.body.style.overflow = previous;
			window.removeEventListener('keydown', blockInteraction, true);
			window.removeEventListener('keyup', blockInteraction, true);
			window.removeEventListener('pointerdown', blockInteraction, true);
			window.removeEventListener('click', blockInteraction, true);
			window.removeEventListener('wheel', blockInteraction, true);
		};
	});
</script>

{#if ads.length > 0}
	<!-- Ad-shaped bait: blockers that hide ads by selector hide this element. -->
	<div
		bind:this={bait}
		id="adsbox"
		class="adsbox ad-banner ad-container advertisement"
		aria-hidden="true"
		style="position: fixed; left: -9999px; top: -9999px; width: 2px; height: 2px; pointer-events: none;"
	></div>
{/if}

{#if current}
	<div
		class="fixed right-3 bottom-3 z-20 max-w-[calc(100vw-1.5rem)] overflow-hidden border border-white/10 bg-[#121212]/95 shadow-xl backdrop-blur-sm"
		aria-label="Sponsored advertisement"
	>
		<div class="flex items-center justify-between gap-3 border-b border-white/5 px-2 py-1">
			<div
				class="flex min-w-0 items-center gap-1.5 text-[9px] tracking-widest text-white/35 uppercase"
			>
				<IconSpeakerphone class="size-3 shrink-0" />
				<span class="truncate">Sponsored</span>
				{#if ads.length > 1}
					<span class="text-white/20">· {index + 1}/{ads.length}</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => (collapsed = !collapsed)}
				class="shrink-0 p-0.5 text-white/35 transition hover:text-white/70"
				aria-label={collapsed ? 'Show advertisement' : 'Minimize advertisement'}
				title={collapsed ? 'Show ad' : 'Minimize ad'}
			>
				{#if collapsed}
					<IconChevronUp class="size-3.5" />
				{:else}
					<IconChevronDown class="size-3.5" />
				{/if}
			</button>
		</div>

		{#if !collapsed}
			{#key `${current.id}-${reloadKey}`}
				<iframe
					title={current.label}
					src="/ads/frame/{current.id}"
					sandbox="allow-scripts allow-forms"
					referrerpolicy="no-referrer"
					class="block max-w-full border-0 bg-[#0b0b0b]"
					style="width: {current.width}px; height: {current.height}px; max-width: calc(100vw - 1.5rem);"
				></iframe>
			{/key}
		{/if}
	</div>
{/if}

{#if blocked}
	<div
		class="fixed inset-0 z-[100] flex cursor-not-allowed items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
		role="presentation"
	>
		<div
			bind:this={modal}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="adblock-title"
			class="w-full max-w-md cursor-auto border border-amber-500/30 bg-[#141414] p-6 text-center shadow-2xl"
		>
			<IconAlertTriangle class="mx-auto size-10 text-amber-400" />
			<h2 id="adblock-title" class="mt-4 text-lg font-semibold tracking-tight text-white">
				Ad blocker detected
			</h2>
			<p class="mt-2 text-sm leading-relaxed text-white/60">
				This panel is funded by ads. Turn off your ad blocker for this site to keep using the
				panel. Your actions are locked until the ads can load.
			</p>
			<button
				type="button"
				onclick={retry}
				class="mt-5 inline-flex items-center gap-2 border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
			>
				<IconRefresh class="size-3.5" />
				{checking ? 'Checking…' : 'Check again'}
			</button>
			<p class="mt-4 text-[11px] leading-snug text-white/30">
				If you use a browser extension, whitelist this domain and then select Check again.
			</p>
		</div>
	</div>
{/if}
