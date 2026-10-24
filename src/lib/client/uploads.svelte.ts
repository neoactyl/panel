export type UploadJob = {
	id: string;
	name: string;
	size: number;
	progress: number;
	status: 'uploading' | 'done';
};

export type UploadInput = {
	name: string;
	size: number;
};

type DoneHandler = (job: UploadJob) => void;

let jobs = $state<UploadJob[]>([]);
const timers = new Map<string, ReturnType<typeof setInterval>>();

const durationFor = (size: number) => Math.min(6000, Math.max(1800, 1200 + size / 80_000));

const start = (job: UploadJob, onDone?: DoneHandler) => {
	const duration = durationFor(job.size);
	const stepMs = 200;
	const step = (100 / duration) * stepMs;

	const timer = setInterval(() => {
		const current = jobs.find((entry) => entry.id === job.id);
		if (!current) {
			clearInterval(timer);
			timers.delete(job.id);
			return;
		}

		current.progress = Math.min(100, current.progress + step * (0.6 + Math.random() * 0.8));

		if (current.progress >= 100) {
			current.progress = 100;
			current.status = 'done';
			clearInterval(timer);
			timers.delete(job.id);
			onDone?.(current);
		}
	}, stepMs);

	timers.set(job.id, timer);
};

export const uploads = {
	get jobs() {
		return jobs;
	},
	get active() {
		return jobs.filter((job) => job.status === 'uploading').length;
	},
	add(files: UploadInput[], onDone?: DoneHandler) {
		for (const file of files) {
			const job: UploadJob = {
				id: crypto.randomUUID(),
				name: file.name,
				size: file.size,
				progress: 0,
				status: 'uploading'
			};
			jobs.push(job);
			start(job, onDone);
		}
	},
	dismiss(id: string) {
		const timer = timers.get(id);
		if (timer) {
			clearInterval(timer);
			timers.delete(id);
		}
		jobs = jobs.filter((job) => job.id !== id);
	},
	clearDone() {
		jobs = jobs.filter((job) => job.status === 'uploading');
	}
};
