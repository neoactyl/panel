import { getAuth } from '#lib/server/auth/auth.ts';
import {
	PanelAuthError,
	getPanelAccount,
	getPanelAccountOwner,
	linkPanelAccount,
	panelAuthEnabled,
	verifyPanelLogin
} from '#lib/server/auth/panel-auth.ts';
import { redirect } from '@sveltejs/kit';
import { getBranding } from '#lib/server/config/settings.ts';
import { emptySchema, panelSchema, passwordSchema, profileSchema } from '#lib/schemas.ts';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, message } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	const [sessions, panel, profileForm, passwordForm, panelForm, revokeForm, signoutForm] =
		await Promise.all([
			getAuth().api.listSessions({ headers: request.headers }),
			getPanelAccount(locals.user.id),
			superValidate({ name: locals.user.name }, zod4(profileSchema), { id: 'profile' }),
			superValidate(zod4(passwordSchema), { id: 'password' }),
			superValidate(zod4(panelSchema), { id: 'panel' }),
			superValidate(zod4(emptySchema), { id: 'revoke' }),
			superValidate(zod4(emptySchema), { id: 'signout' })
		]);

	return {
		panelLinkAvailable: panelAuthEnabled(),
		panelLinked: Boolean(panel),
		panelEmail: panel?.panelEmail ?? null,
		profileForm,
		passwordForm,
		panelForm,
		revokeForm,
		signoutForm,
		sessions: sessions.map((session) => ({
			id: session.id,
			userAgent: session.userAgent ?? null,
			ipAddress: session.ipAddress ?? null,
			createdAt: session.createdAt,
			expiresAt: session.expiresAt,
			current: session.token === locals.session?.token
		}))
	};
};

export const actions: Actions = {
	updateName: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(profileSchema), { id: 'profile' });

		if (!locals.user) {
			redirect(302, '/auth/login');
		}

		if (!form.valid) {
			return message(form, { status: 'error', text: form.errors.name?.[0] ?? 'Name is invalid.' }, { status: 400 });
		}

		try {
			await getAuth().api.updateUser({
				body: { name: form.data.name },
				headers: request.headers
			});
		} catch {
			return message(form, { status: 'error', text: 'Could not update your profile.' }, { status: 500 });
		}

		return message(form, { status: 'success', text: 'Profile updated.' });
	},

	changePassword: async ({ request }) => {
		const form = await superValidate(request, zod4(passwordSchema), { id: 'password' });

		if (!form.valid) {
			return message(
				form,
				{
					status: 'error',
					text:
						form.errors.newPassword?.[0] ??
						form.errors.confirmPassword?.[0] ??
						form.errors.currentPassword?.[0] ??
						'All fields are required.'
				},
				{ status: 400 }
			);
		}

		try {
			await getAuth().api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					revokeOtherSessions: true
				},
				headers: request.headers
			});
		} catch (error) {
			const invalid = error instanceof Error && /password/i.test(error.message);
			return message(
				form,
				{
					status: 'error',
					text: invalid
						? 'Current password is incorrect.'
						: 'Could not change your password. If you signed up with Discord, set a password from there.'
				},
				{ status: 400 }
			);
		}

		return message(form, { status: 'success', text: 'Password updated. Other sessions were revoked.' });
	},

	linkPanel: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(panelSchema), { id: 'panel' });

		if (!locals.user) {
			redirect(302, '/auth/login');
		}

		if (!panelAuthEnabled()) {
			return message(
				form,
				{ status: 'error', text: 'Panel account linking is not supported by this adapter.' },
				{ status: 400 }
			);
		}

		if (!form.valid) {
			return message(
				form,
				{ status: 'error', text: 'Panel email and password are required.' },
				{ status: 400 }
			);
		}

		try {
			const identity = await verifyPanelLogin(form.data.email.trim().toLowerCase(), form.data.password);

			if (!identity) {
				return message(form, { status: 'error', text: 'Invalid panel email or password.' }, { status: 400 });
			}

			const owner = await getPanelAccountOwner(identity.id);
			if (owner && owner !== locals.user.id) {
				return message(
					form,
					{
						status: 'error',
						text: `This panel account is already linked to another ${getBranding().name} user.`
					},
					{ status: 400 }
				);
			}

			await linkPanelAccount(locals.user.id, identity);

			return message(form, { status: 'success', text: 'Panel account linked.' });
		} catch (cause) {
			return message(
				form,
				{
					status: 'error',
					text:
						cause instanceof PanelAuthError
							? cause.message
							: 'Could not verify your panel account.'
				},
				{ status: 400 }
			);
		}
	},

	revokeOtherSessions: async ({ request }) => {
		const form = await superValidate(request, zod4(emptySchema), { id: 'revoke' });

		await getAuth().api.revokeSessions({ headers: request.headers });

		return message(form, { status: 'success', text: 'All other sessions were revoked.' });
	},

	signout: async ({ request }) => {
		const form = await superValidate(request, zod4(emptySchema), { id: 'signout' });

		await getAuth().api.signOut({ headers: request.headers });

		redirect(302, '/auth/login');
	}
};

