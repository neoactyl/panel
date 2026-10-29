import { error, fail, redirect } from '@sveltejs/kit';
import { AdapterError, type CreateServer } from '#lib/adapter/sdk.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import { createServerBilling, getRenewalSettings } from '#lib/server/billing/billing.ts';
import { addCredits, CreditError, getCreditBalance, spendCredits } from '#lib/server/billing/credits.ts';
import { getBool, getDefaultServerLimits } from '#lib/server/config/settings.ts';
import { toOptionalInt } from '#lib/server/forms.ts';
import {
	DEFAULT_SOFTWARE_POLICY,
	effectiveSoftwarePolicy,
	getSoftwarePolicies
} from '#lib/server/catalog/software-policy.ts';
import { assertWithinQuota, remainingResources, resourceTotals } from '#lib/server/quota/resources.ts';
import { getEffectiveQuota } from '#lib/server/quota/user.ts';
import type { Actions, PageServerLoad } from './$types';

const describeRange = (minimum: number, maximum: number, label: string) =>
	Number.isFinite(maximum)
		? `${label} must be between ${minimum} and ${maximum}.`
		: `${label} must be at least ${minimum}.`;

export const load: PageServerLoad = async ({ locals }) => {
	if (!getBool('server.allowCreate')) {
		error(404, { message: 'Server creation is disabled.' });
	}

	const adapter = getUserAdapter(locals.panelUserId);

	if (!adapter.capabilities.servers.create) {
		error(404, 'Server creation is not supported');
	}

	adapter.refreshCatalog();

	const [nodes, allNests, allEggs, servers, policies] = await Promise.all([
		adapter.getNodes(),
		adapter.listSoftwareGroups(),
		adapter.listSoftwares(),
		adapter.getServers(),
		getSoftwarePolicies()
	]);

	const groupPolicy = (groupId: number) =>
		policies.groups.get(groupId) ?? DEFAULT_SOFTWARE_POLICY;
	const nests = allNests.filter((nest) => groupPolicy(nest.id).visible);
	const eggs = allEggs
		.filter((egg) => {
			const group = groupPolicy(egg.groupId);
			const software = policies.software.get(egg.id) ?? DEFAULT_SOFTWARE_POLICY;
			return group.visible && software.visible;
		})
		.map((egg) => ({
			...egg,
			policy: effectiveSoftwarePolicy(
				groupPolicy(egg.groupId),
				policies.software.get(egg.id)
			)
		}));

	const quotaEnforced = adapter.capabilities.accounts.link;
	const effectiveQuota = quotaEnforced ? await getEffectiveQuota(locals.user?.id) : null;
	const renewal = getRenewalSettings();

	return {
		nodes,
		nests,
		eggs,
		defaults: getDefaultServerLimits(),
		quota: effectiveQuota,
		used: effectiveQuota ? resourceTotals(servers) : null,
		remaining: effectiveQuota ? remainingResources(servers, effectiveQuota) : null,
		credits: renewal.enabled && locals.user ? await getCreditBalance(locals.user.id) : null,
		renewal,
		creationCost:
			renewal.enabled && renewal.creationCostEnabled ? Math.max(0, renewal.creationCost) : 0
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const node = String(data.get('node') ?? '').trim();
		const software = toOptionalInt(data.get('software'), 0);
		const softwareGroup = toOptionalInt(data.get('softwareGroup'), 0);
		const cpu = toOptionalInt(data.get('cpu'), 1);
		const ram = toOptionalInt(data.get('ram'), 1);
		const disk = toOptionalInt(data.get('disk'), 1);
		const databases = toOptionalInt(data.get('databases'), 0);
		const allocations = toOptionalInt(data.get('allocations'), 0);

		if (name.length < 2) {
			return fail(400, { message: 'Server name must be at least 2 characters.' });
		}

		if (name.length > 100 || description.length > 255) {
			return fail(400, { message: 'Server name or description is too long.' });
		}

		if (cpu === null || ram === null || disk === null) {
			return fail(400, { message: 'Resource values must be positive whole numbers.' });
		}

		if (databases === null || allocations === null) {
			return fail(400, { message: 'Database and allocation counts must be whole numbers.' });
		}

		if (software === null || softwareGroup === null) {
			return fail(400, { message: 'Choose a valid nest and egg.' });
		}

		if (software === undefined || softwareGroup === undefined || !node) {
			return fail(400, { message: 'Choose a nest, egg, and node.' });
		}

		const adapter = getUserAdapter(locals.panelUserId);

		if (!getBool('server.allowCreate')) {
			return fail(403, { message: 'Server creation is disabled.' });
		}

		if (!adapter.capabilities.servers.create) {
			return fail(403, { message: 'Server creation is not supported.' });
		}

		const policies = await getSoftwarePolicies();
		const policy = effectiveSoftwarePolicy(
			policies.groups.get(softwareGroup),
			policies.software.get(software)
		);

		if (!policy.visible) {
			return fail(400, { message: 'That egg is not available for deployment.' });
		}

		let eggVariables: Awaited<ReturnType<typeof adapter.getSoftwareVariables>> = [];

		if (policy.editableVariables.length > 0) {
			try {
				eggVariables = await adapter.getSoftwareVariables(softwareGroup, software);
			} catch {
				return fail(400, { message: 'Unable to load the egg variables for this server.' });
			}
		}

		const allowedVariables = new Map(
			eggVariables
				.filter((variable) => variable.editable && policy.editableVariables.includes(variable.key))
				.map((variable) => [variable.key, variable])
		);
		const variables: Record<string, string> = {};

		for (const [key, value] of data.entries()) {
			if (!key.startsWith('variable:')) continue;

			const variableKey = key.slice('variable:'.length);
			if (!allowedVariables.has(variableKey)) continue;

			const text = String(value);
			if (text.length > 2000) {
				return fail(400, { message: `${variableKey} is too long.` });
			}

			variables[variableKey] = text;
		}

		const defaults = getDefaultServerLimits();
		const quotaEnforced = adapter.capabilities.accounts.link;
		const effectiveQuota = quotaEnforced ? await getEffectiveQuota(locals.user?.id) : null;
		const requestedDatabases = databases ?? 0;
		const requestedAllocations = allocations ?? 0;

		if (
			effectiveQuota &&
			effectiveQuota.maxDatabases > 0 &&
			requestedDatabases > effectiveQuota.maxDatabases
		) {
			return fail(400, {
				message: `You can add at most ${effectiveQuota.maxDatabases} database${effectiveQuota.maxDatabases === 1 ? '' : 's'} to a server.`
			});
		}

		if (
			effectiveQuota &&
			effectiveQuota.maxAllocations > 0 &&
			requestedAllocations > effectiveQuota.maxAllocations
		) {
			return fail(400, {
				message: `You can add at most ${effectiveQuota.maxAllocations} extra allocation${effectiveQuota.maxAllocations === 1 ? '' : 's'} to a server.`
			});
		}

		const [nodes, servers] = await Promise.all([
			adapter.getNodes(),
			quotaEnforced ? adapter.getServers() : Promise.resolve([])
		]);
		const remaining = effectiveQuota ? remainingResources(servers, effectiveQuota) : null;
		const selectedNode = nodes.find((entry) => entry.id === node || entry.name === node);
		const freeMemory =
			selectedNode && selectedNode.memory.limit > 0
				? Math.max(0, selectedNode.memory.limit - selectedNode.memory.allocated)
				: Number.POSITIVE_INFINITY;
		const freeDisk =
			selectedNode && selectedNode.disk.limit > 0
				? Math.max(0, selectedNode.disk.limit - selectedNode.disk.allocated)
				: Number.POSITIVE_INFINITY;

		const minimumCpu = Math.max(1, policy.minCpu ?? 1);
		const minimumRam = Math.max(1, policy.minMemory ?? 1);
		const minimumDisk = Math.max(1, policy.minDisk ?? 1);
		const maximumCpu = policy.maxCpu ?? Number.POSITIVE_INFINITY;
		const maximumRam = policy.maxMemory ?? Number.POSITIVE_INFINITY;
		const maximumDisk = policy.maxDisk ?? Number.POSITIVE_INFINITY;

		if (cpu !== undefined && (cpu < minimumCpu || cpu > maximumCpu)) {
			return fail(400, { message: describeRange(minimumCpu, maximumCpu, 'CPU') });
		}
		if (ram !== undefined && (ram < minimumRam || ram > maximumRam)) {
			return fail(400, { message: describeRange(minimumRam, maximumRam, 'Memory') });
		}
		if (disk !== undefined && (disk < minimumDisk || disk > maximumDisk)) {
			return fail(400, { message: describeRange(minimumDisk, maximumDisk, 'Disk') });
		}

		const resolvedCpu = Math.min(
			maximumCpu,
			Math.max(minimumCpu, cpu ?? remaining?.cpu ?? defaults.cpu)
		);
		const resolvedRam = Math.min(
			maximumRam,
			Math.max(
				minimumRam,
				ram ?? Math.min(remaining?.memory ?? defaults.memory, freeMemory)
			)
		);
		const resolvedDisk = Math.min(
			maximumDisk,
			Math.max(
				minimumDisk,
				disk ?? Math.min(remaining?.disk ?? defaults.disk, freeDisk)
			)
		);

		if (resolvedCpu < 1 || resolvedRam < 1 || resolvedDisk < 1) {
			return fail(400, { message: 'No remaining resources are available to allocate.' });
		}

		if (resolvedRam > freeMemory) {
			return fail(400, { message: 'Memory request exceeds the free capacity on this node.' });
		}
		if (resolvedDisk > freeDisk) {
			return fail(400, { message: 'Disk request exceeds the free capacity on this node.' });
		}

		const input: CreateServer = {
			name,
			description: description || undefined,
			node,
			software,
			softwareGroup,
			cpu: resolvedCpu,
			ram: resolvedRam,
			disk: resolvedDisk,
			databases: requestedDatabases,
			allocations: requestedAllocations,
			variables: { ...policy.environment, ...variables },
			image: policy.dockerImage || undefined,
			startup: policy.startupCommand || undefined
		};

		const renewal = getRenewalSettings();
		const cost = renewal.enabled && renewal.creationCostEnabled ? Math.max(0, renewal.creationCost) : 0;
		const reference = `server:create:${crypto.randomUUID()}`;
		let charged = 0;

		if (cost > 0) {
			if (!locals.user) {
				return fail(401, { message: 'You need to be signed in to create a server.' });
			}

			try {
				await spendCredits({
					userId: locals.user.id,
					amount: cost,
					kind: 'server_create',
					reference,
					description: `Created server ${name}`,
					metadata: {
						name,
						cpu: resolvedCpu,
						ram: resolvedRam,
						disk: resolvedDisk,
						databases: requestedDatabases,
						allocations: requestedAllocations
					}
				});
				charged = cost;
			} catch (cause) {
				if (cause instanceof CreditError) {
					return fail(402, { message: cause.message });
				}

				throw cause;
			}
		}

		let serverId: string;

		try {
			await assertWithinQuota(adapter, input, effectiveQuota ?? undefined);
			const server = await adapter.createServer(input);
			serverId = server.id;
		} catch (cause) {
			if (charged > 0 && locals.user) {
				await addCredits({
					userId: locals.user.id,
					amount: charged,
					kind: 'refund',
					reference: `refund:${reference}`,
					description: 'Refund for a failed server creation'
				});
			}

			if (cause instanceof AdapterError) {
				return fail(400, { message: cause.message });
			}

			throw cause;
		}

		if (renewal.enabled && locals.user) {
			try {
				await createServerBilling({
					serverId,
					userId: locals.user.id,
					baseRenewalPrice: renewal.defaultRenewalPrice,
					renewalPrice: renewal.defaultRenewalPrice,
					intervalDays: renewal.intervalDays,
					autoRenew: false
				});
			} catch (cause) {
				console.error('Unable to create billing for a new server.', cause);
			}
		}

		redirect(303, `/server/${serverId}/console`);
	}
};

