import { fail } from '@sveltejs/kit';
import { AdapterError, FILES_ROOT } from '#lib/adapter/sdk.ts';
import { formString } from '#lib/server/forms.ts';
import { getUserAdapter } from '#lib/server/panel/adapter.ts';
import type { Actions, PageServerLoad } from './$types';

const resolveDirectory = (value: string) => {
	const segments = value
		.replace(/\\/g, '/')
		.split('/')
		.filter(Boolean);

	if (segments.some((segment) => segment === '.' || segment === '..')) return null;

	const absolute = `/${segments.join('/')}`;

	if (absolute !== FILES_ROOT && !absolute.startsWith(`${FILES_ROOT}/`)) {
		return null;
	}

	return absolute;
};

const fileName = (value: string) => {
	const name = value.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
	return name && name !== '.' && name !== '..' ? name : null;
};

const folderName = (value: string) => {
	const name = value.trim();
	return name && name !== '.' && name !== '..' && !/[\\/]/.test(name) ? name : null;
};

const failure = (cause: unknown, fallback: string) =>
	fail(400, { error: cause instanceof Error ? cause.message : fallback });

export const load: PageServerLoad = async ({ params, locals }) => ({
	fileSystem: await getUserAdapter(locals.panelUserId).getFileSystem(params.id)
});

export const actions: Actions = {
	upload: async ({ locals, params, request }) => {
		const adapter = getUserAdapter(locals.panelUserId);

		if (!adapter.capabilities.files.upload) {
			return fail(403, { error: 'This panel does not support file uploads.' });
		}

		const data = await request.formData();
		const directory = resolveDirectory(formString(data, 'directory') || FILES_ROOT);

		if (!directory) {
			return fail(400, { error: 'The upload directory is invalid.' });
		}

		const uploads = data.getAll('files').filter((entry): entry is File => entry instanceof File);

		if (uploads.length === 0) {
			return fail(400, { error: 'Select at least one file to upload.' });
		}

		const files = [];

		for (const upload of uploads) {
			const name = fileName(upload.name);

			if (!name) {
				return fail(400, { error: 'One or more file names are invalid.' });
			}

			files.push({
				name,
				size: upload.size,
				content: new Uint8Array(await upload.arrayBuffer())
			});
		}

		try {
			const entries = await adapter.uploadFiles(params.id, directory, files);
			return { uploaded: entries.map((entry) => entry.name), directory };
		} catch (cause) {
			return failure(cause, 'The files could not be uploaded.');
		}
	},

	createDirectory: async ({ locals, params, request }) => {
		const adapter = getUserAdapter(locals.panelUserId);

		if (!adapter.capabilities.files.write) {
			return fail(403, { error: 'This panel does not support file management.' });
		}

		const data = await request.formData();
		const directory = resolveDirectory(formString(data, 'directory') || FILES_ROOT);
		const name = folderName(formString(data, 'name'));

		if (!directory) {
			return fail(400, { error: 'The target directory is invalid.' });
		}

		if (!name) {
			return fail(400, { error: 'Enter a valid folder name.' });
		}

		try {
			const entry = await adapter.createDirectory(params.id, directory, name);
			return { created: entry.name, directory };
		} catch (cause) {
			return failure(cause, 'The folder could not be created.');
		}
	}
};
