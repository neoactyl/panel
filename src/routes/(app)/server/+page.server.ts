import { fail, redirect } from '@sveltejs/kit';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { getBool } from '#lib/server/config/settings.ts';
import {
	getRenewalSettings,
	getServerBilling,
	listServerBillings,
	renewBillingNow
} from '#lib/server/billing/billing.ts';
import { CreditError } from '#lib/server/billing/credits.ts';
import { formatTimeRemaining, getRenewalWindow } from '#lib/renewal-window.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	if (url.searchParams.get('create') === '1') {
		redirect(307, '/server/create');
	}

	const adapter = getUserAdapter(locals.panelUserId);
	const renewal = getRenewalSettings();
	const [servers, billings] = await Promise.all([
		adapter.getServers(),
		listServerBillings(locals.user.id)
	]);

	return {
		servers,
		allowCreate: getBool('server.allowCreate') && adapter.capabilities.servers.create,
		billings,
		renewal
	};
};

export const actions: Actions = {
	renew: async ({ locals, request }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { message: 'You must sign in to renew a server.' });
		}

		if (!getRenewalSettings().enabled) {
			return fail(400, { message: 'Server renewals are disabled.' });
		}

		const data = await request.formData();
		const serverId = String(data.get('serverId') ?? '').trim();

		if (!serverId) {
			return fail(400, { message: 'Choose a server to renew.' });
		}

		const billing = await getServerBilling(serverId);

		if (!billing || billing.userId !== locals.user.id) {
			return fail(404, { message: 'Server billing was not found.' });
		}

		const renewalWindow = getRenewalWindow(billing);

		if (!renewalWindow.canRenew) {
			return fail(400, {
				message: `Renewals open when less than 2% of the billing period remains (${formatTimeRemaining(renewalWindow.remainingMs)} left).`
			});
		}

		try {
			const result = await renewBillingNow(locals.user.id, serverId);

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
	}
};
