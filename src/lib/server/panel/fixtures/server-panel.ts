import { FILES_ROOT } from '#lib/adapter/sdk.ts';
import type {
	Activity,
	Allocation,
	Backup,
	ConsoleLine,
	Database,
	FileEntry,
	FileSystem,
	Schedule,
	StartupVariable,
	Subuser
} from '#lib/adapter/sdk.ts';
import type { Server } from '#lib/adapter/sdk.ts';

export { FILES_ROOT };
export type { ConsoleLine } from '#lib/adapter/sdk.ts';

export type MockFile = FileEntry;
export type MockAllocation = Allocation;
export type MockDatabase = Database;
export type MockBackup = Backup;
export type MockSchedule = Schedule;
export type MockStartupVariable = StartupVariable;
export type MockSubuser = Subuser;
export type MockActivity = Activity;
export type MockFileSystem = FileSystem;
const now = () => new Date().toISOString();

const SERVER_PROPERTIES = `#Minecraft server properties
enable-jmx-monitoring=false
rcon.port=25575
level-seed=
gamemode=survival
enable-command-block=false
enable-query=false
generator-settings={}
enforce-secure-profile=true
level-name=world
motd=A Neoactyl powered server
max-players=30
online-mode=true
pvp=true
difficulty=hard
spawn-protection=16
view-distance=10
simulation-distance=8
server-port=25565
`;

const START_SH = `#!/usr/bin/env bash
cd /home/container

# Make internal Docker IP address available to processes.
export INTERNAL_IP=$(ip route get 1 | awk '{print $(NF - 2)}')
export SERVER_MEMORY=\${SERVER_MEMORY:-1024}

java -Xms128M -Xmx\${SERVER_MEMORY}M -jar \${SERVER_JARFILE:-server.jar} nogui
`;

const PAPER_GLOBAL = `# Paper global configuration
_version: 29
chunk-loading:
  autoconfig-send-distance: true
  enable-frustum-priority: false
  max-concurrent-sends: 2
  min-load-radius: 2
messages:
  kick:
    authentication-servers-down: "<lang:multiplayer.disconnect.authservers_down>"
  no-permission: "<red>I'm sorry, but you do not have permission to perform this command."
misc:
  max-joins-per-tick: 5
  region-file-cache-size: 256
  use-alternative-luck-formula: false
  use-dimensional-culling: true
`;

const LATEST_LOG = `[12:00:01] [Server thread/INFO]: Starting minecraft server version 1.21.4
[12:00:01] [Server thread/INFO]: Loading properties
[12:00:01] [Server thread/INFO]: Default game type: SURVIVAL
[12:00:02] [Server thread/INFO]: Generating keypair
[12:00:02] [Server thread/INFO]: Starting Minecraft server on *:25565
[12:00:03] [Server thread/INFO]: Preparing level "world"
[12:00:04] [Server thread/INFO]: Preparing spawn area: 92%
[12:00:05] [Server thread/INFO]: Done (4.812s)! For help, type "help"
[12:00:06] [Server thread/INFO]: Velocity proxy connected
[12:00:07] [Server thread/INFO]: Oraxen loaded 214 items
[12:00:11] [Server thread/WARN]: Can't keep up! Is the server overloaded?
[12:00:18] [Server thread/INFO]: Steve joined the game
[12:00:24] [Server thread/INFO]: Alex joined the game
`;

const ORAXEN_CONFIG = `# Oraxen configuration
enabled: true
default_language: en
use_nms: true
gui:
  inventory: true
  repair: true
items:
  auto_update: true
  disable_recipes: false
pack:
  generate: true
  upload: true
  send: true
`;

const OPS_JSON = `[
  {
    "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    "name": "Notch",
    "level": 4,
    "bypassesPlayerLimit": false
  }
]`;

const BUKKIT_YML = `settings:
  allow-end: true
  warn-on-overload: true
  permissions-file: permissions.yml
  update-folder: update
  plugin-profiling: false
  connection-throttle: 4000
  query-plugins: true
  deprecated-verbose: default
  shutdown-message: Server closed
`;

