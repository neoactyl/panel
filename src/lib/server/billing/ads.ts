import { eq } from 'drizzle-orm';
import { getBool } from '#lib/server/config/settings.ts';
import { db } from '#lib/server/db/index.ts';
import { adSlot } from '#lib/server/db/ops.ts';

export class AdError extends Error {
	code: 'INVALID' | 'NOT_FOUND';

	constructor(message: string, code: AdError['code'] = 'INVALID') {
		super(message);
		this.name = 'AdError';
		this.code = code;
	}
}

/** The minimal shape the panel layout needs to render a global ad widget. */
export type PublicAdSlot = {
	id: string;
	label: string;
	width: number;
	height: number;
};

export type AdSlotInput = {
	label: string;
	script: string;
	width?: number;
	height?: number;
	enabled?: boolean;
	sortOrder?: number;
};

const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
	Math.max(min, Math.min(max, Math.floor(value ?? fallback)));

const validated = (input: AdSlotInput) => {
	const label = input.label.trim();

	if (label.length < 2 || label.length > 60) {
		throw new AdError('Ad names must be between 2 and 60 characters.', 'INVALID');
	}

	if (!input.script.trim()) {
		throw new AdError('Paste the ad provider script or HTML to display.', 'INVALID');
	}

	if (input.script.length > 100_000) {
		throw new AdError('The ad script must be 100,000 characters or fewer.', 'INVALID');
	}

	return {
		label,
		script: input.script,
		width: clamp(input.width, 300, 120, 600),
		height: clamp(input.height, 100, 40, 250),
		enabled: input.enabled ?? true,
		sortOrder: Math.floor(input.sortOrder ?? 0)
	};
};

/** Slots shown on every panel page, in administrator-defined order. */
export const listEnabledAdSlots = async (): Promise<PublicAdSlot[]> => {
	if (!getBool('ads.enabled')) return [];

	return db
		.select({
			id: adSlot.id,
			label: adSlot.label,
			width: adSlot.width,
			height: adSlot.height
		})
		.from(adSlot)
		.where(eq(adSlot.enabled, true))
		.orderBy(adSlot.sortOrder, adSlot.createdAt);
};

export const listAdSlots = async () =>
	db.select().from(adSlot).orderBy(adSlot.sortOrder, adSlot.createdAt);

/** Script served by the framed endpoint; only enabled slots may render. */
export const getAdScript = async (id: string) => {
	if (!getBool('ads.enabled')) {
		throw new AdError('Panel ads are disabled.', 'NOT_FOUND');
	}

	const row = await db
		.select({ script: adSlot.script, enabled: adSlot.enabled })
		.from(adSlot)
		.where(eq(adSlot.id, id))
		.get();

	if (!row || !row.enabled) {
		throw new AdError('That ad is not available.', 'NOT_FOUND');
	}

	return row.script;
};

export const createAdSlot = async (input: AdSlotInput) => {
	const [created] = await db
		.insert(adSlot)
		.values({ ...validated(input), createdAt: new Date() })
		.returning();

	if (!created) {
		throw new AdError('Unable to create that ad. Please try again.', 'INVALID');
	}

	return created;
};

export const updateAdSlot = async (id: string, input: AdSlotInput) => {
	const existing = await db.select().from(adSlot).where(eq(adSlot.id, id)).get();

	if (!existing) {
		throw new AdError('That ad no longer exists.', 'NOT_FOUND');
	}

	await db
		.update(adSlot)
		.set({
			...validated({ ...input, enabled: input.enabled ?? existing.enabled }),
			updatedAt: new Date()
		})
		.where(eq(adSlot.id, id))
		.run();
};

export const setAdSlotEnabled = async (id: string, enabled: boolean) => {
	await db
		.update(adSlot)
		.set({ enabled, updatedAt: new Date() })
		.where(eq(adSlot.id, id))
		.run();
};

export const deleteAdSlot = async (id: string) => {
	await db.delete(adSlot).where(eq(adSlot.id, id)).run();
};
