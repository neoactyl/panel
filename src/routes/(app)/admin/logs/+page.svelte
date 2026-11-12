<script lang="ts">
	import { enhance } from '$app/forms';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconHistory from '@tabler/icons-svelte/icons/history';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge, type BadgeVariant } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatDateTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let clearOpen = $state(false);
	let clearing = $state(false);

	const total = $derived(data.tab === 'errors' ? data.errorCount : data.activityCount);
	const pages = $derived(Math.max(1, Math.ceil(total / data.perPage)));
	const href = (tab: string, page: number) =>
		`/admin/logs?tab=${tab}&page=${Math.min(Math.max(1, page), pages)}`;

	const severityVariant = (severity: string): BadgeVariant =>
		severity === 'error' ? 'destructive' : severity === 'warning' ? 'warning' : 'default';

	const previousHref = (page: number) => (page > 1 ? href(data.tab, page - 1) : undefined);
	const nextHref = (page: number) => (page < pages ? href(data.tab, page + 1) : undefined);
</script>

<svelte:head>
	<title>Logs - {data.branding.name}</title>
</svelte:head>

{#snippet emptyState(message: string)}
	<Card.Content>
		<p class="py-10 text-center text-sm text-muted-foreground">{message}</p>
	</Card.Content>
{/snippet}

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-extrabold tracking-tight">Activity &amp; errors</h2>
			<p class="text-xs text-muted-foreground">
				Logs are kept for {data.retentionDays} days, then deleted automatically.
			</p>
		</div>
		<AlertDialog.Root bind:open={clearOpen}>
			<AlertDialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="destructive" size="sm">
						<IconTrash />
						Clear logs
					</Button>
				{/snippet}
			</AlertDialog.Trigger>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Clear all logs?</AlertDialog.Title>
					<AlertDialog.Description>
						This permanently deletes every activity and error log entry. This action cannot be
						undone.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<form
					method="POST"
					action="?/clear"
					use:enhance={() => {
						clearing = true;
						return async ({ update }) => {
							try {
								await update();
								clearOpen = false;
							} finally {
								clearing = false;
							}
						};
					}}
				>
					<AlertDialog.Footer>
						<AlertDialog.Cancel disabled={clearing}>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action type="submit" variant="destructive" disabled={clearing}>
							{clearing ? 'Clearing...' : 'Clear all logs'}
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</form>
			</AlertDialog.Content>
		</AlertDialog.Root>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap gap-2">
			<Button
				href={href('activity', 1)}
				variant={data.tab === 'activity' ? 'secondary' : 'ghost'}
				size="sm"
			>
				<IconHistory />
				Activity
				<Badge variant="outline">{data.activityCount}</Badge>
			</Button>
			<Button
				href={href('errors', 1)}
				variant={data.tab === 'errors' ? 'secondary' : 'ghost'}
				size="sm"
			>
				<IconAlertTriangle />
				Errors
				<Badge variant="outline">{data.errorCount}</Badge>
			</Button>
		</div>
		<p class="text-xs text-muted-foreground">
			{total}
			{data.tab === 'errors' ? 'error groups' : 'entries'}
		</p>
	</div>

	<Card.Root size="sm">
		{#if data.tab === 'activity'}
			{#if data.activity.length === 0}
				{@render emptyState('No activity recorded yet.')}
			{:else}
				<Table.Root class="min-w-[720px]">
					<Table.Header>
						<Table.Row>
							<Table.Head>When</Table.Head>
							<Table.Head>Action</Table.Head>
							<Table.Head>Message</Table.Head>
							<Table.Head>User</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.activity as entry (entry.id)}
							<Table.Row>
								<Table.Cell class="text-xs text-muted-foreground">
									{formatDateTime(entry.createdAt)}
								</Table.Cell>
								<Table.Cell>
									<Badge variant={severityVariant(entry.severity)}>{entry.action}</Badge>
								</Table.Cell>
								<Table.Cell class="whitespace-normal text-xs">
									{entry.message}
									{#if entry.path}
										<span class="ml-1 font-mono text-[10px] text-muted-foreground">{entry.path}</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									{entry.userId ?? 'system'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		{:else}
			{#if data.errors.length === 0}
				{@render emptyState('No errors recorded yet.')}
			{:else}
				<Table.Root class="min-w-[720px]">
					<Table.Header>
						<Table.Row>
							<Table.Head>Last seen</Table.Head>
							<Table.Head>Count</Table.Head>
							<Table.Head>Reference</Table.Head>
							<Table.Head>Message</Table.Head>
							<Table.Head>Request</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.errors as entry (entry.id)}
							<Table.Row class="align-top">
								<Table.Cell class="text-xs text-muted-foreground">
									{formatDateTime(entry.lastSeen)}
									<p class="mt-0.5 text-[10px]">
										first {formatDateTime(entry.createdAt)}
									</p>
								</Table.Cell>
								<Table.Cell>
									<Badge variant="destructive">x{entry.count}</Badge>
								</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									{entry.reference}
								</Table.Cell>
								<Table.Cell class="whitespace-normal text-xs">
									<p>{entry.message}</p>
									{#if entry.stack}
										<details class="mt-1">
											<summary class="cursor-pointer text-[10px] text-muted-foreground">
												Stack trace
											</summary>
											<CodeBlock.Root class="mt-1" size="sm">
												<CodeBlock.Content code={entry.stack} wrap />
											</CodeBlock.Root>
										</details>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs text-muted-foreground">
									<p class="font-mono text-[10px]">{entry.method ?? '—'} {entry.path ?? ''}</p>
									<p class="mt-0.5 text-[10px]">{entry.status}</p>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		{/if}
	</Card.Root>

	{#if pages > 1}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-xs text-muted-foreground">Page {data.page} of {pages}</p>
			<div class="flex gap-2">
				<Button
					href={previousHref(data.page)}
					variant="outline"
					size="sm"
					disabled={data.page <= 1}
				>
					Previous
				</Button>
				<Button
					href={nextHref(data.page)}
					variant="outline"
					size="sm"
					disabled={data.page >= pages}
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>
