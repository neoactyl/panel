import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { addCredits, getCreditBalance, spendCredits } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import {
	afkSession,
	earnTask,
	earnTaskCompletion,
	voucher,
	voucherRedemption
} from '#lib/server/db/ops.ts';
import { serverEnv } from '#lib/server/config/env.ts';
import {
	LinkvertiseError,
	createLinkvertiseLink,
	isLinkvertiseUrl,
	parseLinkvertisePublisherId
} from '#lib/server/billing/linkvertise.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { notifyUser } from '#lib/server/system/notifications.ts';
import { getBool, getNumber, getSetting } from '#lib/server/config/settings.ts';
import { addUserQuota } from '#lib/server/quota/user.ts';

export type EarnCode =
	| 'DISABLED'
	| 'INVALID'
	| 'COOLDOWN'
	| 'TOO_SOON'
	| 'NOT_FOUND'
	| 'NOT_VERIFIED'
	| 'ALREADY_REDEEMED'
	| 'EXHAUSTED'
	| 'EXPIRED'
	| 'INSUFFICIENT_CREDITS'
	| 'INVALID_AMOUNT';

export class EarnError extends Error {
	code: EarnCode;

	constructor(message: string, code: EarnCode = 'INVALID') {
		super(message);
		this.name = 'EarnError';
		this.code = code;
	}
}

const dayKey = () => new Date().toISOString().slice(0, 10);

const capMinutes = () => Math.max(0, getNumber('afk.dailyCapMinutes'));

export type AfkState = {
	enabled: boolean;
	coinsPerMinute: number;
	dailyCapMinutes: number;
	earnedToday: number;
	remainingMinutes: number;
	pendingSeconds: number;
	totalEarned: number;
	balance: number;
};

const loadAfkRow = async (userId: string) =>
	db.select().from(afkSession).where(eq(afkSession.userId, userId)).get();

export const getAfkState = async (userId: string): Promise<AfkState> => {
	const row = await loadAfkRow(userId);
	const today = dayKey();
	const earnedToday = row && row.day === today ? row.earnedToday : 0;
	const dailyCapMinutes = capMinutes();

	return {
		enabled: getBool('credits.enabled') && getBool('credits.allowEarn'),
		coinsPerMinute: getNumber('afk.coinsPerMinute'),
		dailyCapMinutes,
		earnedToday,
		remainingMinutes: dailyCapMinutes <= 0 ? 0 : Math.max(0, dailyCapMinutes - earnedToday),
		pendingSeconds: row?.pendingSeconds ?? 0,
		totalEarned: row?.totalEarned ?? 0,
		balance: await getCreditBalance(userId)
	};
};

export type AfkPingResult = AfkState & { awarded: number };

export const pingAfk = async (userId: string): Promise<AfkPingResult> => {
	if (!getBool('credits.enabled') || !getBool('credits.allowEarn')) {
		throw new EarnError('Earning is currently disabled.', 'DISABLED');
	}

	const now = Date.now();
	const today = dayKey();
	const row = await loadAfkRow(userId);
	const maxGap = Math.max(5, getNumber('afk.maxPingGapSeconds'));
	const perMinute = Math.max(0, getNumber('afk.coinsPerMinute'));
	const minimumPayout = Math.max(1, getNumber('afk.minimumPayoutMinutes'));
	const dailyCap = capMinutes();

	let earnedToday = row && row.day === today ? row.earnedToday : 0;
	let pending = row?.pendingSeconds ?? 0;

	if (row?.lastPingAt) {
		const elapsed = (now - row.lastPingAt.getTime()) / 1000;
		pending += Math.max(0, Math.min(maxGap, elapsed));
	}

	const availableMinutes = Math.floor(pending / 60);
	const remaining = dailyCap <= 0 ? availableMinutes : Math.max(0, dailyCap - earnedToday);
	const payoutMinutes = Math.max(0, Math.min(availableMinutes, remaining));

	let awarded = 0;

	if (payoutMinutes >= minimumPayout && perMinute > 0) {
		awarded = payoutMinutes * perMinute;
		await addCredits({
			userId,
			amount: awarded,
			kind: 'afk',
			reference: `afk:${userId}:${today}:${earnedToday + payoutMinutes}`,
			description: `AFK earnings for ${payoutMinutes} minute(s).`,
			metadata: { minutes: payoutMinutes, day: today }
		});

		earnedToday += payoutMinutes;
		pending -= payoutMinutes * 60;

		if (dailyCap > 0 && earnedToday >= dailyCap) pending = 0;
	}

	const totalEarned = (row?.totalEarned ?? 0) + awarded;

	await db
		.insert(afkSession)
		.values({
			userId,
			lastPingAt: new Date(now),
			pendingSeconds: Math.floor(pending),
			earnedToday,
			day: today,
			totalEarned,
			updatedAt: new Date(now)
		})
		.onConflictDoUpdate({
			target: afkSession.userId,
			set: {
				lastPingAt: new Date(now),
				pendingSeconds: Math.floor(pending),
				earnedToday,
				day: today,
				totalEarned,
				updatedAt: new Date(now)
			}
		})
		.run();

	return {
		enabled: true,
		coinsPerMinute: perMinute,
		dailyCapMinutes: dailyCap,
		earnedToday,
		remainingMinutes: dailyCap <= 0 ? 0 : Math.max(0, dailyCap - earnedToday),
		pendingSeconds: Math.floor(pending),
		totalEarned,
		balance: await getCreditBalance(userId),
		awarded
	};
};