export const mockFileSystem = (): MockFileSystem => {
	const stamp = now();
	const dir = (name: string): MockFile => ({ name, type: 'dir', size: null, modified: stamp });
	const file = (name: string, size: number, content?: string): MockFile => ({
		name,
		type: 'file',
		size,
		modified: stamp,
		content
	});

	return {
		tree: {
			[FILES_ROOT]: [
				dir('plugins'),
				dir('config'),
				dir('world'),
				dir('logs'),
				dir('backups'),
				file('eula.txt', 168, '#By changing the setting below to TRUE you are indicating your agreement to our EULA.\neula=true\n'),
				file('server.properties', SERVER_PROPERTIES.length, SERVER_PROPERTIES),
				file('paper-global.yml', PAPER_GLOBAL.length, PAPER_GLOBAL),
				file('start.sh', START_SH.length, START_SH),
				file('ops.json', OPS_JSON.length, OPS_JSON),
				file('server.jar', 48_214_918),
				file('world-2026-10-18.tar.gz', 221_440_512),
				file('latest-backup.zip', 62_914_560)
			],
			[`${FILES_ROOT}/plugins`]: [
				dir('Oraxen'),
				file('LuckPerms.jar', 4_812_800),
				file('ViaVersion.jar', 6_291_456),
				file('EssentialsX.jar', 9_204_224),
				file('spark.jar', 1_887_232)
			],
			[`${FILES_ROOT}/plugins/Oraxen`]: [
				file('config.yml', ORAXEN_CONFIG.length, ORAXEN_CONFIG),
				file('items.yml', 182)
			],
			[`${FILES_ROOT}/config`]: [
				file('bukkit.yml', BUKKIT_YML.length, BUKKIT_YML),
				file('whitelist.json', 24, '[\n  "Notch",\n  "Steve"\n]\n'),
				file('banned-players.json', 4, '[\n\n]\n')
			],
			[`${FILES_ROOT}/world`]: [
				dir('region'),
				dir('data'),
				file('level.dat', 1_258_496),
				file('session.lock', 8)
			],
			[`${FILES_ROOT}/world/region`]: [
				file('r.0.0.mca', 4_194_304),
				file('r.0.1.mca', 3_407_872),
				file('r.-1.0.mca', 3_932_160)
			],
			[`${FILES_ROOT}/world/data`]: [file('raids.dat', 2_048), file('map_1.dat', 65_536)],
			[`${FILES_ROOT}/logs`]: [
				file('latest.log', LATEST_LOG.length, LATEST_LOG),
				file('debug.log', 64_211),
				file('2026-10-18-1.log.gz', 22_114),
				file('2026-10-17-1.log.gz', 20_984)
			],
			[`${FILES_ROOT}/backups`]: [
				file('daily-2026-10-20.tar.gz', 1_932_735_283),
				file('daily-2026-10-19.tar.gz', 1_906_204_672)
			]
		}
	};
};

export const mockAllocations = (server: Server): MockAllocation[] => {
	const base = server.name.length * 7 + 25500;

	return [
		{ id: 'alloc-primary', ip: '0.0.0.0', port: base, primary: true, notes: 'Primary allocation' },
		{ id: 'alloc-2', ip: '0.0.0.0', port: base + 1, primary: false, notes: 'Query port' },
		{ id: 'alloc-3', ip: '0.0.0.0', port: base + 2, primary: false, notes: 'RCON port' }
	];
};

export const mockDatabases = (server: Server): MockDatabase[] => {
	const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

	return [
		{
			id: 'db-1',
			name: `${slug}_main`,
			host: 'db.node-01.neoactyl.local',
			port: 3306,
			username: `${slug}_user`
		},
		{
			id: 'db-2',
			name: `${slug}_stats`,
			host: 'db.node-01.neoactyl.local',
			port: 3306,
			username: `${slug}_stats`
		}
	];
};

const stamp = (offset: number) => {
	const date = new Date(Date.now() - offset * 1000);
	return date.toTimeString().slice(0, 8);
};

export const mockConsole = (server: Server): ConsoleLine[] => [
	{ time: stamp(42), level: 'INFO', text: `Starting ${server.image}` },
	{ time: stamp(41), level: 'INFO', text: 'Container started successfully (PID 1)' },
	{ time: stamp(40), level: 'INFO', text: 'Loading libraries, please wait...' },
	{ time: stamp(39), level: 'INFO', text: '[Server thread/INFO]: Starting minecraft server version 1.21.4' },
	{ time: stamp(37), level: 'INFO', text: '[Server thread/INFO]: Loading properties' },
	{ time: stamp(36), level: 'INFO', text: '[Server thread/INFO]: Default game type: SURVIVAL' },
	{ time: stamp(33), level: 'INFO', text: '[Server thread/INFO]: Preparing level "world"' },
	{ time: stamp(29), level: 'INFO', text: '[Server thread/INFO]: Preparing spawn area: 92%' },
	{ time: stamp(25), level: 'INFO', text: '[Server thread/INFO]: Done (4.812s)! For help, type "help"' },
	{ time: stamp(24), level: 'INFO', text: '[Server thread/INFO]: Velocity proxy connected' },
	{ time: stamp(18), level: 'INFO', text: '[Server thread/INFO]: Oraxen loaded 214 items' },
	{ time: stamp(12), level: 'WARN', text: '[Server thread/WARN]: Can\'t keep up! Is the server overloaded?' },
	{ time: stamp(8), level: 'INFO', text: '[Server thread/INFO]: Steve joined the game' },
	{ time: stamp(4), level: 'INFO', text: '[Server thread/INFO]: Alex joined the game' }
];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export const mockBackups = (server: Server): MockBackup[] => {
	const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

	return [
		{
			id: 'backup-1',
			name: `${slug}-daily-2026-10-20`,
			size: 1_932_735_283,
			createdAt: ago(184),
			status: 'completed'
		},
		{
			id: 'backup-2',
			name: `${slug}-daily-2026-10-19`,
			size: 1_906_204_672,
			createdAt: ago(1624),
			status: 'completed'
		},
		{
			id: 'backup-3',
			name: `${slug}-manual-before-update`,
			size: 1_884_901_376,
			createdAt: ago(3180),
			status: 'completed'
		},
		{
			id: 'backup-4',
			name: `${slug}-weekly-2026-10-13`,
			size: 0,
			createdAt: ago(10_260),
			status: 'failed'
		}
	];
};

