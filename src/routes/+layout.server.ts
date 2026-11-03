import { redirect } from '@sveltejs/kit';
import { hasAdmin, isAdmin } from '#lib/server/auth/admin.ts';
import { getPublicSettings } from '#lib/server/config/settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const adminExists = await hasAdmin();

	if (!adminExists && !url.pathname.startsWith('/setup') && !url.pathname.startsWith('/auth')) {
		redirect(307, '/setup');
	}

	const publicSettings = getPublicSettings();

	return {
		...publicSettings,
		isAdmin: isAdmin(locals.user),
		soundEnabled: publicSettings.ui?.soundEnabled ?? true
	};
};