export type EarnTaskView = {
	id: string;
	title: string;
	description: string;
	provider: string;
	reward: number;
	cooldownHours: number;
	minSeconds: number;
	lastCompletedAt: string | null;
	nextAvailableAt: string | null;
	startedAt: string | null;
	verified: boolean;
};

const isLinkvertiseProvider = (task: typeof earnTask.$inferSelect) =>
	task.provider.trim().toLowerCase() === 'linkvertise';

const linkvertisePublisherId = () => {
	const raw = getSetting('tasks.linkvertiseUserId').trim();
	if (!raw) return null;

	const id = parseLinkvertisePublisherId(raw);
	if (!id) throw new EarnError('The configured Linkvertise publisher ID is invalid.', 'INVALID');

	return id;
};

const linkvertiseConfigured = () => {
	const raw = getSetting('tasks.linkvertiseUserId').trim();
	return raw !== '' && parseLinkvertisePublisherId(raw) !== null;
};

const usesLinkvertiseVerification = (
	task: typeof earnTask.$inferSelect,
	publisherId: number | null
) =>
	publisherId !== null &&
	isLinkvertiseProvider(task) &&
	!isLinkvertiseUrl(task.url);

const completionUrl = (
	task: typeof earnTask.$inferSelect,
	completion: typeof earnTaskCompletion.$inferSelect,
	publisherId: number | null
) => {
	if (!completion.token || !usesLinkvertiseVerification(task, publisherId)) return task.url;

	try {
		return createLinkvertiseLink(
			`${serverEnv.ORIGIN.replace(/\/$/, '')}/api/earn/complete/${completion.token}`,
			publisherId!
		);
	} catch (cause) {
		if (cause instanceof LinkvertiseError) throw new EarnError(cause.message, 'INVALID');
		throw cause;
	}
};

export const listEarnTasks = async (userId: string): Promise<EarnTaskView[]> => {
	const tasks = await db
		.select()
		.from(earnTask)
		.where(eq(earnTask.enabled, true))
		.orderBy(earnTask.sortOrder, earnTask.createdAt);

	const completions = await db
		.select()
		.from(earnTaskCompletion)
		.where(eq(earnTaskCompletion.userId, userId))
		.orderBy(desc(earnTaskCompletion.createdAt))
		.limit(300);

	const defaultReward = getNumber('tasks.defaultReward');
	const defaultCooldown = getNumber('tasks.cooldownHours');
	const linkvertiseReady = linkvertiseConfigured();

	return tasks
		.filter((task) => !isLinkvertiseProvider(task) || linkvertiseReady)
		.map((task) => {
			const mine = completions.filter((entry) => entry.taskId === task.id);
			const lastCompleted = mine.find((entry) => entry.status === 'completed');
			const pending = mine.find(
				(entry) => entry.status === 'pending' || entry.status === 'verified'
			);
			const cooldown = task.cooldownHours || defaultCooldown;

			return {
				id: task.id,
				title: task.title,
				description: task.description,
				provider: task.provider,
				reward: task.reward || defaultReward,
				cooldownHours: cooldown,
				minSeconds: task.minSeconds,
				lastCompletedAt: lastCompleted?.completedAt
					? lastCompleted.completedAt.toISOString()
					: null,
				nextAvailableAt: lastCompleted?.completedAt
					? new Date(lastCompleted.completedAt.getTime() + cooldown * 3600_000).toISOString()
					: null,
				startedAt: pending ? pending.startedAt.toISOString() : null,
				verified: pending?.status === 'verified'
			};
		});
};

