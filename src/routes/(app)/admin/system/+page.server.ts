import { count, sql } from 'drizzle-orm';
import { requireAdmin } from '#lib/server/auth/admin.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { activityLog, creditTransaction, errorLog } from '#lib/server/db/ops.ts';
import { getMetrics, resetMetrics } from '#lib/server/system/metrics.ts';
import { getNumber, getPanelConfig } from '#lib/server/config/settings.ts';
import { emptySchema } from '#lib/schemas.ts';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

const dbCheck = async () => {
	const started = performance.now();
	try {
		await db.run(sql`select 1`);
		return { ok: true, latencyMs: Math.round(performance.now() - started) };
	} catch (cause) {
		return {
			ok: false,
			latencyMs: Math.round(performance.now() - started),
			error: cause instanceof Error ? cause.message : 'Database check failed.'
		};
	}
};

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const metrics = getMetrics();
	const database = await dbCheck();

	const [users, activities, errors, transactions] = await Promise.all([
		db.select({ value: count() }).from(user).get(),
		db.select({ value: count() }).from(activityLog).get(),
		db.select({ value: count() }).from(errorLog).get(),
		db.select({ value: count() }).from(creditTransaction).get()
	]);

	const panel = getPanelConfig();
	let servers = 0;
	let reachable = false;

	try {
		servers = (await getAdapter().getServers()).length;
		reachable = true;
	} catch {
		reachable = false;
	}

	const memory = process.memoryUsage();

	return {
		metrics,
		resetForm: await superValidate(zod4(emptySchema), { id: 'reset' }),
		slowThreshold: getNumber('monitor.slowMs'),
		database,
		panel: { adapter: panel.adapter, reachable },
		counts: {
			users: users?.value ?? 0,
			servers,
			activities: activities?.value ?? 0,
			errors: errors?.value ?? 0,
			transactions: transactions?.value ?? 0
		},
		runtime: {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
			pid: process.pid,
			processUptime: Math.round(process.uptime()),
			rss: memory.rss,
			heapUsed: memory.heapUsed,
			heapTotal: memory.heapTotal
		}
	};
};

export const actions: Actions = {
	reset: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(emptySchema), { id: 'reset' });
		requireAdmin(locals);
		resetMetrics();
		return message(form, 'Counters reset.');
	}
};

