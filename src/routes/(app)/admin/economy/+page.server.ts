import { sql } from 'drizzle-orm';
import { actionFailure } from '#lib/server/action-error.ts';
import { adminFailure, requireAdmin } from '#lib/server/auth/admin.ts';
import { formBoolean, formNumber, formString } from '#lib/server/forms.ts';
import { db } from '#lib/server/db/index.ts';
import { creditAccount, referral } from '#lib/server/db/ops.ts';
import {
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

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

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
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();

		try {
			const expires = formString(data, 'expiresAt');
			await createVoucher({
				code: formString(data, 'code'),
				description: formString(data, 'description'),
				kind: formString(data, 'kind') === 'resource' ? 'resource' : 'credits',
				credits: formNumber(data, 'credits'),
				cpu: formNumber(data, 'cpu'),
				memory: formNumber(data, 'memory'),
				disk: formNumber(data, 'disk'),
				maxUses: formNumber(data, 'maxUses'),
				expiresAt: expires || null,
				enabled: true
			});
			return { created: 'Voucher created.' };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	toggleVoucher: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		await updateVoucher(formString(data, 'id'), {
			enabled: formBoolean(data, 'enabled')
		});
		return { updated: true };
	},

	deleteVoucher: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		await deleteVoucher(formString(data, 'id'));
		return { deleted: true };
	},

	createTask: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();

		try {
			await createEarnTask({
				title: formString(data, 'title'),
				description: formString(data, 'description'),
				url: formString(data, 'url'),
				provider: formString(data, 'provider') || 'linkvertise',
				reward: formNumber(data, 'reward'),
				cooldownHours: formNumber(data, 'cooldownHours', 24),
				minSeconds: formNumber(data, 'minSeconds', 15),
				enabled: true,
				sortOrder: formNumber(data, 'sortOrder')
			});
			return { created: 'Task created.' };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	toggleTask: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		await updateEarnTask(formString(data, 'id'), {
			enabled: formBoolean(data, 'enabled')
		});
		return { updated: true };
	},

	deleteTask: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		await deleteEarnTask(formString(data, 'id'));
		return { deleted: true };
	}
};