export const startEarnTask = async (userId: string, taskId: string) => {
	if (!getBool('credits.enabled') || !getBool('credits.allowEarn')) {
		throw new EarnError('Earning is currently disabled.', 'DISABLED');
	}

	const task = await db.select().from(earnTask).where(eq(earnTask.id, taskId)).get();
	if (!task || !task.enabled) throw new EarnError('That task is not available.', 'NOT_FOUND');

	const cooldownHours = task.cooldownHours || getNumber('tasks.cooldownHours');
	const lastCompleted = await db
		.select()
		.from(earnTaskCompletion)
		.where(
			and(
				eq(earnTaskCompletion.taskId, task.id),
				eq(earnTaskCompletion.userId, userId),
				eq(earnTaskCompletion.status, 'completed')
			)
		)
		.orderBy(desc(earnTaskCompletion.completedAt))
		.get();

	if (lastCompleted?.completedAt && cooldownHours > 0) {
		const next = lastCompleted.completedAt.getTime() + cooldownHours * 3600_000;
		if (next > Date.now()) {
			throw new EarnError('You already completed this task recently.', 'COOLDOWN');
		}
	}

	const publisherId = isLinkvertiseProvider(task) ? linkvertisePublisherId() : null;

	if (isLinkvertiseProvider(task) && publisherId === null) {
		throw new EarnError(
			'Linkvertise is not configured. Ask an administrator to set a publisher ID.',
			'DISABLED'
		);
	}
	const pending = await db
		.select()
		.from(earnTaskCompletion)
		.where(
			and(
				eq(earnTaskCompletion.taskId, task.id),
				eq(earnTaskCompletion.userId, userId),
				inArray(earnTaskCompletion.status, ['pending', 'verified'])
			)
		)
		.orderBy(desc(earnTaskCompletion.createdAt))
		.get();

	if (pending && Date.now() - pending.startedAt.getTime() < 3600_000) {
		let current = pending;

		if (!current.token && usesLinkvertiseVerification(task, publisherId)) {
			const token = randomBytes(24).toString('hex');
			await db
				.update(earnTaskCompletion)
				.set({ token })
				.where(eq(earnTaskCompletion.id, current.id))
				.run();
			current = { ...current, token };
		}

		return {
			completionId: current.id,
			url: completionUrl(task, current, publisherId),
			minSeconds: task.minSeconds
		};
	}

	const needsVerification = usesLinkvertiseVerification(task, publisherId);
	const [created] = await db
		.insert(earnTaskCompletion)
		.values({
			taskId: task.id,
			userId,
			status: 'pending',
			token: needsVerification ? randomBytes(24).toString('hex') : null,
			startedAt: new Date(),
			createdAt: new Date()
		})
		.returning();

	return {
		completionId: created.id,
		url: completionUrl(task, created, publisherId),
		minSeconds: task.minSeconds
	};
};

