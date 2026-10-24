import { redirect } from '@sveltejs/kit';
import { getAuth, type AuthApi } from '#lib/server/auth/auth.ts';
import { hasAdmin, setUserRole } from '#lib/server/auth/admin.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import { resetAdapter } from '#lib/server/panel/adapter.ts';
import { getPanelConfig, loadSettings, updateSettings } from '#lib/server/config/settings.ts';
import { setupCreateSchema, setupSettingsSchema } from '#lib/schemas.ts';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, message } from 'sveltekit-superforms/server';
import { asc, count, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const userCount = async () => {
	const [row] = await db.select({ total: count() }).from(user);
	return row?.total ?? 0;
};

const firstUser = () =>
	db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.orderBy(asc(user.createdAt), asc(user.id))
		.limit(1)
		.get();

const applySettings = async (form: z.infer<typeof setupSettingsSchema>): Promise<string | undefined> => {
	const existingToken = Boolean(getPanelConfig().token);
	const token = form.panelToken?.trim() ?? '';

	if (form.adapter === 'calagopus') {
		if (!/^https?:\/\/.+/i.test(form.panelUrl ?? '')) {
			return 'A valid Calagopus panel URL is required.';
		}

		if (!token && !existingToken) {
			return 'A panel API token is required.';
		}
	}

	const next = {
		'brand.name': form.appName || 'Neoactyl',
		'brand.logo': form.logo ?? '',
		'brand.description': form.description || 'Game server management',
		'panel.adapter': form.adapter,
		'panel.url': form.panelUrl ?? '',
		'panel.token': !token ? getPanelConfig().token : token
	};

	await updateSettings(next);
	await loadSettings(true);
	resetAdapter();

	return undefined;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (await hasAdmin()) {
		redirect(302, '/admin');
	}

	const [hasUsers, oldest] = await Promise.all([userCount(), firstUser()]);
	const canClaim = Boolean(locals.user && oldest && locals.user.id === oldest.id);

	return {
		existingUser: locals.user
			? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
			: null,
		hasUsers,
		canClaim,
		panel: {
			adapter: getPanelConfig().adapter,
			url: getPanelConfig().url,
			tokenSet: Boolean(getPanelConfig().token)
		},
		createForm: await superValidate(zod4(setupCreateSchema), { id: 'create' }),
		claimForm: await superValidate(zod4(setupSettingsSchema), { id: 'claim' })
	};
};

export const actions: Actions = {
	create: async (event) => {
		const form = await superValidate(event.request, zod4(setupCreateSchema), { id: 'create' });

		if (await hasAdmin()) {
			return message(form, 'An administrator already exists.', { status: 400 });
		}

		if ((await userCount()) > 0) {
			return message(
				form,
				'Accounts already exist. Sign in with the first account to claim administrator.',
				{ status: 409 }
			);
		}

		if (!form.valid) {
			return message(form, 'Please review the highlighted fields.', { status: 400 });
		}

		const email = form.data.email.trim().toLowerCase();

		const existing = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);

		if (existing.length > 0) {
			return message(
				form,
				'That email already exists. Sign in first, then claim the administrator role.',
				{ status: 400 }
			);
		}

		const problem = await applySettings(form.data);

		if (problem) {
			return message(form, problem, { status: 400 });
		}

		let created: Awaited<ReturnType<AuthApi['signUpEmail']>>;

		try {
			created = await getAuth().api.signUpEmail({
				body: { name: form.data.name, email, password: form.data.password }
			});
		} catch {
			return message(form, 'Unable to create the administrator account.', { status: 400 });
		}

		const oldest = await firstUser();

		if (!oldest || oldest.id !== created.user.id) {
			return message(
				form,
				'Another account was created first. Sign in with the first account to claim administrator.',
				{ status: 409 }
			);
		}

		await setUserRole(created.user.id, 'admin');
		redirect(303, '/admin');
	},

	claim: async (event) => {
		const { locals } = event;
		const form = await superValidate(event.request, zod4(setupSettingsSchema), { id: 'claim' });

		if (await hasAdmin()) {
			return message(form, 'An administrator already exists.', { status: 400 });
		}

		if (!locals.user) {
			return message(form, 'Sign in to claim the administrator role.', { status: 401 });
		}

		const oldest = await firstUser();

		if (!oldest || oldest.id !== locals.user.id) {
			return message(
				form,
				'Only the first account created on this instance can claim the administrator role.',
				{ status: 403 }
			);
		}

		if (!form.valid) {
			return message(form, 'Please review the highlighted fields.', { status: 400 });
		}

		const problem = await applySettings(form.data);

		if (problem) {
			return message(form, problem, { status: 400 });
		}

		await setUserRole(locals.user.id, 'admin');
		redirect(303, '/admin');
	}
};
