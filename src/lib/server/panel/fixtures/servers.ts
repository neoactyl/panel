import type { Server } from '#lib/adapter/sdk.ts';

export type { Server, ServerState, ServerStatus } from '#lib/adapter/sdk.ts';

export const NODES = ['node-01', 'node-02', 'node-03'];

export const SAMPLE_SERVERS: Server[] = [
	{
		id: 'a1f9c3e2-1d4b-4b8a-9c77-0e5d2f6a1b30',
		name: 'Survival SMP',
		identifier: 'a1f9c3e2',
		description: 'Paper 26.3 · 24 players online',
		node: 'node-01',
		image: 'ghcr.io/pterodactyl/yolks:java_21',
		version: '26.3',
		state: 'running',
		cpu: { used: 148, limit: 400 },
		memory: { used: 5842, limit: 8192 },
		disk: { used: 21430, limit: 51200 },
		actions: ['restart', 'stop', 'kill']
	},
	{
		id: 'b47d9a10-88c2-4f31-a5de-7712bb90c4aa',
		name: 'Velocity Proxy',
		identifier: 'b47d9a10',
		description: 'Velocity 3.3 · idle',
		node: 'node-01',
		image: 'ghcr.io/pterodactyl/yolks:java_21',
		version: '1.21.10',
		state: 'running',
		cpu: { used: 22, limit: 200 },
		memory: { used: 512, limit: 2048 },
		disk: { used: 890, limit: 10240 },
		actions: ['restart', 'stop', 'kill']
	},
	{
		id: 'c09e5b77-3a61-4c8e-b0f2-9d4e6a881f5c',
		name: 'Velocity Proxy',
		identifier: 'c09e5b77',
		description: 'Staging proxy · stopped',
		node: 'node-02',
		image: 'ghcr.io/pterodactyl/yolks:java_21',
		version: '1.21.10',
		state: 'offline',
		cpu: { used: 0, limit: 200 },
		memory: { used: 0, limit: 2048 },
		disk: { used: 764, limit: 10240 },
		actions: ['start']
	},
	{
		id: 'd2b8f144-6e07-4a2d-9f83-1c5b0ea73d91',
		name: 'Discord Bot',
		identifier: 'd2b8f144',
		description: 'Node 22 · gateway shard 0',
		node: 'node-03',
		image: 'ghcr.io/pterodactyl/yolks:nodejs_22',
		version: '1.21.10',
		state: 'starting',
		cpu: { used: 61, limit: 200 },
		memory: { used: 348, limit: 1024 },
		disk: { used: 412, limit: 5120 },
		actions: ['stop', 'kill']
	},
	{
		id: 'e5c1a7d2-9b44-4e6f-8a10-2f7d93c0b6e8',
		name: 'Redis Cache',
		identifier: 'e5c1a7d2',
		description: 'Production cache · 6.2',
		node: 'node-02',
		image: 'ghcr.io/pterodactyl/yolks:redis_7',
		version: '1.21.10',
		state: 'stopping',
		cpu: { used: 12, limit: 100 },
		memory: { used: 208, limit: 512 },
		disk: { used: 128, limit: 2048 },
		actions: ['stop', 'kill']
	},
	{
		id: 'f83ab2c9-5d10-4b77-9e63-4a0c881d2f45',
		name: 'Build Node',
		identifier: 'f83ab2c9',
		description: 'CI agent · offline',
		node: 'node-03',
		image: 'ghcr.io/pterodactyl/yolks:nodejs_22',
		version: '1.21.10',
		state: 'offline',
		cpu: { used: 0, limit: 600 },
		memory: { used: 0, limit: 4096 },
		disk: { used: 15872, limit: 25600 },
		actions: ['start']
	}
];
