import { asc, eq } from 'drizzle-orm';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { db } from '#lib/server/db/index.ts';
import { storefrontItem } from '#lib/server/db/ops.ts';
import { logActivity } from '#lib/server/system/logs.ts';

const SUCCESS_MODES = ['console', 'redirect', 'message'] as const;
type SuccessMode = (typeof SUCCESS_MODES)[number];
export type StorefrontCatalog = {
	nodes: { id: string; name: string }[];
	groups: { id: number; name: string }[];
	software: { id: number; name: string; groupId: number }[];
};

export type StorefrontItemValues = {
	name: string;
	description: string;
	icon: string;
	kind: 'server' | 'resource';
	enabled: boolean;
	oncePerUser: boolean;
	price: number;
	renewalPrice: number;
	durationDays: number;
	renewable: boolean;
	stackable: boolean;
	removable: boolean;
	cpu: number;
	memory: number;
	disk: number;
	node: string;
	softwareGroup: number | null;
	software: number | null;
	successMode: SuccessMode;
	successUrl: string;
	successMessage: string;
	sortOrder: number;
};

export const loadStorefrontCatalog = async (): Promise<StorefrontCatalog> => {
	try {
		const adapter = getAdapter();
		const [nodes, groups, software] = await Promise.all([
			adapter.getNodes(),
			adapter.listSoftwareGroups(),
			adapter.listSoftwares()
		]);

		return {
			nodes: nodes.map((node) => ({ id: node.id, name: node.name })),
			groups: groups.map((group) => ({ id: group.id, name: group.name })),
			software: software.map((egg) => ({ id: egg.id, name: egg.name, groupId: egg.groupId }))
		};
	} catch (cause) {
		console.error('Unable to load panel catalog for the storefront editor.', cause);
		return { nodes: [], groups: [], software: [] };
	}
};

export const getStorefrontItem = async (id: string) =>
	db.select().from(storefrontItem).where(eq(storefrontItem.id, id)).get();

export const listStorefrontItems = async () =>
	db
		.select()
		.from(storefrontItem)
		.orderBy(asc(storefrontItem.sortOrder), asc(storefrontItem.createdAt));

export const saveStorefrontItem = async (
	id: string | null,
	values: StorefrontItemValues,
	adminId?: string
) => {
	if (id) {
		const existing = await getStorefrontItem(id);
		if (!existing) return false;

		await db
			.update(storefrontItem)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(storefrontItem.id, id))
			.run();
	} else {
		await db.insert(storefrontItem).values(values).run();
	}

	logActivity({
		userId: adminId,
		action: id ? 'admin.storefront.update' : 'admin.storefront.create',
		message: `${id ? 'Updated' : 'Created'} storefront item "${values.name}"`,
		metadata: {
			itemId: id,
			kind: values.kind,
			price: values.price,
			cpu: values.cpu,
			memory: values.memory,
			disk: values.disk
		}
	});

	return true;
};

export const deleteStorefrontItem = async (id: string, adminId?: string) => {
	const existing = await getStorefrontItem(id);
	if (!existing) return false;

	await db.delete(storefrontItem).where(eq(storefrontItem.id, id)).run();

	logActivity({
		userId: adminId,
		action: 'admin.storefront.delete',
		message: `Deleted storefront item "${existing.name}"`,
		metadata: { itemId: id }
	});

	return true;
};
