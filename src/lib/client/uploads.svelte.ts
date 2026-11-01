export type UploadStatus = 'uploading' | 'done' | 'error' | 'canceled';

export type UploadItem = {
	id: string;
	serverId: string;
	serverName: string;
	directory: string;
	name: string;
	size: number;
	loaded: number;
	status: UploadStatus;
	error: string;
	startedAt: number;
};

type CompleteListener = (item: UploadItem) => void;

let items = $state<UploadItem[]>([]);
let sequence = 0;

const requests = new Map<string, XMLHttpRequest>();
const listeners = new Map<string, Set<CompleteListener>>();

const find = (id: string) => items.find((item) => item.id === id);

const update = (id: string, patch: Partial<UploadItem>) => {
	const item = find(id);
	if (item) Object.assign(item, patch);
};

const snapshot = (item: UploadItem): UploadItem => ({ ...item });

const emitComplete = (item: UploadItem) => {
	for (const listener of listeners.get(item.serverId) ?? []) {
		try {
			listener(snapshot(item));
		} catch (cause) {
			console.error('Upload completion listener failed', cause);
		}
	}
};

const start = (id: string, file: File) => {
	const item = find(id);
	if (!item) return;

	const xhr = new XMLHttpRequest();
	const params = new URLSearchParams({
		directory: item.directory,
		filename: item.name
	});

	requests.set(id, xhr);

	xhr.open(
		'POST',
		`/api/servers/${encodeURIComponent(item.serverId)}/files/upload?${params.toString()}`
	);
	xhr.responseType = 'json';
	xhr.setRequestHeader('Content-Type', 'application/octet-stream');

	xhr.upload.onprogress = (event) => {
		if (!event.lengthComputable) return;
		update(id, { loaded: Math.min(event.loaded, item.size || event.total) });
	};

	xhr.onload = () => {
		requests.delete(id);

		const body = (xhr.response ?? null) as { message?: string; uploaded?: string } | null;

		if (xhr.status >= 200 && xhr.status < 300) {
			const finished = find(id);
			update(id, { loaded: finished?.size ?? finished?.loaded ?? 0, status: 'done', error: '' });

			const latest = find(id);
			if (latest) emitComplete(latest);
			return;
		}

		update(id, {
			status: 'error',
			error: body?.message ?? `Upload failed (${xhr.status}).`
		});
	};

	xhr.onerror = () => {
		requests.delete(id);
		update(id, { status: 'error', error: 'The upload connection was interrupted.' });
	};

	xhr.onabort = () => {
		requests.delete(id);
		update(id, { status: 'canceled', error: 'Upload canceled.' });
	};

	xhr.send(file);
};

export const uploads = {
	get items(): UploadItem[] {
		return items;
	},

	get activeCount(): number {
		return items.filter((item) => item.status === 'uploading').length;
	},

	get finishedCount(): number {
		return items.filter((item) => item.status !== 'uploading').length;
	},

	enqueue(input: { serverId: string; serverName: string; directory: string; files: File[] }) {
		const ids: string[] = [];

		for (const file of input.files) {
			const item: UploadItem = {
				id: `upload-${Date.now()}-${sequence++}`,
				serverId: input.serverId,
				serverName: input.serverName,
				directory: input.directory,
				name: file.name,
				size: file.size,
				loaded: 0,
				status: 'uploading',
				error: '',
				startedAt: Date.now()
			};

			items.push(item);
			ids.push(item.id);
			start(item.id, file);
		}

		return ids;
	},

	cancel(id: string) {
		requests.get(id)?.abort();
	},

	dismiss(id: string) {
		const request = requests.get(id);
		if (request) {
			requests.delete(id);
			request.abort();
		}

		items = items.filter((item) => item.id !== id);
	},

	dismissFinished() {
		items = items.filter((item) => item.status === 'uploading');
	},

	dismissAll() {
		for (const request of requests.values()) request.abort();
		requests.clear();
		items = [];
	},

	onComplete(serverId: string, listener: CompleteListener) {
		const set = listeners.get(serverId) ?? new Set<CompleteListener>();
		set.add(listener);
		listeners.set(serverId, set);

		return () => {
			set.delete(listener);
			if (set.size === 0) listeners.delete(serverId);
		};
	}
};