export const mockSchedules = (): MockSchedule[] => [
	{
		id: 'schedule-1',
		name: 'Daily restart',
		cron: '0 4 * * *',
		action: 'restart',
		enabled: true,
		lastRun: ago(540),
		nextRun: ahead(900)
	},
	{
		id: 'schedule-2',
		name: 'Hourly save',
		cron: '0 * * * *',
		action: 'save-all',
		enabled: true,
		lastRun: ago(24),
		nextRun: ahead(36)
	},
	{
		id: 'schedule-3',
		name: 'Weekly backup',
		cron: '0 3 * * 0',
		action: 'backup run',
		enabled: false,
		lastRun: ago(8640),
		nextRun: ahead(4320)
	}
];

export const mockStartupVariables = (server: Server): MockStartupVariable[] => [
	{
		key: 'SERVER_JARFILE',
		name: 'Server Jar File',
		description: 'The jar file executed when the server starts.',
		value: 'server.jar',
		editable: true
	},
	{
		key: 'MC_VERSION',
		name: 'Minecraft Version',
		description: 'Version used to resolve the server software build.',
		value: server.version,
		editable: true
	},
	{
		key: 'BUILD_NUMBER',
		name: 'Build Number',
		description: 'Specific build to install, or "latest".',
		value: 'latest',
		editable: true
	},
	{
		key: 'SERVER_MEMORY',
		name: 'Server Memory',
		description: 'Memory limit in megabytes, managed by the panel.',
		value: String(server.memory.limit),
		editable: false
	}
];

export const STARTUP_COMMAND =
	'java -Xms128M -Xmx{{SERVER_MEMORY}}M -Djdk.tls.client.protocols=TLSv1.2 -jar {{SERVER_JARFILE}} nogui';

export const mockSubusers = (): MockSubuser[] => [
	{
		id: 'subuser-1',
		username: 'maya',
		email: 'maya@neoactyl.dev',
		permissions: ['control.console', 'control.start', 'control.stop', 'file.read'],
		addedAt: ago(21_600)
	},
	{
		id: 'subuser-2',
		username: 'theo',
		email: 'theo@neoactyl.dev',
		permissions: ['file.read', 'file.write', 'backup.create'],
		addedAt: ago(8_640)
	}
];

export const mockActivities = (server: Server): MockActivity[] => [
	{
		id: 'activity-1',
		actor: 'samir',
		event: 'server:power.start',
		detail: `Started ${server.name}`,
		ip: '192.168.1.24',
		timestamp: ago(3)
	},
	{
		id: 'activity-2',
		actor: 'theo',
		event: 'file.write',
		detail: 'Edited /server.properties',
		ip: '192.168.1.88',
		timestamp: ago(47)
	},
	{
		id: 'activity-3',
		actor: 'system',
		event: 'backup.complete',
		detail: 'Daily backup finished (1.8 GB)',
		ip: '127.0.0.1',
		timestamp: ago(184)
	},
	{
		id: 'activity-4',
		actor: 'maya',
		event: 'console.command',
		detail: 'Ran "whitelist add alex"',
		ip: '192.168.1.51',
		timestamp: ago(312)
	},
	{
		id: 'activity-5',
		actor: 'samir',
		event: 'schedule.update',
		detail: 'Disabled schedule "Weekly backup"',
		ip: '192.168.1.24',
		timestamp: ago(1_020)
	},
	{
		id: 'activity-6',
		actor: 'system',
		event: 'server:power.stop',
		detail: 'Server stopped (exit code 0)',
		ip: '127.0.0.1',
		timestamp: ago(1_460)
	}
];

export const CONSOLE_TAIL: Omit<ConsoleLine, 'time'>[] = [
	{ level: 'INFO', text: '[Server thread/INFO]: Saving chunks for level "world"' },
	{ level: 'INFO', text: '[Server thread/INFO]: Player list updated (24 online)' },
	{ level: 'OUT', text: '> tps' },
	{ level: 'INFO', text: '[Server thread/INFO]: TPS from last 1m, 5m, 15m: 19.98, 20.00, 20.00' },
	{ level: 'INFO', text: '[Server thread/INFO]: Herobrine joined the game' },
	{ level: 'WARN', text: '[Server thread/WARN]: Chunk [412, -87] took 148 ms to load' },
	{ level: 'INFO', text: '[Server thread/INFO]: Scheduled backup "daily" completed' }
];

export const timeNow = () => new Date().toTimeString().slice(0, 8);
