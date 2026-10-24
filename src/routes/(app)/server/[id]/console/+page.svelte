<script lang="ts">
	import { untrack } from 'svelte';
	import IconTerminal from '@tabler/icons-svelte/icons/terminal-2';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import { adapter } from '#lib/adapter/client.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { panelPrompts } from '#lib/panel/prompts.svelte.ts';
	import { usageColor } from '#lib/client/usage-color.ts';
	import { loadCommands } from '#lib/minecraft/commands.ts';
	import { COMMANDS } from '#lib/minecraft/data.ts';
	import type { CommandNode } from '#lib/minecraft/data.ts';
	import type { ConsoleLine, PanelPrompt, ServerState } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();
	const server = $derived(data.server);

	let commandTree = $state.raw(COMMANDS);

	$effect(() => {
		const version = server.version;
		let cancelled = false;

		loadCommands(version).then((tree) => {
			if (!cancelled) commandTree = tree;
		});

		return () => {
			cancelled = true;
		};
	});

	let command = $state('');
	let commandInput = $state<HTMLInputElement | null>(null);
	let suggestionIndex = $state(0);
	let dismissed = $state(false);




	type Suggestion = { value: string; hint: string; argument: boolean };

	const hintFor = (node: CommandNode) => {
		const literals = Object.keys(node.l);
		if (literals.length) {
			return literals.slice(0, 3).join(' · ') + (literals.length > 3 ? ' …' : '');
		}
		if (node.a.length) {
			return node.a
				.slice(0, 3)
				.map((name) => `<${name}>`)
				.join(' ');
		}
		return 'command';
	};

	const suggestions = $derived.by((): Suggestion[] => {
		const raw = command.replace(/^\s+/, '').replace(/^\//, '');
		if (!raw) return [];

		const parts = raw.split(' ');
		const partial = parts[parts.length - 1].toLowerCase();
		const committed = parts.slice(0, -1);
		let node: CommandNode = { l: commandTree, a: [] };

		for (const token of committed) {
			const next: CommandNode | undefined = node.l[token.toLowerCase()];
			if (!next) return [];
			node = next;
		}

		if (!partial && !committed.length) return [];

		const literals = Object.keys(node.l)
			.filter((name) => name.startsWith(partial) && name !== partial)
			.sort()
			.slice(0, 8)
			.map((name) => ({ value: name, hint: hintFor(node.l[name]), argument: false }));

		if (literals.length) return literals;

		if (!partial || node.a.some((name) => name.startsWith(partial))) {
			return node.a.slice(0, 8).map((name) => ({ value: name, hint: 'argument', argument: true }));
		}

		return [];
	});

	const visibleSuggestions = $derived(dismissed ? [] : suggestions);
	const activeIndex = $derived(
		visibleSuggestions.length ? Math.min(suggestionIndex, visibleSuggestions.length - 1) : 0
	);

	const complete = (suggestion: Suggestion) => {
		const raw = command.replace(/^\s+/, '').replace(/^\//, '');
		const parts = raw.split(' ');
		parts[parts.length - 1] = suggestion.argument
			? `<${suggestion.value}>`
			: suggestion.value;
		command = `${parts.join(' ')} `;
		suggestionIndex = 0;
		dismissed = false;
		commandInput?.focus();
	};

	const onCommandKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			dismissed = true;
			return;
		}
		if (!visibleSuggestions.length) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			suggestionIndex = (activeIndex + 1) % visibleSuggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			suggestionIndex = (activeIndex - 1 + visibleSuggestions.length) % visibleSuggestions.length;
		} else if (event.key === 'Tab') {
			event.preventDefault();
			complete(visibleSuggestions[activeIndex]);
		}
	};

	let consoleEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		panel.lines.length;
		if (consoleEl) {
			consoleEl.scrollTop = consoleEl.scrollHeight;
		}
	});

	$effect(() => {
		if (!data.capabilities.console.history) return;

		let cancelled = false;

		adapter
			.getConsole(server.id)
			.then((lines) => {
				if (!cancelled && !panel.lines.length) panel.syncLines(lines);
			})
			.catch(() => {
				/* history is best-effort */
			});

		return () => {
			cancelled = true;
		};
	});

	const STATES = new Set<ServerState>([
		'running',
		'starting',
		'stopping',
		'offline',
		'installing',
		'suspended',
		'unknown'
	]);

	const toState = (value: unknown): ServerState =>
		STATES.has(value as ServerState) ? (value as ServerState) : 'unknown';

	const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

	const appendOutput = (chunk: string) => {
		for (const raw of stripAnsi(chunk).replace(/\r/g, '').split('\n')) {
			const text = raw.trimEnd();
			if (!text) continue;

			const level: ConsoleLine['level'] = /error|exception|severe/i.test(text)
				? 'ERROR'
				: /warn/i.test(text)
					? 'WARN'
					: 'OUT';

			panel.pushLine({ level, text });
		}
	};

	let stream: EventSource | null = null;
	let streamReady = $state(false);

	$effect(() => {
		if (!data.capabilities.console.websocket) return;

		const id = server.id;
		let disposed = false;
		let reconnect: ReturnType<typeof setTimeout> | undefined;

		const applyStats = (raw: string) => {
			try {
				const stats = JSON.parse(raw) as {
					memory_bytes?: number;
					disk_bytes?: number;
					cpu_absolute?: number;
					state?: string;
				};

				usageValues = {
					cpu: Math.round(stats.cpu_absolute ?? 0),
					memory: Math.round((stats.memory_bytes ?? 0) / (1024 * 1024)),
					disk: Math.round((stats.disk_bytes ?? 0) / (1024 * 1024))
				};

				if (stats.state) panel.setPowerState(toState(stats.state));
			} catch {
				/* ignore malformed stats */
			}
		};

		const connect = () => {
			if (disposed) return;

			stream = new EventSource(`/api/servers/${encodeURIComponent(id)}/console`);

			stream.onmessage = (message) => {
				let payload: { event?: string; args?: string[]; prompts?: PanelPrompt[] };

				try {
					payload = JSON.parse(message.data);
				} catch {
					return;
				}

				const args = payload.args ?? [];
				const value = args[0] ?? '';

				switch (payload.event) {
					case 'ready':
						streamReady = true;
						break;
					case 'console output':
					case 'install output':
						appendOutput(args.join(''));
						break;
					case 'status':
						panel.setPowerState(toState(value));
						break;
					case 'stats':
						applyStats(value);
						break;
					case 'prompt':
						panelPrompts.push(...(payload.prompts ?? []));
						break;
					case 'jwt error':
					case 'daemon error':
						panel.showNotice(value || 'Console connection error.');
						break;
				}
			};

			stream.onerror = () => {
				streamReady = false;
				stream?.close();
				stream = null;
				if (!disposed) reconnect = setTimeout(connect, 3000);
			};
		};

		connect();

		return () => {
			disposed = true;
			streamReady = false;
			if (reconnect) clearTimeout(reconnect);
			stream?.close();
			stream = null;
		};
	});

	const sendCommand = async (event: SubmitEvent) => {
		event.preventDefault();
		const value = command.trim();
		if (!value) return;

		command = '';
		suggestionIndex = 0;
		dismissed = false;

		panel.pushLine({ level: 'OUT', text: `> ${value}` });

		try {
			await adapter.sendCommand(server.id, value);

			if (data.capabilities.console.history) {
				try {
					panel.syncLines(await adapter.getConsole(server.id));
				} catch {
					/* adapters without console history still accept commands */
				}
			}
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Command failed.');
		}
	};

	const levelClass = (level: ConsoleLine['level']) =>
		level === 'WARN' ? 'text-amber-300'
		: level === 'ERROR' ? 'text-red-300'
		: level === 'OUT' ? 'text-indigo-300'
		: 'text-white/60';

	let usageValues = $state({
		cpu: untrack(() => server.cpu.used),
		memory: untrack(() => server.memory.used),
		disk: untrack(() => server.disk.used)
	});

	$effect(() => {
		if (!data.capabilities.resources || streamReady) return;

		let cancelled = false;

		const tick = async () => {
			try {
				const usage = await adapter.getResources(server.id);
				if (!cancelled) {
					usageValues = { cpu: usage.cpu, memory: usage.ram, disk: usage.disk };
				}
			} catch {
				/* ignore transient polling errors */
			}
		};

		tick();
		const id = setInterval(tick, 2500);

		return () => {
			cancelled = true;
			clearInterval(id);
		};
	});

	const usage = $derived([
		{ label: 'CPU', used: usageValues.cpu, limit: server.cpu.limit, unit: '%' },
		{
			label: 'Memory',
			used: usageValues.memory / 1024,
			limit: server.memory.limit / 1024,
			unit: 'GB'
		},
		{
			label: 'Disk',
			used: usageValues.disk / 1024,
			limit: server.disk.limit / 1024,
			unit: 'GB'
		}
	]);

	const pct = (used: number, limit: number) => (limit ? Math.min(100, (used / limit) * 100) : 0);

	let copied = $state(false);
	const copyAddress = async () => {
		try {
			await navigator.clipboard.writeText(panel.address);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			panel.showNotice('Could not copy the address to your clipboard.');
		}
	};
