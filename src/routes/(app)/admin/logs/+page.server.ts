import { error } from '@sveltejs/kit';
import { count, desc } from 'drizzle-orm';
import { isAdmin } from '#lib/server/auth/admin.ts';
import { db } from '#lib/server/db/index.ts';
import { activityLog, errorLog } from '#lib/server/db/ops.ts';
import type { PageServerLoad } from './$types';

const PER_PAGE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) error(403, { message: 'Administrator access is required.' });

	const tab = url.searchParams.get('tab') === 'errors' ? 'errors' : 'activity';
	const requested = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
	const offset = (page - 1) * PER_PAGE;

	const [activityCount, errorCount] = await Promise.all([
		db.select({ value: count() }).from(activityLog).get(),
		db.select({ value: count() }).from(errorLog).get()
	]);

	if (tab === 'errors') {
		const entries = await db
			.select()
			.from(errorLog)
			.orderBy(desc(errorLog.lastSeen))
			.limit(PER_PAGE)
			.offset(offset);

		return {
			tab,
			page,
			perPage: PER_PAGE,
			activityCount: activityCount?.value ?? 0,
			errorCount: errorCount?.value ?? 0,
			activity: [],
			errors: entries
		};
	}

	const entries = await db
		.select()
		.from(activityLog)
		.orderBy(desc(activityLog.createdAt))
		.limit(PER_PAGE)
		.offset(offset);

	return {
		tab,
		page,
		perPage: PER_PAGE,
		activityCount: activityCount?.value ?? 0,
		errorCount: errorCount?.value ?? 0,
		activity: entries,
		errors: []
	};
};
