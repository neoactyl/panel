import { AdapterError } from './sdk';
import type {
	Activity,
	Allocation,
	Backup,
	ConsoleLine,
	CreateBackup,
	CreateDatabase,
	CreateSchedule,
	CreateSubuser,
	Database,
	FileEntry,
	FileSystem,
	Node,
	PanelActionRequest,
	PanelActionResult,
	PanelPrompt,
	PanelScope,
	ResourceUsage,
	Schedule,
	Server,
	Software,
	SoftwareGroup,
	SoftwareVariable,
	Startup,
	Subuser,
	UpdateSchedule,
	UpdateServer,
	UpdateStartup,
	UpdateSubuser,
	User
} from './sdk';

const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
	const response = await fetch('/api/adapter', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ method, args })
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as
			| { message?: string; code?: string }
			| null;

		throw new AdapterError(
			body?.message ?? `Adapter request failed (${response.status})`,
			'UNKNOWN',
			response.status
		);
	}

	return (await response.json()) as T;
};

export const adapter = {
	connect: () => call<boolean>('connect'),
	getCurrentUser: () => call<User>('getCurrentUser'),
	getServers: () => call<Server[]>('getServers'),
	getServer: (id: string) => call<Server>('getServer', id),
	getNodes: () => call<Node[]>('getNodes'),
	runPanelAction: (request: PanelActionRequest) =>
		call<PanelActionResult>('runPanelAction', request),
	updateServer: (id: string, input: UpdateServer) => call<Server>('updateServer', id, input),
	deleteServer: (id: string) => call<void>('deleteServer', id),
	suspendServer: (id: string) => call<void>('suspendServer', id),
	unsuspendServer: (id: string) => call<void>('unsuspendServer', id),
	listSoftwares: () => call<Software[]>('listSoftwares'),
	listSoftwareGroups: () => call<SoftwareGroup[]>('listSoftwareGroups'),
	getSoftwareVariables: (softwareGroup: number, software: number) =>
		call<SoftwareVariable[]>('getSoftwareVariables', softwareGroup, software),

	startServer: (id: string) => call<void>('startServer', id),
	stopServer: (id: string) => call<void>('stopServer', id),
	restartServer: (id: string) => call<void>('restartServer', id),
	killServer: (id: string) => call<void>('killServer', id),
	reinstallServer: (id: string) => call<void>('reinstallServer', id),
	sendCommand: (id: string, command: string) => call<void>('sendCommand', id, command),
	getConsole: (id: string) => call<ConsoleLine[]>('getConsole', id),
	getResources: (id: string) => call<ResourceUsage>('getResources', id),
	getPanelPrompts: (
		scope: PanelScope,
		serverId?: string,
		context?: { output?: string }
	) => call<PanelPrompt[]>('getPanelPrompts', scope, serverId, context),

	listAllocations: (id: string) => call<Allocation[]>('listAllocations', id),
	createAllocation: (id: string) => call<Allocation>('createAllocation', id),
	deleteAllocation: (id: string, allocationId: string) =>
		call<void>('deleteAllocation', id, allocationId),
	setPrimaryAllocation: (id: string, allocationId: string) =>
		call<Allocation[]>('setPrimaryAllocation', id, allocationId),

	listBackups: (id: string) => call<Backup[]>('listBackups', id),
	createBackup: (id: string, input?: CreateBackup) =>
		call<Backup>('createBackup', id, input),
	deleteBackup: (id: string, backupId: string) => call<void>('deleteBackup', id, backupId),
	restoreBackup: (id: string, backupId: string) => call<void>('restoreBackup', id, backupId),


	listDatabases: (id: string) => call<Database[]>('listDatabases', id),
	createDatabase: (id: string, input: CreateDatabase) =>
		call<Database>('createDatabase', id, input),
	deleteDatabase: (id: string, databaseId: string) =>
		call<void>('deleteDatabase', id, databaseId),

	listSchedules: (id: string) => call<Schedule[]>('listSchedules', id),
	createSchedule: (id: string, input: CreateSchedule) =>
		call<Schedule>('createSchedule', id, input),
	updateSchedule: (id: string, scheduleId: string, input: UpdateSchedule) =>
		call<Schedule>('updateSchedule', id, scheduleId, input),
	deleteSchedule: (id: string, scheduleId: string) =>
		call<void>('deleteSchedule', id, scheduleId),

	getStartup: (id: string) => call<Startup>('getStartup', id),
	updateStartup: (id: string, input: UpdateStartup) =>
		call<Startup>('updateStartup', id, input),

	listSubusers: (id: string) => call<Subuser[]>('listSubusers', id),
	createSubuser: (id: string, input: CreateSubuser) =>
		call<Subuser>('createSubuser', id, input),
	updateSubuser: (id: string, subuserId: string, input: UpdateSubuser) =>
		call<Subuser>('updateSubuser', id, subuserId, input),
	deleteSubuser: (id: string, subuserId: string) =>
		call<void>('deleteSubuser', id, subuserId),

	listActivities: (id: string) => call<Activity[]>('listActivities', id),

	getFileSystem: (id: string) => call<FileSystem>('getFileSystem', id),
	listFiles: (id: string, directory: string) => call<FileEntry[]>('listFiles', id, directory),
	readFile: (id: string, path: string) => call<string>('readFile', id, path),
	writeFile: (id: string, path: string, content: string) =>
		call<void>('writeFile', id, path, content),
	createFile: (id: string, directory: string, name: string) =>
		call<FileEntry>('createFile', id, directory, name),
	createDirectory: (id: string, directory: string, name: string) =>
		call<FileEntry>('createDirectory', id, directory, name),
	deleteFiles: (id: string, paths: string[]) => call<void>('deleteFiles', id, paths),
	renameFile: (id: string, from: string, to: string) =>
		call<void>('renameFile', id, from, to),
	copyFile: (id: string, from: string, to: string) => call<void>('copyFile', id, from, to),
	compressFiles: (id: string, paths: string[], name: string) =>
		call<FileEntry>('compressFiles', id, paths, name),
	decompressFile: (id: string, path: string) => call<void>('decompressFile', id, path),
	uploadFiles: (
		id: string,
		directory: string,
		files: Array<{ name: string; size: number; content?: string }>
	) => call<FileEntry[]>('uploadFiles', id, directory, files)
};
