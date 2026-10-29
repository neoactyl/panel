import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { AdapterError, type CreateServer, type Server } from '#lib/adapter/sdk.ts';
import { assertWithinQuota, remainingResources, resourceTotals } from '#lib/server/quota/resources.ts';
import { getAdapter, getUserAdapter } from '#lib/server/panel/adapter.ts';
import { createServerBilling, getRenewalSettings } from '#lib/server/billing/billing.ts';
import { addCredits, CreditError, spendCredits } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import { storefrontItem, storefrontRedemption } from '#lib/server/db/ops.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import { effectiveSoftwarePolicy, getSoftwarePolicies } from '#lib/server/catalog/software-policy.ts';
import { addUserQuota, getEffectiveQuota } from '#lib/server/quota/user.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const items = await db
		.select()
		.from(storefrontItem)
		.where(eq(storefrontItem.enabled, true))
		.orderBy(asc(storefrontItem.sortOrder), asc(storefrontItem.createdAt));

	const redemptions = await db
		.select({
			itemId: storefrontRedemption.itemId,
			serverId: storefrontRedemption.serverId,
			status: storefrontRedemption.status,
			createdAt: storefrontRedemption.createdAt
		})
		.from(storefrontRedemption)
		.where(eq(storefrontRedemption.userId, locals.user!.id));

	const base = getAdapter();
	const linkRequired = base.capabilities.accounts.link;
	const available = !linkRequired || Boolean(locals.panelUserId);
	const adapter = available ? getUserAdapter(locals.panelUserId) : null;
	const quotaEnforced = Boolean(adapter && adapter.capabilities.accounts.link);
	const effectiveQuota = quotaEnforced ? await getEffectiveQuota(locals.user?.id) : null;
	const renewal = getRenewalSettings();

	let servers: Server[] = [];

	if (adapter && (quotaEnforced || items.length > 0)) {
		try {
			servers = await adapter.getServers();
		} catch (cause) {
			console.error('Unable to load servers for the storefront.', cause);
		}
	}

	return {
		items: items.map((item) => ({
			...item,
			claimed:
				(item.oncePerUser || (item.kind === 'resource' && !item.stackable)) &&
				redemptions.some((entry) => entry.itemId === item.id)
		})),
		redemptions,
		available,
		canCreate: Boolean(adapter?.capabilities.servers.create),
		remaining: effectiveQuota ? remainingResources(servers, effectiveQuota) : null,
		used: effectiveQuota ? resourceTotals(servers) : null,
		quota: effectiveQuota,
		servers,
		renewal
	};
};

const refund = async (userId: string, amount: number, reference: string, description: string) => {
	if (amount <= 0) return;

	try {
		await addCredits({
			userId,
			amount,
			kind: 'refund',
			reference: `refund:${reference}`,
			description
		});
	} catch (cause) {
		console.error('Unable to refund storefront credits.', cause);
	}
};

