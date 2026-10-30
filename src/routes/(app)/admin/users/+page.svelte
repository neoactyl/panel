<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import IconUser from '@tabler/icons-svelte/icons/user';
	import IconBan from '@tabler/icons-svelte/icons/ban';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const { enhance: enhanceRole, message: roleMessage } = superForm(data.roleForm, { id: 'role' });
	const { enhance: enhanceBan, message: banMessage } = superForm(data.banForm, { id: 'ban' });
	const { enhance: enhanceDelete, message: deleteMessage } = superForm(data.deleteForm, { id: 'delete' });

	const date = (value: Date | string | number) =>
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
</script>

<svelte:head>
	<title>Users - {data.branding.name}</title>
</svelte:head>

<div class="space-y-4">
	{#if $roleMessage && typeof $roleMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$roleMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$roleMessage.text}
		</div>
	{/if}
	{#if $banMessage && typeof $banMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$banMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$banMessage.text}
		</div>
	{/if}
	{#if $deleteMessage && typeof $deleteMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$deleteMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$deleteMessage.text}
		</div>
	{/if}

	<div class="overflow-x-auto border border-white/10 bg-[#1a1a1a]">
		<table class="w-full min-w-[640px] text-left text-sm">
			<thead>
				<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
					<th class="px-4 py-3 font-semibold">User</th>
					<th class="px-4 py-3 font-semibold">Role</th>
					<th class="px-4 py-3 font-semibold">Status</th>
					<th class="px-4 py-3 font-semibold">Joined</th>
					<th class="px-4 py-3 text-right font-semibold">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as account (account.id)}
					<tr class="border-b border-white/5 last:border-0">
						<td class="px-4 py-3">
							<div class="flex items-center gap-3">
								<div class="flex h-8 w-8 items-center justify-center border border-white/10 bg-white/5">
									{#if account.role === 'admin'}
										<IconShieldLock class="h-4 w-4 text-indigo-300" />
									{:else}
										<IconUser class="h-4 w-4 text-white/40" />
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate font-semibold text-white">
										{account.name}
										{#if account.id === data.user.id}
											<span class="ml-1 text-[10px] font-semibold tracking-wider text-indigo-300 uppercase">You</span>
										{/if}
									</p>
									<p class="truncate text-xs text-white/40">{account.email}</p>
								</div>
							</div>
						</td>
						<td class="px-4 py-3">
							<span
								class="border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase
									{account.role === 'admin'
									? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
									: 'border-white/10 bg-white/5 text-white/50'}"
							>
								{account.role ?? 'user'}
							</span>
						</td>
						<td class="px-4 py-3">
							{#if account.banned}
								<span class="border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-red-300 uppercase">
									Banned
								</span>
							{:else}
								<span class="text-xs text-white/40">Active</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-xs text-white/50">{date(account.createdAt)}</td>
						<td class="px-4 py-3">
							<div class="flex justify-end gap-2">
								<a
									href="/admin/users/{account.id}"
									class="border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
								>
									Resources
								</a>

								<form method="POST" action="?/role" use:enhanceRole>
									<input type="hidden" name="userId" value={account.id} />
									<input type="hidden" name="role" value={account.role === 'admin' ? 'user' : 'admin'} />
									<button
										type="submit"
										disabled={account.id === data.user.id}
										class="border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
									>
										{account.role === 'admin' ? 'Demote' : 'Promote'}
									</button>
								</form>

								{#if account.role !== 'admin' && account.id !== data.user.id}
									<form method="POST" action="?/ban" use:enhanceBan>
										<input type="hidden" name="userId" value={account.id} />
										<input type="hidden" name="banned" value={account.banned ? 'false' : 'true'} />
										<button
											type="submit"
											class="flex items-center gap-1.5 border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10"
										>
											<IconBan class="h-3 w-3" />
											{account.banned ? 'Unban' : 'Ban'}
										</button>
									</form>
								{/if}

								{#if account.id !== data.user.id}
									<form method="POST" action="?/delete" use:enhanceDelete onsubmit={() => confirm('Are you sure you want to delete this user? This action cannot be undone.')}>
										<input type="hidden" name="userId" value={account.id} />
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" name="deletePanelAccount" value="true" class="h-4 w-4" />
											<span class="text-[11px] text-white/60">Delete panel account</span>
										</label>
										<button
											type="submit"
											class="flex items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
										>
											<IconTrash class="h-3 w-3" />
											Delete
										</button>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
