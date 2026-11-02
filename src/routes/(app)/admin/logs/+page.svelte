<script lang="ts">
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconHistory from '@tabler/icons-svelte/icons/history';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatDateTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const total = $derived(data.tab === 'errors' ? data.errorCount : data.activityCount);
	const pages = $derived(Math.max(1, Math.ceil(total / data.perPage)));
	const href = (tab: string, page: number) =>
		`/admin/logs?tab=${tab}&page=${Math.min(Math.max(1, page), pages)}`;
</script>

<svelte:head>
	<title>Logs - {data.branding.name}</title>
</svelte:head>

<div class="space-y-5">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h2 class="mt-1 text-lg font-extrabold tracking-tight text-white">Activity & errors</h2>
		</div>
		<p class="text-xs text-white/35">
			{total}
			{data.tab === 'errors' ? 'error groups' : 'entries'}
		</p>
	</div>

	<nav class="flex gap-1 border-b border-white/10">
		<a
			href={href('activity', 1)}
			class="-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition
				{data.tab === 'activity'
				? 'border-indigo-400 text-white'
				: 'border-transparent text-white/45 hover:text-white'}"
		>
			<IconHistory class="h-4 w-4" />
			Activity
			<span class="text-[10px] text-white/30">{data.activityCount}</span>
		</a>
		<a
			href={href('errors', 1)}
			class="-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition
				{data.tab === 'errors'
				? 'border-indigo-400 text-white'
				: 'border-transparent text-white/45 hover:text-white'}"
		>
			<IconAlertTriangle class="h-4 w-4" />
			Errors
			<span class="text-[10px] text-white/30">{data.errorCount}</span>
		</a>
	</nav>

	<div class="border border-white/10 bg-[#1a1a1a]">
		{#if data.tab === 'activity'}
			{#if data.activity.length === 0}
				<p class="px-4 py-10 text-center text-sm text-white/35">No activity recorded yet.</p>
			{:else}
				<Table.Root class="w-full min-w-[720px] text-left text-sm">
					<Table.Header>
						<Table.Row class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase hover:bg-transparent">
							<Table.Head class="px-3 py-2 font-semibold">When</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Action</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Message</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">User</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.activity as entry (entry.id)}
							<Table.Row class="border-b border-white/5 last:border-0">
								<Table.Cell class="whitespace-nowrap px-3 py-2 text-xs text-white/45">
									{formatDateTime(entry.createdAt)}
								</Table.Cell>
								<Table.Cell class="px-3 py-2">
									<span
										class="border px-2 py-0.5 font-mono text-[10px] uppercase
											{entry.severity === 'error'
											? 'border-red-500/30 bg-red-500/10 text-red-300'
											: entry.severity === 'warning'
												? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
												: 'border-white/10 bg-white/5 text-white/50'}"
									>
										{entry.action}
									</span>
								</Table.Cell>
								<Table.Cell class="px-3 py-2 text-xs text-white/60">
									{entry.message}
									{#if entry.path}
										<span class="ml-1 font-mono text-[10px] text-white/25">{entry.path}</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="px-3 py-2 font-mono text-[10px] text-white/35">
									{entry.userId ?? 'system'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		{:else}
			{#if data.errors.length === 0}
				<p class="px-4 py-10 text-center text-sm text-white/35">No errors recorded yet.</p>
			{:else}
				<Table.Root class="w-full min-w-[720px] text-left text-sm">
					<Table.Header>
						<Table.Row class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase hover:bg-transparent">
							<Table.Head class="px-3 py-2 font-semibold">Last seen</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Count</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Reference</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Message</Table.Head>
							<Table.Head class="px-3 py-2 font-semibold">Request</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.errors as entry (entry.id)}
							<Table.Row class="border-b border-white/5 last:border-0 align-top">
								<Table.Cell class="whitespace-nowrap px-3 py-2 text-xs text-white/45">
									{formatDateTime(entry.lastSeen)}
									<p class="mt-0.5 text-[10px] text-white/25">
										first {formatDateTime(entry.createdAt)}
									</p>
								</Table.Cell>
								<Table.Cell class="px-3 py-2">
									<span
										class="border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-300"
									>
										x{entry.count}
									</span>
								</Table.Cell>
								<Table.Cell class="px-3 py-2 font-mono text-[10px] text-white/35">
									{entry.reference}
								</Table.Cell>
								<Table.Cell class="px-3 py-2 text-xs text-white/60">
									<p>{entry.message}</p>
									{#if entry.stack}
										<details class="mt-1">
											<summary class="cursor-pointer text-[10px] text-white/30">Stack trace</summary>
											<pre class="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap text-[10px] text-white/30">{entry.stack}</pre>
										</details>
									{/if}
								</Table.Cell>
								<Table.Cell class="px-3 py-2 text-xs text-white/45">
									<p class="font-mono text-[10px]">{entry.method ?? '—'} {entry.path ?? ''}</p>
									<p class="mt-0.5 text-[10px] text-white/25">{entry.status}</p>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		{/if}
	</div>

	{#if pages > 1}
		<div class="flex items-center justify-between text-xs text-white/40">
			<span>Page {data.page} of {pages}</span>
			<div class="flex gap-2">
				{#if data.page > 1}
					<a
						href={href(data.tab, data.page - 1)}
						class="border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/70 transition hover:bg-white/10"
					>
						Previous
					</a>
				{/if}
				{#if data.page < pages}
					<a
						href={href(data.tab, data.page + 1)}
						class="border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/70 transition hover:bg-white/10"
					>
						Next
					</a>
				{/if}
			</div>
		</div>
	{/if}
</div>
