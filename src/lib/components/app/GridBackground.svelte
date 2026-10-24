<script lang="ts">
	let {
		base = '#121212',
		track = 44,
		lineColor = 'rgba(255,255,255,0.06)',
		stroke = 'rgba(129, 140, 248, 0.75)',
		minInterval = 900,
		maxInterval = 2500,
		maxConcurrency = 3
	}: {
		base?: string;
		track?: number;
		lineColor?: string;
		stroke?: string;
		minInterval?: number;
		maxInterval?: number;
		maxConcurrency?: number;
	} = $props();

	type Pulse = { id: number; d: string; style: string };

	let layer: HTMLDivElement | undefined = $state();
	let pulses = $state<Pulse[]>([]);
	let nextId = 0;

	function spawnPulse() {
		if (!layer || document.hidden) return;
		const w = layer.clientWidth;
		const h = layer.clientHeight;
		const cols = Math.floor(w / track);
		const rows = Math.floor(h / track);
		if (cols < 2 || rows < 2) return;

		const id = nextId++;
		const d = buildPath(w, h, cols, rows);
		pulses.push({ id, d, style: `--t:${1800 + Math.random() * 800}ms` });
	}

	function buildPath(w: number, h: number, cols: number, rows: number): string {
		const horizFirst = Math.random() < 0.5;
		const forward = Math.random() < 0.5;
		const twoBends = Math.random() < 0.35;

		const inner = (n: number) => (1 + Math.floor(Math.random() * (n - 1))) * track;
		const any = (n: number) => Math.floor(Math.random() * n) * track;

		if (horizFirst) {
			const y0 = any(rows);
			const b1 = inner(cols);
			const startX = forward ? 0 : w;
			const endX = forward ? w : 0;

			if (twoBends) {
				let b2 = any(rows);
				let guard = 0;
				while (Math.abs(b2 - y0) < track && guard++ < 10) {
					b2 = any(rows);
				}
				if (Math.abs(b2 - y0) < track) b2 = y0 >= h - track ? y0 - track : y0 + track;
				return `M ${startX} ${y0} L ${b1} ${y0} L ${b1} ${b2} L ${endX} ${b2}`;
			}

			let endY = Math.random() < 0.5 ? 0 : h;
			if (Math.abs(endY - y0) < track) endY = endY === 0 ? h : 0;
			return `M ${startX} ${y0} L ${b1} ${y0} L ${b1} ${endY}`;
		}

		const x0 = any(cols);
		const b1 = inner(rows);
		const startY = forward ? 0 : h;
		const endY = forward ? h : 0;

		if (twoBends) {
			let b2 = inner(cols);
			let guard = 0;
			while (Math.abs(b2 - x0) < track && guard++ < 10) {
				b2 = inner(cols);
			}
			if (Math.abs(b2 - x0) < track) b2 = x0 >= w - track ? x0 - track : x0 + track;
			return `M ${x0} ${startY} L ${x0} ${b1} L ${b2} ${b1} L ${b2} ${endY}`;
		}

		let endX = Math.random() < 0.5 ? 0 : w;
		if (Math.abs(endX - x0) < track) endX = endX === 0 ? w : 0;
		return `M ${x0} ${startY} L ${x0} ${b1} L ${endX} ${b1} L ${endX} ${endY}`;
	}

	$effect(() => {
		// Respect reduced-motion: show the static grid only.
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const loop = (wait: number) => {
			timer = setTimeout(() => {
				if (cancelled) return;
				const count = 1 + Math.floor(Math.random() * maxConcurrency);
				for (let i = 0; i < count; i++) {
					setTimeout(() => !cancelled && spawnPulse(), i * (250 + Math.random() * 300));
				}
				loop(minInterval + Math.random() * (maxInterval - minInterval));
			}, wait);
		};
		loop(800 + Math.random() * 1000);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			pulses = [];
		};
	});

	function removePulse(id: number) {
		pulses = pulses.filter((p) => p.id !== id);
	}
</script>

<div
	class="fixed inset-0 pointer-events-none overflow-hidden"
	style="background-color: {base};"
	aria-hidden="true"
>
	<div
		class="absolute inset-0"
		style="background-image: linear-gradient({lineColor} 1px, transparent 1px), linear-gradient(90deg, {lineColor} 1px, transparent 1px); background-size: {track}px {track}px;"
	></div>
	<!-- Fix: sized layer + bind:this instead of a global id lookup -->
	<div bind:this={layer} class="absolute inset-0">
		{#each pulses as p (p.id)}
			<svg class="pulse-path" style={p.style} xmlns="http://www.w3.org/2000/svg">
				<path
					d={p.d}
					pathLength="100"
					style="--stroke: {stroke};"
					onanimationend={() => removePulse(p.id)}
				/>
			</svg>
		{/each}
	</div>
</div>

<style>
	.pulse-path {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.pulse-path path {
		stroke: var(--stroke);
		stroke-width: 1.5;
		fill: none;
		stroke-linecap: round;
		stroke-dasharray: 32 100;
		stroke-dashoffset: 32;
		opacity: 0;
		animation: dash var(--t) linear forwards;
	}

	@keyframes dash {
		0% {
			opacity: 0;
			stroke-dashoffset: 32;
		}
		15% {
			opacity: 1;
		}
		85% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			stroke-dashoffset: -68;
		}
	}
</style>
