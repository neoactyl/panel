import { error, redirect } from '@sveltejs/kit';
import { EarnError, completeEarnTask } from '#lib/server/billing/earn.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/auth/login');
	}

	let destination = '/rewards?verified=1';

	try {
		const result = await completeEarnTask(locals.user.id, params.token);
		if (/^https?:\/\//i.test(result.destination)) destination = result.destination;
	} catch (cause) {
		if (cause instanceof EarnError) error(400, cause.message);
		throw cause;
	}

	if (/^https?:\/\//i.test(destination)) redirect(303, destination, { external: true });
	redirect(303, destination);
};
