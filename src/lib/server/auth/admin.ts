import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { session, user } from '#lib/server/db/auth.schema.ts';

type RoleUser = unknown;

export const isAdmin = (value: RoleUser) =>
	typeof value === 'object' &&
	value !== null &&
	'role' in value &&
	(value as { role?: unknown }).role === 'admin';

export const requireAdmin = (locals: { user?: unknown }) => {
	if (!isAdmin(locals.user)) {
		error(403, { message: 'Administrator access is required.' });
	}
};

let adminState: Promise<boolean> | undefined;

export const invalidateAdminCache = () => {
	adminState = undefined;
};

export const hasAdmin = (): Promise<boolean> => {
	if (!adminState) {
		adminState = db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.role, 'admin'))
			.limit(1)
			.then((rows) => rows.length > 0)
			.catch(() => false);
	}

	return adminState;
};

export const setUserRole = async (userId: string, role: 'admin' | 'user') => {
	await db.update(user).set({ role }).where(eq(user.id, userId)).run();
	await invalidateAdminCache();
};

export const setUserBanned = async (
	userId: string,
	banned: boolean,
	reason?: string | null
) => {
	await db
		.update(user)
		.set({
			banned,
			banReason: banned ? (reason ?? 'Banned by an administrator') : null,
			banExpires: null
		})
		.where(eq(user.id, userId))
		.run();

	if (banned) {
		await db.delete(session).where(eq(session.userId, userId)).run();
	}
};
