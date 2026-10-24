import { redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/auth.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	await getAuth().api.signOut({ headers: request.headers });
	redirect(302, '/auth/login');
};
