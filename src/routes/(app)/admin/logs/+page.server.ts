import { error } from '@sveltejs/kit';
import { count, desc, gte } from 'drizzle-orm';
import { isAdmin, requireAdmin } from '#lib/server/auth/admin.ts';
import { db } from '#lib/server/db/index.ts';
import { activityLog, errorLog } from '#lib/server/db/ops.ts';
import {
	clearLogs,
	LOG_RETENTION_DAYS,
	logRetentionCutoff,
	pruneExpiredLogs
} from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

const PER_PAGE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) error(403, { message: 'Administrator access is required.' });

	await pruneExpiredLogs();

	const cutoff = logRetentionCutoff();
	const tab = url.searchParams.get('tab') === 'errors' ? 'errors' : 'activity';
	const requested = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
	const offset = (page - 1) * PER_PAGE;

	const [activityCount, errorCount] = await Promise.all([
		db
			.select({ value: count() })
			.from(activityLog)
			.where(gte(activityLog.createdAt, cutoff))
			.get(),
		db
			.select({ value: count() })
			.from(errorLog)
			.where(gte(errorLog.lastSeen, cutoff))
			.get()
	]);

	const base = {
		tab,
		page,
		perPage: PER_PAGE,
		retentionDays: LOG_RETENTION_DAYS,
		activityCount: activityCount?.value ?? 0,
		errorCount: errorCount?.value ?? 0
	};

	if (tab === 'errors') {
		const entries = await db
			.select()
			.from(errorLog)
			.where(gte(errorLog.lastSeen, cutoff))
			.orderBy(desc(errorLog.lastSeen))
			.limit(PER_PAGE)
			.offset(offset);

		return { ...base, activity: [], errors: entries };
	}

	const entries = await db
		.select()
		.from(activityLog)
		.where(gte(activityLog.createdAt, cutoff))
		.orderBy(desc(activityLog.createdAt))
		.limit(PER_PAGE)
		.offset(offset);

	return { ...base, activity: entries, errors: [] };
};

export const actions: Actions = {
	clear: async ({ locals }) => {
		requireAdmin(locals);
		await clearLogs();
		return { cleared: true };
	}
};