export const actions: Actions = {
	claim: async ({ locals, request }) => {
		if (!locals.user) return fail(401, { error: 'You must sign in to claim an item.' });

		const data = await request.formData();
		const itemId = String(data.get('itemId') ?? '').trim();
		if (!itemId) return fail(400, { error: 'Choose a storefront item.' });

		const item = await db
			.select()
			.from(storefrontItem)
			.where(and(eq(storefrontItem.id, itemId), eq(storefrontItem.enabled, true)))
			.get();

		if (!item) return fail(404, { error: 'This storefront item is unavailable.' });

		const onceLimited = item.oncePerUser || (item.kind === 'resource' && !item.stackable);

		if (onceLimited) {
			const existing = await db
				.select({ id: storefrontRedemption.id })
				.from(storefrontRedemption)
				.where(
					and(
						eq(storefrontRedemption.itemId, item.id),
						eq(storefrontRedemption.userId, locals.user.id)
					)
				)
				.get();

			if (existing) return fail(400, { error: 'You have already claimed this item.' });
		}

		const adapter = getUserAdapter(locals.panelUserId);
		const renewal = getRenewalSettings();
		const price = renewal.enabled ? Math.max(0, item.price) : 0;

		if (item.kind === 'resource') {
			const reference = `storefront:${item.id}:${crypto.randomUUID()}`;
			let charged = 0;

			if (price > 0) {
				try {
					await spendCredits({
						userId: locals.user.id,
						amount: price,
						kind: 'storefront_purchase',
						reference,
						description: `Purchased ${item.name} as extra resource quota`,
						metadata: { itemId: item.id }
					});
					charged = price;
				} catch (cause) {
					if (cause instanceof CreditError) return fail(402, { error: cause.message });
					throw cause;
				}
			}

			try {
				await addUserQuota(locals.user.id, {
					cpu: Math.max(0, item.cpu),
					memory: Math.max(0, item.memory),
					disk: Math.max(0, item.disk)
				});
			} catch (cause) {
				await refund(locals.user.id, charged, reference, 'Refund for a failed resource upgrade');
				throw cause;
			}

			await db
				.insert(storefrontRedemption)
				.values({
					itemId: item.id,
					userId: locals.user.id,
					serverId: null,
					status: 'completed',
					message: item.successMessage
				})
				.run();

			logActivity({
				userId: locals.user.id,
				action: 'storefront.purchase',
				message: `Purchased ${item.name} as extra resource quota`,
				metadata: {
					itemId: item.id,
					cpu: item.cpu,
					memory: item.memory,
					disk: item.disk
				}
			});

			return {
				success:
					item.successMessage ||
					`${item.name} was added to your resource quota. Allocate it from the server settings.`
			};
		}

		if (!adapter.capabilities.servers.create) {
			return fail(403, { error: 'Server creation is not supported by this panel.' });
		}

		const reference = `storefront:${item.id}:${crypto.randomUUID()}`;
		const quotaGrant = {
			cpu: Math.max(0, item.cpu),
			memory: Math.max(0, item.memory),
			disk: Math.max(0, item.disk)
		};
		let charged = 0;
		let quotaGranted = false;
		let created = false;

		try {
			const [nodes, groups, softwares, servers] = await Promise.all([
				adapter.getNodes(),
				adapter.listSoftwareGroups(),
				adapter.listSoftwares(),
				adapter.getServers()
			]);

			const node = item.node
				? nodes.find((entry) => entry.id === item.node || entry.name === item.node)
				: nodes.find((entry) => entry.available) ?? nodes[0];
			const software =
				item.software === null
					? softwares[0]
					: softwares.find((entry) => entry.id === item.software);
			const softwareGroup =
				item.softwareGroup ?? groups.find((entry) => entry.id === software?.groupId)?.id;

			if (!node) return fail(400, { error: 'No panel node is available for this item.' });
			if (!software || softwareGroup === undefined) {
				return fail(400, { error: 'No software is available for this item.' });
			}

			const policies = await getSoftwarePolicies();
			const policy = effectiveSoftwarePolicy(
				policies.groups.get(softwareGroup),
				policies.software.get(software.id)
			);
			const within = (value: number, minimum: number | null, maximum: number | null) =>
				(minimum === null || value >= minimum) && (maximum === null || value <= maximum);

			if (!policy.visible) {
				return fail(400, { error: 'This software is not available for deployment.' });
			}

			if (
				!within(item.cpu, policy.minCpu, policy.maxCpu) ||
				!within(item.memory, policy.minMemory, policy.maxMemory) ||
				!within(item.disk, policy.minDisk, policy.maxDisk)
			) {
				return fail(400, {
					error: 'This item does not fit the resource limits configured for its software.'
				});
			}

			const quotaEnforced = adapter.capabilities.accounts.link;

			const input: CreateServer = {
				name: item.name,
				description: item.description || undefined,
				node: node.id,
				software: software.id,
				softwareGroup,
				cpu: item.cpu,
				ram: item.memory,
				disk: item.disk,
				image: policy.dockerImage || undefined,
				startup: policy.startupCommand || undefined,
				variables:
					Object.keys(policy.environment).length > 0 ? { ...policy.environment } : undefined
			};

			if (price > 0) {
				try {
					await spendCredits({
						userId: locals.user.id,
						amount: price,
						kind: 'storefront_purchase',
						reference,
						description: `Purchased ${item.name}`,
						metadata: { itemId: item.id }
					});
					charged = price;
				} catch (cause) {
					if (cause instanceof CreditError) return fail(402, { error: cause.message });
					throw cause;
				}
			}

			await addUserQuota(locals.user.id, quotaGrant);
			quotaGranted = true;

			const updatedQuota = quotaEnforced ? await getEffectiveQuota(locals.user.id) : null;
			await assertWithinQuota(adapter, input, updatedQuota ?? undefined);
			const server = await adapter.createServer(input);
			created = true;

			if (renewal.enabled) {
				try {
					await createServerBilling({
						serverId: server.id,
						userId: locals.user.id,
						storefrontItemId: item.id,
						baseRenewalPrice: item.renewalPrice,
						renewalPrice: item.renewalPrice,
						intervalDays: item.durationDays,
						autoRenew: false
					});
				} catch (cause) {
					console.error('Unable to create billing for a storefront server.', cause);
				}
			}

			await db
				.insert(storefrontRedemption)
				.values({
					itemId: item.id,
					userId: locals.user.id,
					serverId: server.id,
					status: 'completed',
					message: item.successMessage
				})
				.run();

			logActivity({
				userId: locals.user.id,
				action: 'storefront.claim',
				message: `Claimed storefront item "${item.name}"`,
				metadata: { itemId: item.id, serverId: server.id }
			});

			if (item.successMode === 'console') {
				redirect(303, `/server/${server.id}/console`);
			}

			if (item.successMode === 'redirect') {
				const target = (item.successUrl || '/server/{serverId}').replaceAll(
					'{serverId}',
					server.id
				);
				redirect(303, target);
			}

			return {
				success: item.successMessage || `${item.name} is ready.`,
				serverId: server.id
			};
		} catch (cause) {
			if (isRedirect(cause)) throw cause;

			if (!created) {
				if (quotaGranted) {
					try {
						await addUserQuota(locals.user.id, {
							cpu: -quotaGrant.cpu,
							memory: -quotaGrant.memory,
							disk: -quotaGrant.disk
						});
					} catch (error) {
						console.error('Unable to revert storefront quota.', error);
					}
				}

				await refund(locals.user.id, charged, reference, 'Refund for a failed storefront purchase');
			}

			if (cause instanceof AdapterError) {
				return fail(400, { error: cause.message });
			}

			throw cause;
		}
	}
};
