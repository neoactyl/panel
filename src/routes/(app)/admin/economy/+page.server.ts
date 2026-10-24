import { error, fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { db } from '#lib/server/db/index.ts';
import { creditAccount, referral } from '#lib/server/db/ops.ts';
import {
	EarnError,
	createEarnTask,
	createVoucher,
	deleteEarnTask,
	deleteVoucher,
	listAllEarnTasks,
	listVouchers,
	updateEarnTask,
	updateVoucher
} from '#lib/server/billing/earn.ts';
import type { Actions, PageServerLoad } from './$types';

const guard = (user: Parameters<typeof isAdmin>[0]) => {
	if (!isAdmin(user)) error(403, { message: 'Administrator access is required.' });
};

const numberValue = (data: FormData, key: string, fallback = 0) => {
	const value = Number(data.get(key) ?? fallback);
	return Number.isFinite(value) ? value : fallback;
};

const message = (cause: unknown) =>
	cause instanceof EarnError ? cause.message : 'Something went wrong. Please try again.';

export const load: PageServerLoad = async ({ locals }) => {
	guard(locals.user);

	const [vouchers, tasks, creditTotal, referralTotal] = await Promise.all([
		listVouchers(),
		listAllEarnTasks(),
		db
			.select({ total: sql<number>`coalesce(sum(${creditAccount.balance}), 0)` })
			.from(creditAccount)
			.get(),
		db.select({ total: sql<number>`count(*)` }).from(referral).get()
	]);

	return {
		vouchers,
		tasks,
		stats: {
			credited: creditTotal?.total ?? 0,
			referrals: referralTotal?.total ?? 0
		}
	};
};

export const actions: Actions = {
	createVoucher: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();

		try {
			const expires = String(data.get('expiresAt') ?? '').trim();
			await createVoucher({
				code: String(data.get('code') ?? ''),
				description: String(data.get('description') ?? ''),
				kind: String(data.get('kind') ?? 'credits') === 'resource' ? 'resource' : 'credits',
				credits: numberValue(data, 'credits'),
				cpu: numberValue(data, 'cpu'),
				memory: numberValue(data, 'memory'),
				disk: numberValue(data, 'disk'),
				maxUses: numberValue(data, 'maxUses'),
				expiresAt: expires || null,
				enabled: true
			});
			return { created: 'Voucher created.' };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},

	toggleVoucher: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();
		await updateVoucher(String(data.get('id') ?? ''), {
			enabled: String(data.get('enabled') ?? '') === 'true'
		});
		return { updated: true };
	},

	deleteVoucher: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();
		await deleteVoucher(String(data.get('id') ?? ''));
		return { deleted: true };
	},

	createTask: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();

		try {
			await createEarnTask({
				title: String(data.get('title') ?? ''),
				description: String(data.get('description') ?? ''),
				url: String(data.get('url') ?? ''),
				provider: String(data.get('provider') ?? 'linkvertise'),
				reward: numberValue(data, 'reward'),
				cooldownHours: numberValue(data, 'cooldownHours', 24),
				minSeconds: numberValue(data, 'minSeconds', 15),
				enabled: true,
				sortOrder: numberValue(data, 'sortOrder')
			});
			return { created: 'Task created.' };
		} catch (cause) {
			return fail(400, { error: message(cause) });
		}
	},

	toggleTask: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();
		await updateEarnTask(String(data.get('id') ?? ''), {
			enabled: String(data.get('enabled') ?? '') === 'true'
		});
		return { updated: true };
	},

	deleteTask: async ({ locals, request }) => {
		guard(locals.user);
		const data = await request.formData();
		await deleteEarnTask(String(data.get('id') ?? ''));
		return { deleted: true };
	}
};
