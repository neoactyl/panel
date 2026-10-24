<script lang="ts">
	import { enhance } from '$app/forms';
	import IconTicket from '@tabler/icons-svelte/icons/ticket';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const inputCls =
		'w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none';
	const labelCls = 'text-[10px] font-semibold tracking-widest text-white/40 uppercase';
</script>

<svelte:head>
	<title>Economy - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-white">Economy</h1>
			<p class="mt-1 text-sm text-white/50">
				Manage vouchers, earning tasks and referral rewards.
			</p>
		</div>
		<div class="flex gap-3">
			<div class="border border-white/10 bg-[#1a1a1a] px-4 py-2 text-center">
				<div class="text-[10px] tracking-widest text-white/40 uppercase">Credits held</div>
				<div class="text-lg font-semibold text-white">{data.stats.credited}</div>
			</div>
			<div class="border border-white/10 bg-[#1a1a1a] px-4 py-2 text-center">
				<div class="text-[10px] tracking-widest text-white/40 uppercase">Referrals</div>
				<div class="text-lg font-semibold text-white">{data.stats.referrals}</div>
			</div>
		</div>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
			{form.error}
		</div>
	{/if}
	{#if form?.created}
		<div class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
			{form.created}
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-2">
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<IconTicket class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
					Vouchers
				</h2>
			</div>

			<form
				method="POST"
				action="?/createVoucher"
				use:enhance
				class="space-y-3 border border-white/10 bg-[#1a1a1a] p-4"
			>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={labelCls} for="voucher-code">Code</label>
						<input id="voucher-code" name="code" required class={inputCls} placeholder="WELCOME10" />
					</div>
					<div>
						<label class={labelCls} for="voucher-kind">Type</label>
						<select id="voucher-kind" name="kind" class={inputCls}>
							<option value="credits">Credits</option>
							<option value="resource">Resources</option>
						</select>
					</div>
				</div>
				<div>
					<label class={labelCls} for="voucher-description">Description</label>
					<input id="voucher-description" name="description" class={inputCls} />
				</div>
				<div class="grid gap-3 sm:grid-cols-4">
					<div>
						<label class={labelCls} for="voucher-credits">Credits</label>
						<input id="voucher-credits" name="credits" type="number" min="0" value="0" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="voucher-cpu">CPU %</label>
						<input id="voucher-cpu" name="cpu" type="number" min="0" value="0" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="voucher-memory">Memory MB</label>
						<input id="voucher-memory" name="memory" type="number" min="0" value="0" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="voucher-disk">Disk MB</label>
						<input id="voucher-disk" name="disk" type="number" min="0" value="0" class={inputCls} />
					</div>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={labelCls} for="voucher-uses">Max uses (0 = unlimited)</label>
						<input id="voucher-uses" name="maxUses" type="number" min="0" value="0" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="voucher-expires">Expires</label>
						<input id="voucher-expires" name="expiresAt" type="datetime-local" class={inputCls} />
					</div>
				</div>
				<button
					type="submit"
					class="w-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
				>
					Create voucher
				</button>
			</form>

			<div class="divide-y divide-white/5 border border-white/10 bg-[#1a1a1a]">
				{#if data.vouchers.length === 0}
					<div class="px-4 py-4 text-sm text-white/40">No vouchers yet.</div>
				{/if}
				{#each data.vouchers as voucher (voucher.id)}
					<div class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="font-mono text-sm tracking-widest text-white">{voucher.code}</div>
							<div class="text-xs text-white/40">
								{voucher.kind === 'resource'
									? `${voucher.cpu}% CPU · ${voucher.memory} MB · ${voucher.disk} MB`
									: `${voucher.credits} credits`}
								· {voucher.usedCount}{voucher.maxUses ? `/${voucher.maxUses}` : ''} used
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<form method="POST" action="?/toggleVoucher" use:enhance>
								<input type="hidden" name="id" value={voucher.id} />
								<input type="hidden" name="enabled" value={String(!voucher.enabled)} />
								<button
									type="submit"
									class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {voucher.enabled
										? 'border-emerald-500/30 text-emerald-300'
										: 'border-white/10 text-white/40'}"
								>
									{voucher.enabled ? 'Enabled' : 'Disabled'}
								</button>
							</form>
							<form method="POST" action="?/deleteVoucher" use:enhance>
								<input type="hidden" name="id" value={voucher.id} />
								<button
									type="submit"
									class="border border-red-500/20 p-1.5 text-red-300/70 transition hover:border-red-500/40 hover:text-red-300"
									aria-label="Delete voucher"
								>
									<IconTrash class="size-3.5" />
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<IconExternalLink class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Tasks</h2>
			</div>

			<form
				method="POST"
				action="?/createTask"
				use:enhance
				class="space-y-3 border border-white/10 bg-[#1a1a1a] p-4"
			>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={labelCls} for="task-title">Title</label>
						<input id="task-title" name="title" required class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="task-provider">Provider</label>
						<input id="task-provider" name="provider" value="linkvertise" class={inputCls} />
					</div>
				</div>
				<div>
					<label class={labelCls} for="task-description">Description</label>
					<input id="task-description" name="description" class={inputCls} />
				</div>
				<div>
					<label class={labelCls} for="task-url">Destination URL</label>
					<input id="task-url" name="url" type="url" required class={inputCls} placeholder="https://example.com/reward" />
					<p class="mt-1 text-[10px] text-white/30">
						A Linkvertise publisher ID is required in Settings. Linkvertise tasks stay hidden
						until it is configured.
					</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-4">
					<div>
						<label class={labelCls} for="task-reward">Reward</label>
						<input id="task-reward" name="reward" type="number" min="0" value="10" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="task-cooldown">Cooldown h</label>
						<input id="task-cooldown" name="cooldownHours" type="number" min="0" value="24" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="task-min">Min secs</label>
						<input id="task-min" name="minSeconds" type="number" min="0" value="15" class={inputCls} />
					</div>
					<div>
						<label class={labelCls} for="task-order">Sort</label>
						<input id="task-order" name="sortOrder" type="number" value="0" class={inputCls} />
					</div>
				</div>
				<button
					type="submit"
					class="w-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
				>
					Create task
				</button>
			</form>

			<div class="divide-y divide-white/5 border border-white/10 bg-[#1a1a1a]">
				{#if data.tasks.length === 0}
					<div class="px-4 py-4 text-sm text-white/40">No tasks yet.</div>
				{/if}
				{#each data.tasks as task (task.id)}
					<div class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="truncate text-sm text-white">{task.title}</div>
							<div class="truncate text-xs text-white/40">
								{task.provider} · +{task.reward} · {task.cooldownHours}h cooldown
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<form method="POST" action="?/toggleTask" use:enhance>
								<input type="hidden" name="id" value={task.id} />
								<input type="hidden" name="enabled" value={String(!task.enabled)} />
								<button
									type="submit"
									class="border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase {task.enabled
										? 'border-emerald-500/30 text-emerald-300'
										: 'border-white/10 text-white/40'}"
								>
									{task.enabled ? 'Enabled' : 'Disabled'}
								</button>
							</form>
							<form method="POST" action="?/deleteTask" use:enhance>
								<input type="hidden" name="id" value={task.id} />
								<button
									type="submit"
									class="border border-red-500/20 p-1.5 text-red-300/70 transition hover:border-red-500/40 hover:text-red-300"
									aria-label="Delete task"
								>
									<IconTrash class="size-3.5" />
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<p class="text-xs text-white/30">
		Referral rewards and AFK limits are configured in Settings under Economy.
	</p>
</div>
