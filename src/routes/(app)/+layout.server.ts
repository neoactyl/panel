import { redirect } from '@sveltejs/kit';
import type { PanelBlueprint } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { syncDiscordMembership } from '#lib/server/integrations/discord.ts';
import { getBranding, getPublicSettings } from '#lib/server/config/settings.ts';
import { getRenewalSettings } from '#lib/server/billing/billing.ts';
import { getCreditBalance } from '#lib/server/billing/credits.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	let appBlueprint: PanelBlueprint = { pages: [] };

	try {
		appBlueprint = await getUserAdapter(locals.panelUserId).getPanelBlueprint('app');
	} catch {
		/* panel extensions are optional */
	}

	void syncDiscordMembership(locals.user.id).catch(() => undefined);

	const publicSettings = getPublicSettings();
	const renewal = getRenewalSettings();
	const credits = renewal.enabled ? await getCreditBalance(locals.user.id) : null;

	return {
		user: locals.user,
		isAdmin: isAdmin(locals.user),
		branding: getBranding(),
		nav: publicSettings.nav,
		features: publicSettings.features,
		credits,
		currency: renewal.currency,
		appBlueprint
	};
};
