import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getCreditBalance } from '#lib/server/billing/credits.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import {
	EarnError,
	claimEarnTask,
	giftCredits,
	listEarnTasks,
	redeemVoucher,
	startEarnTask
} from '#lib/server/billing/earn.ts';
import { getBool, getNumber } from '#lib/server/config/settings.ts';
import type { Actions, PageServerLoad } from './$types';

const message = (cause: unknown) =>
	cause instanceof EarnError ? cause.message : 'Something went wrong. Please try again.';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;

	const [tasks, balance] = await Promise.all([listEarnTasks(userId), getCreditBalance(userId)]);

	return {
		tasks,
		balance,
		verified: url.searchParams.get('verified') === '1',
		tasksEnabled: getBool('tasks.enabled') && getBool('credits.allowEarn'),
		vouchersEnabled: getBool('vouchers.enabled') && getBool('credits.allowEarn'),
		giftsEnabled: getBool('credits.giftEnabled'),
		giftMin: Math.max(1, getNumber('credits.giftMin')),
		currency: 'credits'
	};
};

export const actions: Actions = {
	start: async ({ locals, request }) => {
		const data = await request.formData();
		const taskId = String(data.get('taskId') ?? '');

		try {
			const started = await startEarnTask(locals.user!.id, taskId);
			return { url: started.url, completionId: started.completionId };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},

	claim: async ({ locals, request }) => {
		const data = await request.formData();
		const taskId = String(data.get('taskId') ?? '');

		try {
			const result = await claimEarnTask(locals.user!.id, taskId);
			return { reward: result.reward, balance: result.balance };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},
};
