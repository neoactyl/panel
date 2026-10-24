import { getAuth, type AuthApi } from '#lib/server/auth/auth.ts';
import {
	PanelAuthError,
	getPanelAccountOwner,
	getPanelUserId,
	linkPanelAccount,
	panelAuthEnabled,
	verifyPanelLogin
} from '#lib/server/auth/panel-auth.ts';
import {
	SecurityError,
	assertLoginAllowed,
	clearLoginFailures,
	getClientIp,
	recordLoginFailure
} from '#lib/server/auth/security.ts';
import { redirect } from '@sveltejs/kit';
import { emptySchema, loginSchema } from '#lib/schemas.ts';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, message } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(302, '/');
	}

	return {
		loginForm: await superValidate(zod4(loginSchema), { id: 'login' }),
		discordForm: await superValidate(zod4(emptySchema), { id: 'discord' })
	};
};

export const actions: Actions = {
	login: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema), { id: 'login' });

		if (!form.valid) {
			return message(form, form.errors.email?.[0] ?? form.errors.password?.[0] ?? 'Invalid login.', {
				status: 400
			});
		}

		const email = form.data.email.trim().toLowerCase();
		const password = form.data.password;
		const ip = getClientIp(event);

		try {
			assertLoginAllowed(ip);
		} catch (cause) {
			if (cause instanceof SecurityError) {
				return message(form, cause.message, { status: 429 });
			}
			throw cause;
		}

		let signedIn: Awaited<ReturnType<AuthApi['signInEmail']>>;

		try {
			signedIn = await getAuth().api.signInEmail({
				body: { email, password }
			});
		} catch {
			recordLoginFailure(ip, email);
			return message(form, 'Invalid email or password.', { status: 400 });
		}

		clearLoginFailures(ip);

		if (panelAuthEnabled() && !(await getPanelUserId(signedIn.user.id))) {
			try {
				const identity = await verifyPanelLogin(email, password);

				if (identity) {
					const owner = await getPanelAccountOwner(identity.id);

					if (!owner || owner === signedIn.user.id) {
						await linkPanelAccount(signedIn.user.id, identity);
					}
				}
			} catch (cause) {
				if (!(cause instanceof PanelAuthError)) throw cause;
			}
		}

		redirect(302, '/');
	},

	discord: async (event) => {
		const form = await superValidate(event.request, zod4(emptySchema), { id: 'discord' });

		let url: string | undefined;

		try {
			url = await getAuth()
				.api.signInSocial({
					body: { provider: 'discord', callbackURL: '/' }
				})
				.then((res) => res.url);
		} catch {
			return message(form, 'Discord sign-in is currently unavailable.', { status: 400 });
		}

		if (!url) {
			return message(form, 'Discord sign-in is not configured.', { status: 400 });
		}

		redirect(302, url, { external: true });
	}
};
