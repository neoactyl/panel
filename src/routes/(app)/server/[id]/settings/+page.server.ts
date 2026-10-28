import { fail } from '@sveltejs/kit';
import { AdapterError, type Server } from '#lib/adapter/sdk.ts';
import {
	getRenewalSettings,
	getServerBilling,
	renewBillingNow,
	setAutoRenew
} from '#lib/server/billing/billing.ts';
import { CreditError } from '#lib/server/billing/credits.ts';
import { formatTimeRemaining, getRenewalWindow } from '#lib/renewal-window.ts';
import { toInt } from '#lib/server/forms.ts';
import { getBool } from '#lib/server/config/settings.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { resourceTotals } from '#lib/server/quota/resources.ts';
import { getEffectiveQuota } from '#lib/server/quota/user.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const renewal = getRenewalSettings();
	const empty = { quota: null, remaining: null, billing: null, renewal };

	if (!locals.session || !locals.user) return empty;

	const billing = await getServerBilling(params.id);
	const ownedBilling = billing && billing.userId === locals.user.id ? billing : null;
	const billingView = ownedBilling
		? {
				autoRenew: ownedBilling.autoRenew,
				nextRenewalAt: ownedBilling.nextRenewalAt,
				status: ownedBilling.status,
				renewalPrice: ownedBilling.renewalPrice,
				intervalDays: ownedBilling.intervalDays
			}
		: null;

	const adapter = getUserAdapter(locals.panelUserId);
	const quotaEnforced = adapter.capabilities.accounts.link && getBool('panel.linkAccounts');

	if (!quotaEnforced || !adapter.capabilities.servers.update) {
		return { ...empty, billing: billingView };
	}

	try {
		const [servers, quota] = await Promise.all([
			adapter.getServers(),
			getEffectiveQuota(locals.user.id)
		]);
		const used = resourceTotals(servers.filter((server) => server.id !== params.id));

		return {
			quota,
			remaining: {
				cpu: Math.max(0, quota.cpu - used.cpu),
				memory: Math.max(0, quota.memory - used.memory),
				disk: Math.max(0, quota.disk - used.disk)
			},
			billing: billingView,
			renewal
		};
	} catch {
		return { ...empty, billing: billingView };
	}
};