export const completeEarnTask = async (userId: string, token: string) => {
	const completion = await db
		.select()
		.from(earnTaskCompletion)
		.where(eq(earnTaskCompletion.token, token))
		.get();

	if (!completion || completion.userId !== userId) {
		throw new EarnError('That task link is invalid or has expired.', 'NOT_FOUND');
	}

	const task = await db.select().from(earnTask).where(eq(earnTask.id, completion.taskId)).get();
	if (!task) throw new EarnError('That task is no longer available.', 'NOT_FOUND');

	if (completion.status === 'completed') {
		return { taskId: completion.taskId, destination: task.url, alreadyCompleted: true };
	}

	if (completion.status !== 'pending' && completion.status !== 'verified') {
		throw new EarnError('That task link is no longer valid.', 'NOT_FOUND');
	}

	if (Date.now() - completion.startedAt.getTime() > 3600_000) {
		throw new EarnError('That task link has expired. Start the task again.', 'EXPIRED');
	}

	const reward = task.reward || getNumber('tasks.defaultReward');

	if (reward > 0) {
		await addCredits({
			userId,
			amount: reward,
			kind: 'task',
			reference: `task:${completion.id}`,
			description: `Completed task: ${task.title}`,
			metadata: { taskId: task.id, provider: task.provider }
		});
	}

	await db
		.update(earnTaskCompletion)
		.set({ status: 'completed', verifiedAt: new Date(), completedAt: new Date() })
		.where(eq(earnTaskCompletion.id, completion.id))
		.run();

	return { taskId: completion.taskId, destination: task.url, alreadyCompleted: false };
};

export const claimEarnTask = async (userId: string, taskId: string) => {
	if (!getBool('credits.enabled') || !getBool('credits.allowEarn')) {
		throw new EarnError('Earning is currently disabled.', 'DISABLED');
	}

	const task = await db.select().from(earnTask).where(eq(earnTask.id, taskId)).get();
	if (!task || !task.enabled) throw new EarnError('That task is not available.', 'NOT_FOUND');

	const pending = await db
		.select()
		.from(earnTaskCompletion)
		.where(
			and(
				eq(earnTaskCompletion.taskId, task.id),
				eq(earnTaskCompletion.userId, userId),
				inArray(earnTaskCompletion.status, ['pending', 'verified'])
			)
		)
		.orderBy(desc(earnTaskCompletion.createdAt))
		.get();

	if (!pending) throw new EarnError('Start this task before claiming it.', 'NOT_FOUND');

	const requiresVerification = Boolean(pending.token);

	if (requiresVerification && pending.status !== 'verified') {
		throw new EarnError(
			'Finish the Linkvertise step before claiming this reward.',
			'NOT_VERIFIED'
		);
	}

	if (!requiresVerification) {
		const elapsed = (Date.now() - pending.startedAt.getTime()) / 1000;
		if (elapsed < task.minSeconds) {
			throw new EarnError(
				`Give the task a little longer (${Math.ceil(task.minSeconds - elapsed)}s remaining).`,
				'TOO_SOON'
			);
		}
	}

	const reward = task.reward || getNumber('tasks.defaultReward');
	if (reward <= 0) throw new EarnError('This task has no reward configured.', 'INVALID');

	const grant = await addCredits({
		userId,
		amount: reward,
		kind: 'task',
		reference: `task:${pending.id}`,
		description: `Completed task: ${task.title}`,
		metadata: { taskId: task.id, provider: task.provider }
	});

	await db
		.update(earnTaskCompletion)
		.set({ status: 'completed', completedAt: new Date() })
		.where(eq(earnTaskCompletion.id, pending.id))
		.run();

	return { reward, balance: grant.balance };
};

export type VoucherInput = {
	code: string;
	description?: string;
	kind?: 'credits' | 'resource';
	credits?: number;
	cpu?: number;
	memory?: number;
	disk?: number;
	maxUses?: number;
	expiresAt?: string | null;
	enabled?: boolean;
};

