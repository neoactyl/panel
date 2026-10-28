import { error, redirect } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '#lib/server/auth/admin.ts';
import { toInt } from '#lib/server/forms.ts';
import { getAdapter } from '#lib/server/panel/adapter.ts';
import {
	getSoftwarePolicy,
	resetSoftwarePolicy,
	saveSoftwarePolicy
} from '#lib/server/catalog/software-policy.ts';
import { firstFormError } from '#lib/server/form-error.ts';
import { softwarePolicySchema, emptySchema } from '#lib/schemas.ts';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

const resolveSoftware = async (groupId: number, softwareId: number) => {
	const adapter = getAdapter();
	const [groups, eggs] = await Promise.all([
		adapter.listSoftwareGroups(),
		adapter.listSoftwares()
	]);

	return {
		adapter,
		group: groups.find((entry) => entry.id === groupId),
		egg: eggs.find((entry) => entry.id === softwareId && entry.groupId === groupId)
	};
};

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);

	const groupId = toInt(params.groupId);
	const softwareId = toInt(params.softwareId);
	if (groupId === null || softwareId === null) error(404, { message: 'Egg not found.' });

	const { adapter, group, egg } = await resolveSoftware(groupId, softwareId);
	if (!group || !egg) error(404, { message: 'Egg not found.' });

	let variables: Awaited<ReturnType<typeof adapter.getSoftwareVariables>> = [];
	let variablesError = '';

	try {
		variables = await adapter.getSoftwareVariables(groupId, softwareId);
	} catch (cause) {
		variablesError =
			cause instanceof Error ? cause.message : 'Unable to load egg variables from the panel.';
	}

	const policy = await getSoftwarePolicy(softwareId);

	const [policyForm, resetForm] = await Promise.all([
		superValidate(
			{
				...policy,
				editableVariables: policy.editableVariables,
				environment: Object.entries(policy.environment)
					.map(([key, value]) => `${key}=${value}`)
					.join('\n')
			},
			zod4(softwarePolicySchema),
			{ id: 'policy' }
		),
		superValidate(zod4(softwarePolicySchema), { id: 'reset' })
	]);

	return {
		group,
		egg,
		policy,
		policyForm,
		variables,
		variablesError,
		resetForm
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const fd = await request.formData();
		const form = await superValidate(fd, zod4(softwarePolicySchema), { id: 'policy' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		const groupId = toInt(params.groupId);
		const softwareId = toInt(params.softwareId);
		if (groupId === null || softwareId === null) {
			return message(form, 'Egg not found.', { status: 404 });
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

		await saveSoftwarePolicy(groupId, softwareId, {
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

		const softwareId = toInt(params.softwareId);
		if (softwareId === null) {
			return message(form, 'Egg not found.', { status: 404 });
		}

		await resetSoftwarePolicy(softwareId);
		redirect(303, '/admin/software');
	}
};

