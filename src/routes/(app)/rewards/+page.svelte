<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import IconExternalLink from '@tabler/icons-svelte/icons/external-link';
	import IconGift from '@tabler/icons-svelte/icons/gift';
	import IconTicket from '@tabler/icons-svelte/icons/ticket';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state('');
	let error = $state('');

	const start = async (taskId: string) => {
		busy = taskId;
		error = '';

		try {
			const body = new FormData();
			body.set('taskId', taskId);
			const response = await fetch('?/start', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize<{ url?: string }, { error?: string }>(await response.text());

			if (result.type === 'success' && result.data?.url) {
				window.open(result.data.url, '_blank', 'noopener,noreferrer');
			} else if (result.type === 'failure') {
				error = result.data?.error ?? 'Unable to start that task.';
			} else {
				error = 'Unable to start that task.';
			}
		} catch {
			error = 'Unable to start that task.';
		} finally {
			busy = '';
		}
	};

	const claim = async (taskId: string) => {
		busy = `claim:${taskId}`;
		error = '';

		try {
			const body = new FormData();
			body.set('taskId', taskId);
			const response = await fetch('?/claim', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize<{ reward?: number }, { error?: string }>(await response.text());

			if (result.type === 'success') {
				await invalidateAll();
			} else if (result.type === 'failure') {
				error = result.data?.error ?? 'Unable to claim that task.';
			} else {
				error = 'Unable to claim that task.';
			}
		} catch {
			error = 'Unable to claim that task.';
		} finally {
			busy = '';
		}
	};

	const available = (task: (typeof data.tasks)[number]) =>
		!task.nextAvailableAt || new Date(task.nextAvailableAt).getTime() <= Date.now();
</script>

<svelte:head>
	<title>Rewards - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-white">Rewards</h1>
			<p class="mt-1 text-sm text-white/50">
				Complete tasks, redeem vouchers and share credits with other members.
			</p>
		</div>
		<div class="flex items-center gap-2 border border-white/10 bg-[#1a1a1a] px-4 py-2">
			<IconCoin class="size-4 text-amber-400" />
			<span class="text-lg font-semibold text-white">{data.balance}</span>
			<span class="text-[10px] tracking-widest text-white/40 uppercase">Credits</span>
		</div>
	</div>

	{#if error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
	{/if}

	{#if data.verified}
		<div
			class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
		>
			Task verified. Claim your reward below.
		</div>
	{/if}

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<IconExternalLink class="size-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Tasks</h2>
		</div>

		{#if !data.tasksEnabled}
			<div class="border border-white/10 bg-[#1a1a1a] p-4 text-sm text-white/40">
				Tasks are currently disabled.
			</div>
		{:else if data.tasks.length === 0}
			<div class="border border-white/10 bg-[#1a1a1a] p-4 text-sm text-white/40">
				No tasks are available right now. Check back soon.
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.tasks as task (task.id)}
					<div class="flex flex-col justify-between border border-white/10 bg-[#1a1a1a] p-4">
						<div>
							<div class="flex items-start justify-between gap-3">
								<div>
									<h3 class="text-sm font-semibold text-white">{task.title}</h3>
									<p class="mt-1 text-xs text-white/40">{task.description}</p>
								</div>
								<span class="shrink-0 border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold tracking-widest text-amber-300 uppercase">
									+{task.reward}
								</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-2 text-[10px] tracking-widest text-white/30 uppercase">
								<span>{task.provider}</span>
								<span>·</span>
								<span>{task.cooldownHours}h cooldown</span>
								{#if task.verified}
									<span>·</span>
									<span class="text-emerald-400">verified</span>
								{:else if task.startedAt}
									<span>·</span>
									<span>in progress</span>
								{/if}
							</div>
						</div>

						<div class="mt-4 flex items-center gap-2">
							<button
								type="button"
								disabled={!available(task) || busy === task.id}
								onclick={() => start(task.id)}
								class="flex-1 border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{busy === task.id ? 'Opening...' : 'Start task'}
							</button>
							<button
								type="button"
								disabled={busy === `claim:${task.id}`}
								onclick={() => claim(task.id)}
								class="border border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white disabled:opacity-40"
							>
								<IconCheck class="inline size-3" /> Claim
							</button>
						</div>
						{#if !available(task)}
							<div class="mt-2 text-[10px] tracking-widest text-amber-400/70 uppercase">
								Available again {new Date(task.nextAvailableAt ?? '').toLocaleString()}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<IconTicket class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
					Redeem voucher
				</h2>
			</div>
			<form
				method="POST"
				action="?/redeem"
				use:enhance={() => {
					busy = 'redeem';
					return async ({ update }) => {
						await update();
						busy = '';
					};
				}}
				class="border border-white/10 bg-[#1a1a1a] p-4"
			>
				<input
					name="code"
					type="text"
					required
					placeholder="VOUCHER-CODE"
					class="w-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm tracking-widest text-white uppercase placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={!data.vouchersEnabled || busy === 'redeem'}
					class="mt-3 w-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white disabled:opacity-40"
				>
					Redeem
				</button>
				{#if form?.redeemed}
					<p class="mt-3 text-xs text-emerald-300">{form.redeemed}</p>
				{/if}
				{#if form?.error}
					<p class="mt-3 text-xs text-red-300">{form.error}</p>
				{/if}
				{#if !data.vouchersEnabled}
					<p class="mt-3 text-xs text-white/30">Vouchers are currently disabled.</p>
				{/if}
			</form>
		</section>

		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<IconGift class="size-4 text-white/50" />
				<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
					Gift credits
				</h2>
			</div>
			<form
				method="POST"
				action="?/gift"
				use:enhance={() => {
					busy = 'gift';
					return async ({ update }) => {
						await update();
						busy = '';
					};
				}}
				class="space-y-3 border border-white/10 bg-[#1a1a1a] p-4"
			>
				<input
					name="email"
					type="email"
					required
					placeholder="Recipient email"
					class="w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
				/>
				<input
					name="amount"
					type="number"
					required
					min={data.giftMin}
					step="1"
					placeholder="Amount (min {data.giftMin})"
					class="w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={!data.giftsEnabled || busy === 'gift'}
					class="w-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white disabled:opacity-40"
				>
					Send credits
				</button>
				{#if form?.gifted}
					<p class="text-xs text-emerald-300">{form.gifted}</p>
				{/if}
				{#if !data.giftsEnabled}
					<p class="text-xs text-white/30">Gifting is currently disabled.</p>
				{/if}
			</form>
		</section>
	</div>
</div>
