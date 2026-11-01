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
	let invitePermissions = $state<string[]>([]);
	let invitePermissionText = $state('');
	let editing = $state<Subuser | null>(null);
	let editPermissions = $state<string[]>([]);
	let editPermissionText = $state('');
	let updating = $state(false);
	let updateError = $state('');

	const hasPermissionList = $derived(data.permissionGroups.length > 0);

	const splitPermissions = (value: string) =>
		value
			.split(',')
			.map((permission) => permission.trim())
			.filter(Boolean);

	const selectedPermissions = (target: 'invite' | 'edit') =>
		target === 'invite' ? invitePermissions : editPermissions;

	const isPermissionSelected = (key: string, target: 'invite' | 'edit') =>
		selectedPermissions(target).includes(key);

	const togglePermission = (key: string, target: 'invite' | 'edit') => {
		const current = selectedPermissions(target);
		const next = current.includes(key)
			? current.filter((permission) => permission !== key)
			: [...current, key];

		if (target === 'invite') invitePermissions = next;
		else editPermissions = next;
	};

	const setAllPermissions = (target: 'invite' | 'edit', select: boolean) => {
		const next = select
			? data.permissionGroups.flatMap((group) =>
					group.permissions.map((permission) => permission.key)
				)
			: [];

		if (target === 'invite') invitePermissions = next;
		else editPermissions = next;
	};

	const openInvite = () => {
		email = '';
		inviteError = '';
		invitePermissions = [];
		invitePermissionText = '';
		inviteOpen = true;
	};

	const invite = async (event: SubmitEvent) => {
		event.preventDefault();
		const value = email.trim().toLowerCase();
		if (!value) return;

		inviting = true;
		inviteError = '';

		try {
			const subuser = await adapter.createSubuser(panel.server.id, {
				email: value,
				permissions: hasPermissionList
					? invitePermissions
					: splitPermissions(invitePermissionText)
			});
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
		editPermissions = [...subuser.permissions];
		editPermissionText = subuser.permissions.join(', ');
		updateError = '';
	};

	const updateSubuser = async (event: SubmitEvent) => {
		event.preventDefault();
		if (!editing) return;

		updating = true;
		updateError = '';

		try {
			const updated = await adapter.updateSubuser(panel.server.id, editing.id, {
				permissions: hasPermissionList
					? editPermissions
					: splitPermissions(editPermissionText)
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

{#snippet permissionPicker(target: 'invite' | 'edit')}
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Permissions
			</span>
			{#if hasPermissionList}
				<div class="flex items-center gap-2 text-[11px]">
					<button
						type="button"
						onclick={() => setAllPermissions(target, true)}
						class="text-white/40 transition hover:text-white"
					>
						Select all
					</button>
					<span class="text-white/15">·</span>
					<button
						type="button"
						onclick={() => setAllPermissions(target, false)}
						class="text-white/40 transition hover:text-white"
					>
						Clear
					</button>
				</div>
			{/if}
		</div>

		{#if hasPermissionList}
			<div class="max-h-64 space-y-3 overflow-y-auto border border-white/10 bg-[#121212] p-3">
				{#each data.permissionGroups as group (group.key)}
					<div>
						<p class="font-mono text-[10px] font-semibold tracking-wider text-indigo-300/70 uppercase">
							{group.key}
						</p>
						{#if group.description}
							<p class="mt-0.5 text-[11px] text-white/30">{group.description}</p>
						{/if}
						<div class="mt-1 space-y-1">
							{#each group.permissions as permission (permission.key)}
								<label class="flex cursor-pointer items-start gap-2 text-xs text-white/70">
									<input
										type="checkbox"
										checked={isPermissionSelected(permission.key, target)}
										onchange={() => togglePermission(permission.key, target)}
										class="mt-0.5 accent-indigo-500"
									/>
									<span class="min-w-0">
										<span class="font-mono text-[11px] text-white/70">{permission.key}</span>
										<span class="block text-[11px] text-white/35">{permission.description}</span>
									</span>
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<p class="text-[11px] text-white/30">
				{selectedPermissions(target).length} permission{selectedPermissions(target).length === 1
					? ''
					: 's'} selected
			</p>
		{:else if target === 'invite'}
			<input
				bind:value={invitePermissionText}
				placeholder="control.start, control.stop"
				class="w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
			<span class="block text-[11px] text-white/30">
				This panel does not expose a permission list. Enter comma separated permissions.
			</span>
		{:else}
			<input
				bind:value={editPermissionText}
				placeholder="control.start, control.stop"
				class="w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
			<span class="block text-[11px] text-white/30">
				This panel does not expose a permission list. Enter comma separated permissions.
			</span>
		{/if}
	</div>
{/snippet}

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
		{@render permissionPicker('invite')}
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
		{@render permissionPicker('edit')}
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
								<p class="truncate text-[11px] text-white/40">
									{subuser.email || 'Panel account'}
								</p>
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
