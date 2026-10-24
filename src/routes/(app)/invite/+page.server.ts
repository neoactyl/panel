import { getReferralStats } from '#lib/server/billing/referrals.ts';
import { getBool, getNumber } from '#lib/server/config/settings.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const stats = await getReferralStats(locals.user!.id);

	return {
		stats,
		enabled: getBool('invites.enabled'),
		rewards: {
			coins: getNumber('invites.rewardCoins'),
			cpu: getNumber('invites.rewardCpu'),
			memory: getNumber('invites.rewardMemory'),
			disk: getNumber('invites.rewardDisk'),
			serverSlots: getNumber('invites.rewardServerSlots')
		}
	};
};
