<script lang="ts">
	import { untrack } from 'svelte';
	import IconUserPlus from '@tabler/icons-svelte/icons/user-plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import { adapter } from '#lib/adapter/client.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import Modal from '#lib/components/app/Modal.svelte';
	import type { Subuser } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();

	let subusers = $state<Subuser[]>(untrack(() => [...data.subusers]));
	let email = $state('');
	let inviteOpen = $state(false);
	let inviting = $state(false);
	let inviteError = $state('');
	let editing = $state<Subuser | null>(null);
	let permissions = $state('');
	let updating = $state(false);
	let updateError = $state('');

	const openInvite = () => {
		email = '';
		inviteError = '';
		inviteOpen = true;
	};

	const invite = async (event: SubmitEvent) => {
		event.preventDefault();
		const value = email.trim().toLowerCase();
		if (!value) return;

		inviting = true;
		inviteError = '';

		try {
			const subuser = await adapter.createSubuser(panel.server.id, { email: value });
			subusers = [...subusers, subuser];
			inviteOpen = false;
			panel.showNotice(`Invited ${value}.`);
		} catch (cause) {
			inviteError = cause instanceof Error ? cause.message : 'Could not invite subuser.';
		} finally {
			inviting = false;
		}
	};

	const openPermissions = (subuser: Subuser) => {
		editing = subuser;
		permissions = subuser.permissions.join(', ');
		updateError = '';
	};

	const updateSubuser = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!editing) return;

		updating = true;
		updateError = '';

		try {
			const updated = await adapter.updateSubuser(panel.server.id, editing.id, {
				permissions: permissions
					.split(',')
					.map((permission) => permission.trim())
					.filter(Boolean)
			});
			subusers = subusers.map((entry) => (entry.id === updated.id ? updated : entry));
			editing = null;
			panel.showNotice(`Updated permissions for ${updated.username}.`);
		} catch (cause) {
			updateError = cause instanceof Error ? cause.message : 'Could not update subuser.';
		} finally {
			updating = false;
		}
	};

	const removeSubuser = async (subuser: Subuser) => {
		try {
			await adapter.deleteSubuser(panel.server.id, subuser.id);
			subusers = subusers.filter((entry) => entry.id !== subuser.id);
			panel.showNotice(`${subuser.username} removed.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not remove subuser.');
		}
	};

	const initials = (value: string) => value.slice(0, 2).toUpperCase();

	const formatDate = (value: string) =>
		new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h2 class="text-sm font-semibold text-white">Subusers</h2>
		<p class="text-xs text-white/40">Invite accounts and scope their access to this server.</p>
	</div>
	{#if data.capabilities.subusers}
		<Button
			variant="outline"
			size="sm"
			onclick={openInvite}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			<IconUserPlus class="h-3.5 w-3.5" />
			Invite subuser
		</Button>
	{/if}
</div>

<Modal
	open={inviteOpen}
	title="Invite subuser"
	description="Grant another account access to this server."
	onclose={() => {
		if (!inviting) inviteOpen = false;
	}}
>
	<form id="invite-subuser" onsubmit={invite} class="space-y-3">
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Email</span>
			<input
				bind:value={email}
				type="email"
				placeholder="user@example.com"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>
		{#if inviteError}
			<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
				{inviteError}
			</p>
		{/if}
	</form>

	{#snippet footer()}
		<Button
			variant="outline"
			onclick={() => (inviteOpen = false)}
			disabled={inviting}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			Cancel
		</Button>
		<Button
			type="submit"
			form="invite-subuser"
			disabled={inviting || !email.trim()}
			class="bg-indigo-500 text-white hover:bg-indigo-400"
		>
			{inviting ? 'Inviting...' : 'Invite'}
		</Button>
	{/snippet}
</Modal>

<Modal
	open={editing !== null}
	title="Subuser permissions"
	description={editing ? `Update access for ${editing.username}.` : ''}
	onclose={() => {
		if (!updating) editing = null;
	}}
>
	<form id="update-subuser" onsubmit={updateSubuser} class="space-y-3">
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Permissions
			</span>
			<input
				bind:value={permissions}
				placeholder="control.start, control.stop"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
			<span class="mt-1 block text-[11px] text-white/30">Comma separated permissions.</span>
		</label>
		{#if updateError}
			<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
				{updateError}
			</p>
		{/if}
	</form>

	{#snippet footer()}
		<Button
			variant="outline"
			onclick={() => (editing = null)}
			disabled={updating}
			class="border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
		>
			Cancel
		</Button>
		<Button
			type="submit"
			form="update-subuser"
			disabled={updating}
			class="bg-indigo-500 text-white hover:bg-indigo-400"
		>
			{updating ? 'Saving...' : 'Save'}
		</Button>
	{/snippet}
</Modal>

<section class="border border-white/10 bg-[#1a1a1a]">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<th class="px-4 py-2 font-semibold">User</th>
				<th class="px-4 py-2 font-semibold">Permissions</th>
				<th class="px-4 py-2 font-semibold">Added</th>
				<th class="px-4 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each subusers as subuser (subuser.id)}
				<tr class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
					<td class="px-4 py-3">
						<div class="flex items-center gap-3">
							<span
								class="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/5 text-[10px] font-bold text-white/60"
							>
								{initials(subuser.username)}
							</span>
							<div class="min-w-0">
								<p class="truncate text-xs font-semibold text-white">{subuser.username}</p>
								<p class="truncate text-[11px] text-white/40">{subuser.email}</p>
							</div>
						</div>
					</td>
					<td class="px-4 py-3">
						<div class="flex max-w-sm flex-wrap gap-1">
							{#each subuser.permissions as permission (permission)}
								<span
									class="border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/50"
								>
									{permission}
								</span>
							{/each}
						</div>
					</td>
					<td class="px-4 py-3 text-xs text-white/40">{formatDate(subuser.addedAt)}</td>
					<td class="px-4 py-3 text-right">
						<div class="flex items-center justify-end gap-2">
							{#each subuser.actions ?? [] as action (action)}
								{#if action === 'update'}
									<button
										type="button"
										onclick={() => openPermissions(subuser)}
										class="text-[11px] font-semibold text-white/50 transition hover:text-indigo-300"
									>
										Permissions
									</button>
								{:else if action === 'delete'}
									<button
										type="button"
										onclick={() => removeSubuser(subuser)}
										aria-label="Remove subuser"
										class="flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-red-500/10 hover:text-red-300"
									>
										<IconTrash class="h-3.5 w-3.5" />
									</button>
								{/if}
							{/each}
						</div>
					</td>
				</tr>
			{/each}
			{#if !subusers.length}
				<tr>
					<td colspan="4" class="px-4 py-8 text-center text-xs text-white/40">
						No subusers yet.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</section>
