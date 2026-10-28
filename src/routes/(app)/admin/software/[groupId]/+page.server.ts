import { error, redirect } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '#lib/server/auth/admin.ts';
import { toInt } from '#lib/server/forms.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import { getGroupPolicy, resetGroupPolicy, saveGroupPolicy } from '#lib/server/catalog/software-policy.ts';
import { firstFormError } from '#lib/server/form-error.ts';
import { softwarePolicySchema, emptySchema } from '#lib/schemas.ts';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);

	const groupId = toInt(params.groupId);
	if (groupId === null) error(404, { message: 'Nest not found.' });

	const groups = await getAdapter().listSoftwareGroups();
	const group = groups.find((entry) => entry.id === groupId);
	if (!group) error(404, { message: 'Nest not found.' });

	const policy = await getGroupPolicy(groupId);

	const [policyForm, resetForm] = await Promise.all([
		superValidate(
			{
				editableVariables: policy.editableVariables,
				environment: Object.entries(policy.environment)
					.map(([key, value]) => `${key}=${value}`)
					.join('\n')
			},
			zod4(softwarePolicySchema),
			{ id: 'policy' }
		),
		superValidate(zod4(emptySchema), { id: 'reset' })
	]);

	return { group, policy, policyForm, resetForm };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const fd = await request.formData();
		const form = await superValidate(fd, zod4(softwarePolicySchema), { id: 'policy' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		const groupId = toInt(params.groupId);
		if (groupId === null) {
			return message(form, 'Nest not found.', { status: 404 });
		}

		if (!form.valid) {
			return message(form, firstFormError(form), { status: 400 });
		}

		const environment: Record<string, string> = {};

		for (const line of form.data.environment.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const index = trimmed.indexOf('=');
			if (index <= 0) {
				return message(form, `Invalid environment entry: ${trimmed}`, { status: 400 });
			}

			const key = trimmed.slice(0, index).trim();
			const value = trimmed.slice(index + 1).trim();

			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
				return message(form, `Invalid environment variable name: ${key}`, { status: 400 });
			}

			environment[key] = value;
		}

		await saveGroupPolicy(groupId, {
			visible: form.data.visible,
			minCpu: form.data.minCpu,
			maxCpu: form.data.maxCpu,
			minMemory: form.data.minMemory,
			maxMemory: form.data.maxMemory,
			minDisk: form.data.minDisk,
			maxDisk: form.data.maxDisk,
			editableVariables: form.data.editableVariables,
			dockerImage: form.data.dockerImage,
			startupCommand: form.data.startupCommand,
			environment
		});

		redirect(303, '/admin/software');
	},

	reset: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(emptySchema), { id: 'reset' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		const groupId = toInt(params.groupId);
		if (groupId === null) {
			return message(form, 'Nest not found.', { status: 404 });
		}

		await resetGroupPolicy(groupId);
		redirect(303, '/admin/software');
	}
};

