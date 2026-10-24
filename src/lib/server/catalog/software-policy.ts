import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { softwareSetting } from '#lib/server/db/ops.ts';

export type SoftwareLimits = {
	minCpu: number | null;
	maxCpu: number | null;
	minMemory: number | null;
	maxMemory: number | null;
	minDisk: number | null;
	maxDisk: number | null;
};

export type SoftwarePolicy = SoftwareLimits & {
	visible: boolean;
	editableVariables: string[];
	dockerImage: string;
	startupCommand: string;
	environment: Record<string, string>;
};

export type SoftwarePolicyInput = Omit<SoftwarePolicy, 'editableVariables'> & {
	editableVariables: string[];
};

export const DEFAULT_SOFTWARE_POLICY: SoftwarePolicy = {
	visible: true,
	minCpu: null,
	maxCpu: null,
	minMemory: null,
	maxMemory: null,
	minDisk: null,
	maxDisk: null,
	editableVariables: [],
	dockerImage: '',
	startupCommand: '',
	environment: {}
};

const groupKey = (groupId: number) => `group:${groupId}`;
const softwareKey = (softwareId: number) => `software:${softwareId}`;

const parseVariables = (value: string | null): string[] => {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
	} catch {
		return [];
	}
};

const parseEnvironment = (value: string | null): Record<string, string> => {
	if (!value) return {};

	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

		const entries = Object.entries(parsed as Record<string, unknown>)
			.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
			.map(([key, entry]) => [key.trim(), entry] as const)
			.filter(([key]) => key.length > 0);

		return Object.fromEntries(entries);
	} catch {
		return {};
	}
};

const policyFromRow = (row: typeof softwareSetting.$inferSelect | undefined): SoftwarePolicy => {
	if (!row) return { ...DEFAULT_SOFTWARE_POLICY };

	return {
		visible: row.visible,
		minCpu: row.minCpu,
		maxCpu: row.maxCpu,
		minMemory: row.minMemory,
		maxMemory: row.maxMemory,
		minDisk: row.minDisk,
		maxDisk: row.maxDisk,
		editableVariables: parseVariables(row.editableVariables),
		dockerImage: row.dockerImage,
		startupCommand: row.startupCommand,
		environment: parseEnvironment(row.environment)
	};
};

export const getSoftwarePolicies = async () => {
	const rows = await db.select().from(softwareSetting);
	const groups = new Map<number, SoftwarePolicy>();
	const software = new Map<number, SoftwarePolicy>();

	for (const row of rows) {
		if (row.softwareId === null) {
			groups.set(row.groupId, policyFromRow(row));
		} else {
			software.set(row.softwareId, policyFromRow(row));
		}
	}

	return { groups, software };
};

export const getGroupPolicy = async (groupId: number) => {
	const row = await db
		.select()
		.from(softwareSetting)
		.where(eq(softwareSetting.key, groupKey(groupId)))
		.get();

	return policyFromRow(row);
};

export const getSoftwarePolicy = async (softwareId: number) => {
	const row = await db
		.select()
		.from(softwareSetting)
		.where(eq(softwareSetting.key, softwareKey(softwareId)))
		.get();

	return policyFromRow(row);
};

export const effectiveSoftwarePolicy = (
	group: SoftwarePolicy | undefined,
	software: SoftwarePolicy | undefined
): SoftwarePolicy => {
	const groupPolicy = group ?? DEFAULT_SOFTWARE_POLICY;
	const softwarePolicy = software ?? DEFAULT_SOFTWARE_POLICY;

	return {
		visible: groupPolicy.visible && softwarePolicy.visible,
		minCpu: softwarePolicy.minCpu ?? groupPolicy.minCpu,
		maxCpu: softwarePolicy.maxCpu ?? groupPolicy.maxCpu,
		minMemory: softwarePolicy.minMemory ?? groupPolicy.minMemory,
		maxMemory: softwarePolicy.maxMemory ?? groupPolicy.maxMemory,
		minDisk: softwarePolicy.minDisk ?? groupPolicy.minDisk,
		maxDisk: softwarePolicy.maxDisk ?? groupPolicy.maxDisk,
		editableVariables: softwarePolicy.editableVariables,
		dockerImage: softwarePolicy.dockerImage || groupPolicy.dockerImage,
		startupCommand: softwarePolicy.startupCommand || groupPolicy.startupCommand,
		environment: { ...groupPolicy.environment, ...softwarePolicy.environment }
	};
};

export const saveGroupPolicy = async (groupId: number, values: SoftwarePolicyInput) => {
	await db
		.insert(softwareSetting)
		.values({
			key: groupKey(groupId),
			groupId,
			softwareId: null,
			visible: values.visible,
			minCpu: values.minCpu,
			maxCpu: values.maxCpu,
			minMemory: values.minMemory,
			maxMemory: values.maxMemory,
			minDisk: values.minDisk,
			maxDisk: values.maxDisk,
			editableVariables: '[]',
			dockerImage: values.dockerImage,
			startupCommand: values.startupCommand,
			environment: JSON.stringify(values.environment)
		})
		.onConflictDoUpdate({
			target: softwareSetting.key,
			set: {
				groupId,
				softwareId: null,
				visible: values.visible,
				minCpu: values.minCpu,
				maxCpu: values.maxCpu,
				minMemory: values.minMemory,
				maxMemory: values.maxMemory,
				minDisk: values.minDisk,
				maxDisk: values.maxDisk,
				editableVariables: '[]',
				dockerImage: values.dockerImage,
				startupCommand: values.startupCommand,
				environment: JSON.stringify(values.environment),
				updatedAt: new Date()
			}
		})
		.run();
};

export const saveSoftwarePolicy = async (
	groupId: number,
	softwareId: number,
	values: SoftwarePolicyInput
) => {
	await db
		.insert(softwareSetting)
		.values({
			key: softwareKey(softwareId),
			groupId,
			softwareId,
			visible: values.visible,
			minCpu: values.minCpu,
			maxCpu: values.maxCpu,
			minMemory: values.minMemory,
			maxMemory: values.maxMemory,
			minDisk: values.minDisk,
			maxDisk: values.maxDisk,
			editableVariables: JSON.stringify(values.editableVariables),
			dockerImage: values.dockerImage,
			startupCommand: values.startupCommand,
			environment: JSON.stringify(values.environment)
		})
		.onConflictDoUpdate({
			target: softwareSetting.key,
			set: {
				groupId,
				softwareId,
				visible: values.visible,
				minCpu: values.minCpu,
				maxCpu: values.maxCpu,
				minMemory: values.minMemory,
				maxMemory: values.maxMemory,
				minDisk: values.minDisk,
				maxDisk: values.maxDisk,
				editableVariables: JSON.stringify(values.editableVariables),
				dockerImage: values.dockerImage,
				startupCommand: values.startupCommand,
				environment: JSON.stringify(values.environment),
				updatedAt: new Date()
			}
		})
		.run();
};

export const resetGroupPolicy = async (groupId: number) => {
	await db.delete(softwareSetting).where(eq(softwareSetting.key, groupKey(groupId))).run();
};

export const resetSoftwarePolicy = async (softwareId: number) => {
	await db.delete(softwareSetting).where(eq(softwareSetting.key, softwareKey(softwareId))).run();
};