</script>

<section class="border border-white/10 bg-[#1a1a1a]">
	<div class="flex items-center justify-between border-b border-white/10 px-4 py-2">
		<span class="flex items-center gap-2 text-xs font-semibold tracking-widest text-white/40 uppercase">
			<IconTerminal class="h-4 w-4" />
			Live console
			{#if data.capabilities.console.websocket}
				<span class="flex items-center gap-1.5 tracking-normal normal-case">
					<span
						class="h-1.5 w-1.5 {streamReady ? 'bg-emerald-400' : 'bg-amber-400'}"
					></span>
					<span class="text-[10px] text-white/30">
						{streamReady ? 'live' : 'connecting'}
					</span>
				</span>
			{/if}
		</span>
		<span class="font-mono text-[11px] text-white/30">
			MC {server.version}
			<span class="text-white/15">·</span>
			/home/container
		</span>
	</div>

	<div
		bind:this={consoleEl}
		class="console-scroll h-80 overflow-y-auto bg-[#0d0d0d] p-4 font-mono text-xs leading-relaxed"
	>
		{#each panel.lines as line, index (index)}
			<div class="flex gap-3">
				<span class="shrink-0 text-white/25">{line.time}</span>
				<span class={levelClass(line.level)}>{line.text}</span>
			</div>
		{/each}
	</div>

	<form onsubmit={sendCommand} class="flex items-center gap-3 border-t border-white/10 px-4 py-3">
		<span class="font-mono text-sm text-indigo-400">$</span>
		<div class="relative flex-1">
			{#if visibleSuggestions.length}
				<ul
					class="absolute bottom-full left-0 z-20 mb-2 w-full border border-white/10 bg-[#1a1a1a] shadow-lg"
				>
					{#each visibleSuggestions as suggestion, index (suggestion.value)}
						<li>
							<button
								type="button"
								onmouseenter={() => (suggestionIndex = index)}
								onclick={() => complete(suggestion)}
								class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-xs transition
									{index === activeIndex
									? 'bg-white/10 text-white'
									: 'text-white/50 hover:bg-white/5'}"
							>
								<span class={suggestion.argument ? 'text-white/40' : ''}>
									{suggestion.argument ? `<${suggestion.value}>` : suggestion.value}
								</span>
								<span class="truncate text-[10px] text-white/30">
									{suggestion.hint}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<input
				bind:this={commandInput}
				bind:value={command}
				oninput={() => (dismissed = false)}
				onkeydown={onCommandKeydown}
				placeholder={panel.powerState === 'running' ? 'Type a command...' : 'Server is offline'}
				disabled={panel.powerState !== 'running' || !data.capabilities.console.commands}
				autocomplete="off"
				class="w-full border-none bg-transparent font-mono text-sm text-white placeholder:text-white/25 focus:outline-none disabled:cursor-not-allowed"
			/>
		</div>
		<Button
			type="submit"
			variant="outline"
			size="xs"
			disabled={panel.powerState !== 'running' || !command.trim() || !data.capabilities.console.commands}
			class="normal-case tracking-normal"
		>
			Send
		</Button>
	</form>
</section>

<section class="mt-4 grid gap-4 sm:grid-cols-3">
	{#each usage as resource (resource.label)}
		<div class="border border-white/10 bg-[#1a1a1a] p-4">
			<div class="flex items-baseline justify-between">
				<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
					{resource.label}
				</p>
				<p class="font-mono text-xs text-white/60">
					{resource.used.toFixed(resource.unit === '%' ? 1 : 2)}
					<span class="text-white/30">/ {resource.limit.toFixed(0)}{resource.unit}</span>
				</p>
			</div>
			<div class="mt-3 h-1 w-full bg-white/5">
				<div
					class="h-full transition-all duration-500"
					style="width: {pct(resource.used, resource.limit)}%; background-color: {usageColor(
						pct(resource.used, resource.limit)
					)}"
				></div>
			</div>
		</div>
	{/each}
</section>

<section
	class="mt-4 flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-[#1a1a1a] px-4 py-3"
>
	<div class="min-w-0">
		<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
			Primary address
		</p>
		<p class="mt-1 truncate font-mono text-sm text-white">{panel.address}</p>
	</div>
	<Button
		type="button"
		variant="outline"
		size="xs"
		onclick={copyAddress}
		class="normal-case tracking-normal {copied
			? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
			: ''}"
	>
		{#if copied}
			<IconCheck class="h-3.5 w-3.5" />
			Copied
		{:else}
			<IconCopy class="h-3.5 w-3.5" />
			Copy
		{/if}
	</Button>
</section>

