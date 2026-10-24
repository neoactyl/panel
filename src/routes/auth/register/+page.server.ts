import { getAuth, type AuthApi } from '#lib/server/auth/auth.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { db } from '#lib/server/db/index.ts';
import {
	PanelAuthError,
	getPanelAccountOwner,
	linkPanelAccount,
	panelAccountCreationEnabled,
	registerPanelUser
} from '#lib/server/auth/panel-auth.ts';
import { applyReferral, resolveReferralCode } from '#lib/server/billing/referrals.ts';
import {
	SecurityError,
	assertRegistrationAllowed,
	getClientIp,
	recordRegistration
} from '#lib/server/auth/security.ts';
import { redirect } from '@sveltejs/kit';
import { registerSchema } from '#lib/schemas.ts';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, message } from 'sveltekit-superforms/server';
import { eq } from 'drizzle-orm';
import { getBool } from '#lib/server/config/settings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(302, '/');
	}

	if (!getBool('auth.registration')) {
		redirect(302, '/auth/login');
	}

	const ref = url.searchParams.get('ref')?.trim() ?? '';
	const referrer = ref ? await resolveReferralCode(ref) : null;

	return {
		ref,
		referrer: referrer?.name ?? null,
		registerForm: await superValidate(zod4(registerSchema), { id: 'register' })
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { url } = event;
		const form = await superValidate(event.request, zod4(registerSchema), { id: 'register' });

		if (!getBool('auth.registration')) {
			return message(form, 'Registration is disabled.', { status: 403 });
		}

		const ip = getClientIp(event);

		try {
			await assertRegistrationAllowed(ip);
		} catch (cause) {
			if (cause instanceof SecurityError) {
				return message(form, cause.message, { status: 403 });
			}
			throw cause;
		}

		if (!form.valid) {
			return message(form, 'Please review the highlighted fields.', { status: 400 });
		}

		const email = form.data.email.trim().toLowerCase();
		const password = form.data.password;
		const ref = (form.data.ref ?? url.searchParams.get('ref') ?? '').trim();

		const existing = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);

		if (existing.length > 0) {
			return message(form, 'An account with this email already exists.', { status: 400 });
		}

		let panelIdentity: Awaited<ReturnType<typeof registerPanelUser>> | undefined;

		if (panelAccountCreationEnabled()) {
			try {
				panelIdentity = await registerPanelUser(form.data.name, email, password);

				if (await getPanelAccountOwner(panelIdentity.id)) {
					return message(form, 'This panel account is already linked to another user.', {
						status: 400
					});
				}
			} catch (cause) {
				return message(
					form,
					cause instanceof PanelAuthError
						? cause.message
						: 'Could not connect to the panel to create your account.',
					{ status: 400 }
				);
			}
		}

		let created: Awaited<ReturnType<AuthApi['signUpEmail']>>;

		try {
			created = await getAuth().api.signUpEmail({
				body: { name: form.data.name, email, password }
			});
		} catch {
			return message(form, 'Unable to create account. That email may already be in use.', {
				status: 400
			});
		}

		if (panelIdentity) {
			await linkPanelAccount(created.user.id, panelIdentity);
		}

		recordRegistration(ip, created.user.id, email);

		if (ref) {
			try {
				await applyReferral(created.user.id, ref);
			} catch (cause) {
				console.error('Unable to apply referral reward.', cause);
			}
		}

		redirect(302, '/');
	}
};