export const redeemVoucher = async (userId: string, code: string) => {
	if (!getBool('vouchers.enabled')) throw new EarnError('Vouchers are disabled.', 'DISABLED');

	const normalized = code.trim().toUpperCase();
	if (!normalized) throw new EarnError('Enter a voucher code.', 'INVALID');

	const entry = await db.select().from(voucher).where(eq(voucher.code, normalized)).get();
	if (!entry || !entry.enabled) throw new EarnError('That voucher code is not valid.', 'INVALID');
	if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
		throw new EarnError('That voucher has expired.', 'EXPIRED');
	}
	if (entry.maxUses > 0 && entry.usedCount >= entry.maxUses) {
		throw new EarnError('That voucher has been fully redeemed.', 'EXHAUSTED');
	}

	const existing = await db
		.select({ id: voucherRedemption.id })
		.from(voucherRedemption)
		.where(and(eq(voucherRedemption.voucherId, entry.id), eq(voucherRedemption.userId, userId)))
		.get();

	if (existing) throw new EarnError('You already redeemed this voucher.', 'ALREADY_REDEEMED');

	await db
		.insert(voucherRedemption)
		.values({ voucherId: entry.id, userId, createdAt: new Date() })
		.run();

	try {
		if (entry.kind === 'resource') {
			await addUserQuota(userId, {
				cpu: entry.cpu,
				memory: entry.memory,
				disk: entry.disk
			});
		} else if (entry.credits > 0) {
			await addCredits({
				userId,
				amount: entry.credits,
				kind: 'voucher',
				reference: `voucher:${entry.id}:${userId}`,
				description: `Redeemed voucher ${entry.code}`,
				metadata: { voucherId: entry.id }
			});
		}
	} catch (cause) {
		await db
			.delete(voucherRedemption)
			.where(
				and(eq(voucherRedemption.voucherId, entry.id), eq(voucherRedemption.userId, userId))
			)
			.run();
		throw cause;
	}

	await db
		.update(voucher)
		.set({ usedCount: sql`${voucher.usedCount} + 1` })
		.where(eq(voucher.id, entry.id))
		.run();

	logActivity({
		userId,
		action: 'voucher.redeem',
		severity: 'info',
		message: `Redeemed voucher ${entry.code}.`,
		metadata: { voucherId: entry.id, kind: entry.kind }
	});

	await notifyUser({
		userId,
		kind: 'voucher',
		title: 'Voucher redeemed',
		body:
			entry.kind === 'resource'
				? `Added ${entry.cpu}% CPU, ${entry.memory} MB memory and ${entry.disk} MB disk.`
				: `Added ${entry.credits} credits to your balance.`,
		url: '/credits'
	});

	return {
		kind: entry.kind,
		credits: entry.credits,
		cpu: entry.cpu,
		memory: entry.memory,
		disk: entry.disk
	};
};

export const giftCredits = async (fromUserId: string, toUserId: string, amount: number) => {
	if (!getBool('credits.enabled') || !getBool('credits.giftEnabled')) {
		throw new EarnError('Credit gifting is disabled.', 'DISABLED');
	}
	if (fromUserId === toUserId) throw new EarnError('You cannot gift credits to yourself.', 'INVALID');

	const minimum = Math.max(1, getNumber('credits.giftMin'));
	if (!Number.isInteger(amount) || amount < minimum) {
		throw new EarnError(`Gifts must be at least ${minimum} credits.`, 'INVALID_AMOUNT');
	}

	const id = crypto.randomUUID();

	await spendCredits({
		userId: fromUserId,
		amount,
		kind: 'gift_sent',
		reference: `gift:out:${id}`,
		description: `Gifted ${amount} credits.`,
		metadata: { toUserId }
	});

	try {
		await addCredits({
			userId: toUserId,
			amount,
			kind: 'gift_received',
			reference: `gift:in:${id}`,
			description: `Received ${amount} credits as a gift.`,
			metadata: { fromUserId }
		});
	} catch (cause) {
		await addCredits({
			userId: fromUserId,
			amount,
			kind: 'gift_refund',
			reference: `gift:refund:${id}`,
			description: 'Gift could not be delivered and was refunded.'
		});
		throw cause;
	}

	await notifyUser({
		userId: toUserId,
		kind: 'gift',
		title: 'You received credits',
		body: `${amount} credits were gifted to your account.`,
		url: '/credits'
	});

	return { amount, balance: await getCreditBalance(fromUserId) };
};

export const listVouchers = async () =>
	db.select().from(voucher).orderBy(desc(voucher.createdAt));

export const createVoucher = async (input: VoucherInput) => {
	const code = input.code.trim().toUpperCase();
	if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
		throw new EarnError('Voucher codes must be 3-32 characters (A-Z, 0-9, _ or -).', 'INVALID');
	}

	const [created] = await db
		.insert(voucher)
		.values({
			code,
			description: input.description?.trim() ?? '',
			kind: input.kind === 'resource' ? 'resource' : 'credits',
			credits: Math.max(0, input.credits ?? 0),
			cpu: Math.max(0, input.cpu ?? 0),
			memory: Math.max(0, input.memory ?? 0),
			disk: Math.max(0, input.disk ?? 0),
			maxUses: Math.max(0, input.maxUses ?? 0),
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
			enabled: input.enabled ?? true,
			createdAt: new Date()
		})
		.returning();

	return created;
};

