import type { Software, SoftwareGroup } from '#lib/adapter/sdk.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import {
	DEFAULT_SOFTWARE_POLICY,
	effectiveSoftwarePolicy,
	getSoftwarePolicies,
	type SoftwarePolicy
} from '#lib/server/catalog/software-policy.ts';

export type AdminSoftwareGroup = SoftwareGroup & {
	policy: SoftwarePolicy;
	eggCount: number;
};

export type AdminSoftware = Software & {
	groupName: string;
	policy: SoftwarePolicy;
};

export const loadSoftwareCatalog = async () => {
	try {
		const adapter = getAdapter();
		adapter.refreshCatalog();

		const [groups, eggs, policies] = await Promise.all([
			adapter.listSoftwareGroups(),
			adapter.listSoftwares(),
			getSoftwarePolicies()
		]);

		const groupPolicies = new Map(
			groups.map((group) => [group.id, policies.groups.get(group.id) ?? DEFAULT_SOFTWARE_POLICY])
		);

		const groupRows: AdminSoftwareGroup[] = groups.map((group) => ({
			...group,
			policy: groupPolicies.get(group.id) ?? DEFAULT_SOFTWARE_POLICY,
			eggCount: eggs.filter((egg) => egg.groupId === group.id).length
		}));

		const eggRows: AdminSoftware[] = eggs.map((egg) => ({
			...egg,
			groupName: groups.find((group) => group.id === egg.groupId)?.name ?? 'Unknown nest',
			policy: effectiveSoftwarePolicy(
				groupPolicies.get(egg.groupId),
				policies.software.get(egg.id)
			)
		}));

		return { groups: groupRows, eggs: eggRows, catalogError: '' };
	} catch (cause) {
		return {
			groups: [] as AdminSoftwareGroup[],
			eggs: [] as AdminSoftware[],
			catalogError:
				cause instanceof Error
					? cause.message
					: 'Unable to load the software catalog from the panel.'
		};
	}
};
