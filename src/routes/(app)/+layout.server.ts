import { redirect } from '@sveltejs/kit';
import type { PanelBlueprint } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { syncDiscordMembership } from '#lib/server/integrations/discord.ts';
import { getBranding, getPublicSettings } from '#lib/server/config/settings.ts';
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

	return {
		user: locals.user,
		isAdmin: isAdmin(locals.user),
		branding: getBranding(),
		nav: publicSettings.nav,
		features: publicSettings.features,
		appBlueprint
	};
};
