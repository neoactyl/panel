import { redirect } from '@sveltejs/kit';
import type { PanelBlueprint } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { syncDiscordMembership } from '#lib/server/integrations/discord.ts';
import { getBranding, getPublicSettings } from '#lib/server/config/settings.ts';
import { getRenewalSettings } from '#lib/server/billing/billing.ts';
import { getCreditBalance } from '#lib/server/billing/credits.ts';
import { listEnabledAdSlots } from '#lib/server/billing/ads.ts';
import { getUserSetting } from '#lib/server/db/user-settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.session || !locals.user) {
		redirect(302, '/auth/login');
	}

	let appBlueprint: PanelBlueprint = { pages: [] };

	try {
		appBlueprint = await getUserAdapter(locals.user?.id, locals.panelUserId).getPanelBlueprint('app');
	} catch {
		/* panel extensions are optional */
	}

	void syncDiscordMembership(locals.user.id).catch(() => undefined);

	const publicSettings = getPublicSettings();
	const renewal = getRenewalSettings();
	const [credits, perUserSound, adSlots] = await Promise.all([
		renewal.enabled ? getCreditBalance(locals.user.id) : Promise.resolve(null),
		getUserSetting(locals.user.id, 'soundEnabled'),
		listEnabledAdSlots()
	]);

	return {
		user: locals.user,
		isAdmin: isAdmin(locals.user),
		branding: publicSettings.branding,
		nav: publicSettings.nav,
		features: publicSettings.features,
		adSlots,
		soundEnabled: perUserSound && (publicSettings.ui?.soundEnabled ?? true),
		credits,
		currency: renewal.currency,
		appBlueprint
	};
};