export const updateVoucher = async (id: string, input: Partial<VoucherInput>) => {
	const patch: Partial<typeof voucher.$inferInsert> = {};

	if (input.description !== undefined) patch.description = input.description;
	if (input.kind !== undefined) patch.kind = input.kind === 'resource' ? 'resource' : 'credits';
	if (input.credits !== undefined) patch.credits = Math.max(0, input.credits);
	if (input.cpu !== undefined) patch.cpu = Math.max(0, input.cpu);
	if (input.memory !== undefined) patch.memory = Math.max(0, input.memory);
	if (input.disk !== undefined) patch.disk = Math.max(0, input.disk);
	if (input.maxUses !== undefined) patch.maxUses = Math.max(0, input.maxUses);
	if (input.expiresAt !== undefined) {
		patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
	}
	if (input.enabled !== undefined) patch.enabled = input.enabled;

	if (Object.keys(patch).length > 0) {
		await db.update(voucher).set(patch).where(eq(voucher.id, id)).run();
	}
};

export const deleteVoucher = async (id: string) => {
	await db.delete(voucher).where(eq(voucher.id, id)).run();
};

export const listAllEarnTasks = async () =>
	db.select().from(earnTask).orderBy(earnTask.sortOrder, earnTask.createdAt);

export const createEarnTask = async (input: {
	title: string;
	description?: string;
	url: string;
	provider?: string;
	reward?: number;
	cooldownHours?: number;
	minSeconds?: number;
	enabled?: boolean;
	sortOrder?: number;
}) => {
	const provider = input.provider?.trim() || 'linkvertise';

	if (provider.toLowerCase() === 'linkvertise' && !linkvertiseConfigured()) {
		throw new EarnError(
			'Set a Linkvertise publisher ID in Settings before creating Linkvertise tasks.',
			'INVALID'
		);
	}

	const [created] = await db
		.insert(earnTask)
		.values({
			title: input.title.trim(),
			description: input.description?.trim() ?? '',
			url: input.url.trim(),
			provider,
			reward: Math.max(0, input.reward ?? 0),
			cooldownHours: Math.max(0, input.cooldownHours ?? 24),
			minSeconds: Math.max(0, input.minSeconds ?? 15),
			enabled: input.enabled ?? true,
			sortOrder: input.sortOrder ?? 0,
			createdAt: new Date()
		})
		.returning();

	return created;
};

export const updateEarnTask = async (
	id: string,
	input: {
		title?: string;
		description?: string;
		url?: string;
		provider?: string;
		reward?: number;
		cooldownHours?: number;
		minSeconds?: number;
		enabled?: boolean;
		sortOrder?: number;
	}
) => {
	if (
		input.provider !== undefined &&
		(input.provider.trim() || 'linkvertise').toLowerCase() === 'linkvertise' &&
		!linkvertiseConfigured()
	) {
		throw new EarnError(
			'Set a Linkvertise publisher ID in Settings before using Linkvertise tasks.',
			'INVALID'
		);
	}

	const patch: Partial<typeof earnTask.$inferInsert> = {};
	if (input.title !== undefined) patch.title = input.title.trim();
	if (input.description !== undefined) patch.description = input.description.trim();
	if (input.url !== undefined) patch.url = input.url.trim();
	if (input.provider !== undefined) patch.provider = input.provider.trim() || 'linkvertise';
	if (input.reward !== undefined) patch.reward = Math.max(0, input.reward);
	if (input.cooldownHours !== undefined) patch.cooldownHours = Math.max(0, input.cooldownHours);
	if (input.minSeconds !== undefined) patch.minSeconds = Math.max(0, input.minSeconds);
	if (input.enabled !== undefined) patch.enabled = input.enabled;
	if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

	if (Object.keys(patch).length > 0) {
		await db.update(earnTask).set(patch).where(eq(earnTask.id, id)).run();
	}
};

export const deleteEarnTask = async (id: string) => {
	await db.delete(earnTask).where(eq(earnTask.id, id)).run();
};
