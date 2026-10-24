import { AdapterError } from '#lib/adapter/sdk.ts';
import type { Adapter, CreateServer, Server } from '#lib/adapter/sdk.ts';
import { getBool, getDefaultServerLimits, getNumber, getQuota } from '#lib/server/config/settings.ts';

export type ResourceTotals = {
	cpu: number;
	memory: number;
	disk: number;
};

export const resourceTotals = (
	servers: Pick<Server, 'cpu' | 'memory' | 'disk'>[]
): ResourceTotals => {
	let cpu = 0;
	let memory = 0;
	let disk = 0;

	for (const server of servers) {
		cpu += server.cpu.limit;
		memory += server.memory.limit;
		disk += server.disk.limit;
	}

	return { cpu, memory, disk };
};

export const requestedResources = (input: CreateServer): ResourceTotals => {
	const defaults = getDefaultServerLimits();

	return {
		cpu: input.cpu ?? defaults.cpu,
		memory: input.ram ?? defaults.memory,
		disk: input.disk ?? defaults.disk
	};
};

export const remainingResources = (
	servers: Pick<Server, 'cpu' | 'memory' | 'disk'>[],
	quota = getQuota()
): ResourceTotals => {
	const used = resourceTotals(servers);

	return {
		cpu: Math.max(0, quota.cpu - used.cpu),
		memory: Math.max(0, quota.memory - used.memory),
		disk: Math.max(0, quota.disk - used.disk)
	};
};

export const maxServersPerUser = () => getNumber('server.maxPerUser');

export const assertWithinQuota = async (
	adapter: Adapter,
	input: CreateServer,
	limits?: { cpu: number; memory: number; disk: number; maxServers: number }
) => {
	if (!adapter.capabilities.accounts.link || !getBool('panel.linkAccounts')) return;

	const defaults = getQuota();
	const quota = limits ?? { ...defaults, maxServers: maxServersPerUser() };
	const servers = await adapter.getServers();
	const used = resourceTotals(servers);
	const requested = requestedResources(input);
	const exceeded: string[] = [];
	const maxServers = quota.maxServers;

	if (maxServers > 0 && servers.length >= maxServers) {
		throw new AdapterError(
			`You have reached the limit of ${maxServers} server${maxServers === 1 ? '' : 's'}.`,
			'VALIDATION'
		);
	}

	if (requested.cpu > quota.cpu - used.cpu) {
		exceeded.push(`CPU ${requested.cpu}% (${Math.max(0, quota.cpu - used.cpu)}% left)`);
	}

	if (requested.memory > quota.memory - used.memory) {
		exceeded.push(
			`memory ${requested.memory} MB (${Math.max(0, quota.memory - used.memory)} MB left)`
		);
	}

	if (requested.disk > quota.disk - used.disk) {
		exceeded.push(
			`disk ${requested.disk} MB (${Math.max(0, quota.disk - used.disk)} MB left)`
		);
	}

	if (exceeded.length > 0) {
		throw new AdapterError(
			`This server exceeds your resource allocation: ${exceeded.join(', ')}`,
			'VALIDATION'
		);
	}
};
