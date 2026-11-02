import type { Backup, ServerState } from '#lib/adapter/sdk.ts';

export const SERVER_STATE_STYLES: Record<ServerState, string> = {
	running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
	starting: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
	stopping: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
	installing: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
	suspended: 'border-red-500/30 bg-red-500/10 text-red-300',
	offline: 'border-white/10 bg-white/5 text-white/50',
	unknown: 'border-white/10 bg-white/5 text-white/50'
};

export const BACKUP_STATUS_STYLES: Record<Backup['status'], string> = {
	completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
	running: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
	failed: 'border-red-500/30 bg-red-500/10 text-red-300'
};
