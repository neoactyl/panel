import { count, eq } from 'drizzle-orm';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { getPanelConfig, getQuota, getSetting } from '#lib/server/config/settings.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [userCount, adminCount] = await Promise.all([
		db.select({ users: count() }).from(user),
		db.select({ admins: count() }).from(user).where(eq(user.role, 'admin'))
	]);

	const users = userCount[0]?.users ?? 0;
	const admins = adminCount[0]?.admins ?? 0;

	const panel = getPanelConfig();
	let servers = 0;
	let reachable = false;

	try {
		servers = (await getAdapter().getServers()).length;
		reachable = true;
	} catch {
		reachable = false;
	}

	return {
		counts: { users, admins, servers },
		panel: {
			adapter: panel.adapter,
			configured: panel.adapter === 'mock' || Boolean(panel.url && panel.token),
			reachable
		},
		quota: getQuota(),
		branding: {
			name: getSetting('brand.name'),
			logo: getSetting('brand.logo')
		}
	};
};
