<script lang="ts">
	import { enhance } from '$app/forms';
	import IconSpeakerphone from '@tabler/icons-svelte/icons/speakerphone';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const inputCls =
		'w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none';
	const labelCls = 'text-[10px] font-semibold tracking-widest text-white/40 uppercase';
</script>

<svelte:head>
	<title>Ads - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-white">Ads</h1>
		<p class="mt-1 text-sm text-white/50">
			Manage the ad scripts shown unobtrusively across the panel. Ads do not award credits.
		</p>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
			{form.error}
		</div>
	{/if}
	{#if form?.created || form?.updated || form?.deleted}
		<div class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
			{form.created ?? form.updated ?? form.deleted}
		</div>
	{/if}

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<IconSpeakerphone class="size-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Add an ad</h2>
		</div>

		<form
			method="POST"
			action="?/createAd"
			use:enhance
			class="space-y-3 border border-white/10 bg-[#1a1a1a] p-4"
		>
			<div>
				<label class={labelCls} for="ad-label">Name</label>
				<input
					id="ad-label"
					name="label"
					required
					class={inputCls}
					placeholder="Footer banner"
				/>
			</div>

			<div>
				<label class={labelCls} for="ad-script">Ad script / HTML</label>
				<textarea
					id="ad-script"
					name="script"
					required
					rows="6"
					class="{inputCls} font-mono text-xs"
					placeholder="Paste your ad provider's embed code or HTML here."
				></textarea>
				<p class="mt-1.5 text-[11px] leading-snug text-amber-300/70">
					This code runs in a sandboxed frame. Only paste scripts from a provider you trust.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				<div>
					<label class={labelCls} for="ad-width">Width (px)</label>
					<input
						id="ad-width"
						name="width"
						type="number"
						min="120"
						max="600"
						value="300"
						class={inputCls}
					/>
				</div>
				<div>
					<label class={labelCls} for="ad-height">Height (px)</label>
					<input
						id="ad-height"
						name="height"
						type="number"
						min="40"
						max="250"
						value="100"
						class={inputCls}
					/>
				</div>
				<div>
					<label class={labelCls} for="ad-sort">Sort</label>
					<input id="ad-sort" name="sortOrder" type="number" value="0" class={inputCls} />
				</div>
			</div>

			<button
				type="submit"
				class="w-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
			>
				Create ad
			</button>
		</form>
	</section>

	<section class="space-y-3">
		<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Ad slots</h2>

		{#if data.ads.length === 0}
			<div class="border border-white/10 bg-[#1a1a1a] px-4 py-4 text-sm text-white/40">
				No ad scripts yet. Add one above and it will appear across the panel.
			</div>
		{:else}
			<div class="space-y-3">
				{#each data.ads as ad (ad.id)}
					<div class="border border-white/10 bg-[#1a1a1a]">
						<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
							<div class="min-w-0">
								<div class="truncate text-sm font-semibold text-white">{ad.label}</div>
								<div class="truncate text-xs text-white/40">
									{ad.width}×{ad.height}px · sort {ad.sortOrder}
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<form method="POST" action="?/toggleAd" use:enhance>
									<input type="hidden" name="id" value={ad.id} />
									<input type="hidden" name="enabled" value={String(!ad.enabled)} />
									<button
										type="submit"
										class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {ad.enabled
											? 'border-emerald-500/30 text-emerald-300'
											: 'border-white/10 text-white/40'}"
									>
										{ad.enabled ? 'Enabled' : 'Disabled'}
									</button>
								</form>
								<form method="POST" action="?/deleteAd" use:enhance>
									<input type="hidden" name="id" value={ad.id} />
									<button
										type="submit"
										class="border border-red-500/20 p-1.5 text-red-300/70 transition hover:border-red-500/40 hover:text-red-300"
										aria-label="Delete ad"
									>
										<IconTrash class="size-3.5" />
									</button>
								</form>
							</div>
						</div>

						<details class="border-t border-white/5">
							<summary
								class="cursor-pointer px-4 py-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase hover:text-white/70"
							>
								Edit ad
							</summary>
							<form method="POST" action="?/updateAd" use:enhance class="space-y-3 px-4 py-4">
								<input type="hidden" name="id" value={ad.id} />
								<div>
									<label class={labelCls} for="edit-label-{ad.id}">Name</label>
									<input
										id="edit-label-{ad.id}"
										name="label"
										required
										class={inputCls}
										value={ad.label}
									/>
								</div>
								<div>
									<label class={labelCls} for="edit-script-{ad.id}">Ad script / HTML</label>
									<textarea
										id="edit-script-{ad.id}"
										name="script"
										required
										rows="6"
										class="{inputCls} font-mono text-xs"
										value={ad.script}
									></textarea>
								</div>
								<div class="grid gap-3 sm:grid-cols-3">
									<div>
										<label class={labelCls} for="edit-width-{ad.id}">Width (px)</label>
										<input
											id="edit-width-{ad.id}"
											name="width"
											type="number"
											min="120"
											max="600"
											class={inputCls}
											value={ad.width}
										/>
									</div>
									<div>
										<label class={labelCls} for="edit-height-{ad.id}">Height (px)</label>
										<input
											id="edit-height-{ad.id}"
											name="height"
											type="number"
											min="40"
											max="250"
											class={inputCls}
											value={ad.height}
										/>
									</div>
									<div>
										<label class={labelCls} for="edit-sort-{ad.id}">Sort</label>
										<input
											id="edit-sort-{ad.id}"
											name="sortOrder"
											type="number"
											class={inputCls}
											value={ad.sortOrder}
										/>
									</div>
								</div>
								<label class="flex items-center gap-2 text-xs text-white/60">
									<input type="checkbox" name="enabled" checked={ad.enabled} />
									Enabled
								</label>
								<button
									type="submit"
									class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
								>
									Save changes
								</button>
							</form>
						</details>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
