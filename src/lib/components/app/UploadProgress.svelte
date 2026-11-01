<script lang="ts">
	import IconUpload from '@tabler/icons-svelte/icons/upload';
	import IconX from '@tabler/icons-svelte/icons/x';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconBan from '@tabler/icons-svelte/icons/ban';
	import IconChevronUp from '@tabler/icons-svelte/icons/chevron-up';
	import IconChevronDown from '@tabler/icons-svelte/icons/chevron-down';
	import { uploads, type UploadItem } from '#lib/client/uploads.svelte.ts';

	let collapsed = $state(false);

	const items = $derived(uploads.items);
	const activeCount = $derived(uploads.activeCount);
	const finishedCount = $derived(uploads.finishedCount);

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	const percent = (item: UploadItem) => {
		if (item.status === 'done') return 100;
		if (!item.size) return item.status === 'uploading' ? 5 : 0;
		return Math.max(item.status === 'uploading' ? 5 : 0, Math.min(100, (item.loaded / item.size) * 100));
	};

	const barColor = (item: UploadItem) => {
		if (item.status === 'done') return 'bg-emerald-400';
		if (item.status === 'error') return 'bg-red-400';
		if (item.status === 'canceled') return 'bg-white/25';
		return 'bg-indigo-400';
	};
</script>

{#if items.length > 0}
	<div
		class="fixed bottom-4 right-4 z-[60] w-[min(23rem,calc(100vw-2rem))] border border-white/10 bg-[#1a1a1a] shadow-2xl"
	>
		<div class="flex items-center gap-2 border-b border-white/10 px-3 py-2">
			<IconUpload class="h-4 w-4 shrink-0 text-indigo-300" />
			<div class="min-w-0 flex-1">
				<p class="text-xs font-semibold text-white">
					{activeCount > 0 ? `Uploading ${activeCount} file${activeCount === 1 ? '' : 's'}` : 'Uploads'}
				</p>
				<p class="text-[10px] text-white/35">
					{#if activeCount > 0}
						{finishedCount} finished · uploads continue if you navigate away
					{:else}
						{finishedCount} finished
					{/if}
				</p>
			</div>

			<button
				type="button"
				onclick={() => (collapsed = !collapsed)}
				aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
				class="flex h-6 w-6 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white"
			>
				{#if collapsed}
					<IconChevronUp class="h-3.5 w-3.5" />
				{:else}
					<IconChevronDown class="h-3.5 w-3.5" />
				{/if}
			</button>
			<button
				type="button"
				onclick={() => uploads.dismissAll()}
				aria-label="Close uploads"
				class="flex h-6 w-6 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white"
			>
				<IconX class="h-3.5 w-3.5" />
			</button>
		</div>

		{#if !collapsed}
			<div class="max-h-72 divide-y divide-white/5 overflow-y-auto">
				{#each items as item (item.id)}
					<div class="px-3 py-2">
						<div class="flex items-center gap-2">
							{#if item.status === 'done'}
								<IconCheck class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
							{:else if item.status === 'error'}
								<IconAlertTriangle class="h-3.5 w-3.5 shrink-0 text-red-400" />
							{:else if item.status === 'canceled'}
								<IconBan class="h-3.5 w-3.5 shrink-0 text-white/30" />
							{:else}
								<IconUpload class="h-3.5 w-3.5 shrink-0 text-indigo-300" />
							{/if}

							<div class="min-w-0 flex-1">
								<p class="truncate text-xs text-white/85" title={item.name}>{item.name}</p>
								<p class="truncate text-[10px] text-white/35">
									{item.serverName} · {item.directory}
								</p>
							</div>

							<span class="shrink-0 font-mono text-[10px] text-white/45">
								{#if item.status === 'uploading'}
									{formatSize(item.loaded)} / {formatSize(item.size)}
								{:else if item.status === 'done'}
									{formatSize(item.size)}
								{:else}
									{item.status === 'canceled' ? 'Canceled' : 'Failed'}
								{/if}
							</span>

							<button
								type="button"
								onclick={() => uploads.dismiss(item.id)}
								aria-label={item.status === 'uploading' ? 'Cancel upload' : 'Dismiss upload'}
								class="flex h-5 w-5 shrink-0 items-center justify-center text-white/30 transition hover:bg-white/5 hover:text-white"
							>
								<IconX class="h-3 w-3" />
							</button>
						</div>

						<div class="mt-1.5 h-1 w-full overflow-hidden bg-white/5">
							<div
								class="h-full transition-[width] duration-200 {barColor(item)}"
								style="width: {percent(item)}%"
							></div>
						</div>

						{#if item.error && item.status === 'error'}
							<p class="mt-1 text-[10px] text-red-300/80">{item.error}</p>
						{/if}
					</div>
				{/each}
			</div>

			{#if finishedCount > 0}
				<div class="flex justify-end border-t border-white/10 px-3 py-1.5">
					<button
						type="button"
						onclick={() => uploads.dismissFinished()}
						class="text-[10px] font-semibold tracking-widest text-white/40 uppercase transition hover:text-white"
					>
						Clear finished
					</button>
				</div>
			{/if}
		{/if}
	</div>
{/if}
