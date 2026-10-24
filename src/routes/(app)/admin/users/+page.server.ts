import { count, desc, eq } from 'drizzle-orm';
import { requireAdmin, setUserBanned, setUserRole } from '#lib/server/auth/admin.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { banSchema, roleSchema } from '#lib/schemas.ts';
import { superValidate, message } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [users, roleForm, banForm] = await Promise.all([
		db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				banned: user.banned,
				banReason: user.banReason,
				createdAt: user.createdAt
			})
			.from(user)
			.orderBy(desc(user.createdAt)),
		superValidate(zod4(roleSchema), { id: 'role' }),
		superValidate(zod4(banSchema), { id: 'ban' })
	]);

	return { users, roleForm, banForm };
};

export const actions: Actions = {
	role: async ({ locals, request }) => {
		requireAdmin(locals);
		const form = await superValidate(request, zod4(roleSchema), { id: 'role' });

		if (!form.data.userId) return message(form, 'Missing user.', { status: 400 });

		if (form.data.userId === locals.user?.id && form.data.role !== 'admin') {
			return message(form, 'You cannot remove your own administrator role.', { status: 400 });
		}

		const target = await db
			.select({ role: user.role })
			.from(user)
			.where(eq(user.id, form.data.userId))
			.get();

		if (!target) return message(form, 'User not found.', { status: 404 });

		if (target.role === 'admin' && form.data.role === 'user') {
			const adminRow = await db
				.select({ admins: count() })
				.from(user)
				.where(eq(user.role, 'admin'))
				.get();
			const admins = adminRow?.admins ?? 0;

			if (admins <= 1) {
				return message(form, 'At least one administrator must remain.', { status: 400 });
			}
		}

		await setUserRole(form.data.userId, form.data.role);

		logActivity({
			userId: locals.user?.id,
			action: 'admin.user.role',
			message: `Changed user role to ${form.data.role}`,
			metadata: { targetId: form.data.userId, role: form.data.role }
		});

		return message(form, 'Role updated.');
	},

	ban: async ({ locals, request }) => {
		requireAdmin(locals);
		const form = await superValidate(request, zod4(banSchema), { id: 'ban' });

		if (!form.data.userId) return message(form, 'Missing user.', { status: 400 });

		if (form.data.userId === locals.user?.id) {
			return message(form, 'You cannot ban your own account.', { status: 400 });
		}

		const target = await db
			.select({ role: user.role })
			.from(user)
			.where(eq(user.id, form.data.userId))
			.get();

		if (!target) return message(form, 'User not found.', { status: 404 });

		if (target.role === 'admin') {
			return message(form, 'Administrators cannot be banned from this page.', { status: 400 });
		}

		const banned = form.data.banned;

		await setUserBanned(form.data.userId, banned, banned ? 'Banned by an administrator' : null);

		logActivity({
			userId: locals.user?.id,
			action: banned ? 'admin.user.ban' : 'admin.user.unban',
			message: `${banned ? 'Banned' : 'Unbanned'} a user`,
			metadata: { targetId: form.data.userId }
		});

		return message(form, banned ? 'User banned.' : 'User unbanned.');
	}
};
