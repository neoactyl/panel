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

	redeem: async ({ locals, request }) => {
		const data = await request.formData();
		const code = String(data.get('code') ?? '');

		try {
			const result = await redeemVoucher(locals.user!.id, code);
			return {
				redeemed:
					result.kind === 'resource'
						? `Added ${result.cpu}% CPU, ${result.memory} MB memory and ${result.disk} MB disk.`
						: `Added ${result.credits} credits to your balance.`
			};
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},

	gift: async ({ locals, request }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();
		const amount = Number(data.get('amount') ?? 0);

		if (!email) return fail(400, { error: 'Enter the email of the person you want to gift.' });

		const recipient = await db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(eq(user.email, email))
			.get();

		if (!recipient) return fail(404, { error: 'No account uses that email address.' });

		try {
			const result = await giftCredits(locals.user!.id, recipient.id, amount);
			return { gifted: `Sent ${result.amount} credits to ${recipient.name}.`, balance: result.balance };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	}
};