export const actions: Actions = {
	resources: async ({ locals, params, request }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { message: 'You must be signed in to edit a server.' });
		}

		const data = await request.formData();
		const cpu = toInt(data.get('cpu'), 1);
		const ram = toInt(data.get('ram'), 1);
		const disk = toInt(data.get('disk'), 1);
		const databases = toInt(data.get('databases'));
		const allocations = toInt(data.get('allocations'));

		if (cpu === null || ram === null || disk === null) {
			return fail(400, { message: 'CPU, memory, and disk must be positive whole numbers.' });
		}

		if (databases === null || allocations === null) {
			return fail(400, { message: 'Database and allocation limits must be whole numbers.' });
		}

		const adapter = getUserAdapter(locals.panelUserId);

		if (!adapter.capabilities.servers.update) {
			return fail(403, { message: 'This panel does not support server updates.' });
		}

		let current: Server;
		let servers: Server[];

		try {
			[current, servers] = await Promise.all([
				adapter.getServer(params.id),
				adapter.getServers()
			]);
		} catch (cause) {
			return fail(cause instanceof AdapterError && cause.code === 'NOT_FOUND' ? 404 : 400, {
				message: cause instanceof Error ? cause.message : 'Could not load the server.'
			});
		}

		const quotaEnforced = adapter.capabilities.accounts.link && getBool('panel.linkAccounts');

		if (quotaEnforced) {
			const quota = await getEffectiveQuota(locals.user.id);
			const used = resourceTotals(servers.filter((server) => server.id !== params.id));
			const exceeded: string[] = [];

			if (cpu > quota.cpu - used.cpu) {
				exceeded.push(`CPU ${cpu}% (${Math.max(0, quota.cpu - used.cpu)}% left)`);
			}

			if (ram > quota.memory - used.memory) {
				exceeded.push(
					`memory ${ram} MB (${Math.max(0, quota.memory - used.memory)} MB left)`
				);
			}

			if (disk > quota.disk - used.disk) {
				exceeded.push(`disk ${disk} MB (${Math.max(0, quota.disk - used.disk)} MB left)`);
			}

			if (quota.maxDatabases > 0 && databases > quota.maxDatabases) {
				exceeded.push(
					`${databases} databases (${quota.maxDatabases} allowed per server)`
				);
			}

			const extraAllocations = Math.max(0, allocations - 1);

			if (quota.maxAllocations > 0 && extraAllocations > quota.maxAllocations) {
				exceeded.push(
					`${extraAllocations} extra allocations (${quota.maxAllocations} allowed per server)`
				);
			}

			if (exceeded.length > 0) {
				return fail(400, {
					message: `These resources exceed your allocation: ${exceeded.join(', ')}.`
				});
			}
		}

		try {
			const server = await adapter.updateServer(params.id, {
				cpu,
				ram,
				disk,
				databases,
				allocations
			});

			logActivity({
				userId: locals.user.id,
				action: 'server.resources',
				message: `Updated resources for ${server.name}`,
				metadata: {
					serverId: params.id,
					before: {
						cpu: current.cpu.limit,
						ram: current.memory.limit,
						disk: current.disk.limit,
						databases: current.databaseLimit,
						allocations: current.allocationLimit
					},
					after: { cpu, ram, disk, databases, allocations }
				}
			});

			return { success: `Resources updated for ${server.name}.` };
		} catch (cause) {
			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Could not update the server resources.'
			});
		}
	},

	renew: async ({ locals, params }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { message: 'You must sign in to renew a server.' });
		}

		if (!getRenewalSettings().enabled) {
			return fail(400, { message: 'Server renewals are disabled.' });
		}

		const billing = await getServerBilling(params.id);

		if (!billing || billing.userId !== locals.user.id) {
			return fail(404, { message: 'Server billing was not found.' });
		}

		if (billing.status === 'deleted') {
			return fail(400, { message: 'This server has already been deleted.' });
		}

		if (billing.renewalPrice <= 0) {
			return fail(400, { message: 'This server has nothing to renew.' });
		}

		const renewalWindow = getRenewalWindow(billing);

		if (!renewalWindow.canRenew) {
			return fail(400, {
				message: `Renewals open when less than 2% of the billing period remains (${formatTimeRemaining(renewalWindow.remainingMs)} left).`
			});
		}

		try {
			const result = await renewBillingNow(locals.user.id, params.id);

			return {
				success: `Renewed for ${result.amount} credits. The next renewal is ${result.nextRenewalAt.toLocaleDateString()}.`
			};
		} catch (cause) {
			if (cause instanceof CreditError) {
				return fail(402, { message: cause.message });
			}

			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Could not renew this server.'
			});
		}
	},

	autoRenew: async ({ locals, params, request }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { message: 'You must sign in to change auto-renew.' });
		}

		if (!getRenewalSettings().enabled) {
			return fail(400, { message: 'Server renewals are disabled.' });
		}

		const data = await request.formData();
		const enabled = String(data.get('enabled') ?? '') === 'on';
		const updated = await setAutoRenew(locals.user.id, params.id, enabled);

		if (!updated) {
			return fail(404, { message: 'Server billing was not found.' });
		}

		logActivity({
			userId: locals.user.id,
			action: 'billing.auto_renew',
			message: `${enabled ? 'Enabled' : 'Disabled'} auto-renew for server ${params.id}`,
			metadata: { serverId: params.id, enabled }
		});

		return { success: `Auto-renew ${enabled ? 'enabled' : 'disabled'}.` };
	}
};

