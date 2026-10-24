import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { getRenewalSettings } from '#lib/server/billing/billing.ts';
import { getCreditBalance, grantCredits, listCreditTransactions } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { getPanelUserId } from '#lib/server/auth/panel-auth.ts';
import { getNumber, getQuota } from '#lib/server/config/settings.ts';
import { getEffectiveQuota, getUserQuotaOverrides, setUserQuota } from '#lib/server/quota/user.ts';
import { firstFormError } from '#lib/server/form-error.ts';
import { grantSchema, userQuotaSchema } from '#lib/schemas.ts';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isAdmin(locals.user)) error(403, { message: 'Administrator access is required.' });

	const target = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, params.id))
		.get();

	if (!target) error(404, { message: 'User not found.' });

	const overrides = await getUserQuotaOverrides(target.id);
	const renewal = getRenewalSettings();

	const [quotaForm, grantForm] = await Promise.all([
		superValidate(
			{
				cpu: overrides?.cpu ?? null,
				memory: overrides?.memory ?? null,
				disk: overrides?.disk ?? null,
				maxServers: overrides?.maxServers ?? null
			},
			zod4(userQuotaSchema),
			{ id: 'quota' }
		),
		superValidate(zod4(grantSchema), { id: 'grant' })
	]);

	return {
		target,
		quotaForm,
		grantForm,
		panelUserId: await getPanelUserId(target.id),
		effective: await getEffectiveQuota(target.id),
		defaults: { ...getQuota(), maxServers: getNumber('server.maxPerUser') },
		credits: {
			enabled: renewal.enabled,
			currency: renewal.currency,
			balance: await getCreditBalance(target.id),
			transactions: await listCreditTransactions(target.id, 20)
		}
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(userQuotaSchema), { id: 'quota' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		if (!form.valid) {
			return message(form, firstFormError(form), { status: 400 });
		}

		const target = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, params.id))
			.get();

		if (!target) return message(form, 'User not found.', { status: 404 });

		await setUserQuota(target.id, {
			cpu: form.data.cpu,
			memory: form.data.memory,
			disk: form.data.disk,
			maxServers: form.data.maxServers
		});

		logActivity({
			userId: locals.user?.id,
			action: 'admin.user.quota',
			message: `Updated resource limits for ${target.email}`,
			metadata: {
				targetId: target.id,
				cpu: form.data.cpu,
				memory: form.data.memory,
				disk: form.data.disk,
				maxServers: form.data.maxServers
			}
		});

		return message(form, 'Resource limits updated.');
	},

	reset: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(userQuotaSchema), { id: 'quota' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		const target = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, params.id))
			.get();

		if (!target) return message(form, 'User not found.', { status: 404 });

		await setUserQuota(target.id, { cpu: null, memory: null, disk: null, maxServers: null });

		logActivity({
			userId: locals.user?.id,
			action: 'admin.user.quota.reset',
			message: `Reset resource limits for ${target.email}`,
			metadata: { targetId: target.id }
		});

		return message(form, 'Resource limits reset to the global defaults.');
	},

	grant: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(grantSchema), { id: 'grant' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		if (!form.valid) {
			return message(form, firstFormError(form), { status: 400 });
		}

		if (form.data.amount === null) {
			return message(form, 'Enter a positive whole number of credits.', { status: 400 });
		}

		const target = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, params.id))
			.get();

		if (!target) return message(form, 'User not found.', { status: 404 });

		const amount = form.data.amount;

		await grantCredits({
			userId: target.id,
			amount,
			reference: `admin:grant:${crypto.randomUUID()}`,
			description: form.data.description || 'Administrator credit grant',
			metadata: { adminId: locals.user?.id }
		});

		logActivity({
			userId: locals.user?.id,
			action: 'admin.user.credits',
			message: `Granted ${amount} credits to ${target.email}`,
			metadata: { targetId: target.id, amount }
		});

		return message(form, `Granted ${amount} credits.`);
	}
};
