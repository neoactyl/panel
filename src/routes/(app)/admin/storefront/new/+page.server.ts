import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '#lib/server/auth/admin.ts';
import {
	loadStorefrontCatalog,
	saveStorefrontItem,
	type StorefrontItemValues
} from '#lib/server/catalog/storefront-admin.ts';
import { firstFormError } from '#lib/server/form-error.ts';
import { storefrontItemSchema } from '#lib/schemas.ts';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';

const optionalId = (raw: string) => {
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, { message: 'Administrator access is required.' });

	const [catalog, itemForm] = await Promise.all([
		loadStorefrontCatalog(),
		superValidate(zod4(storefrontItemSchema), { id: 'item' })
	]);

	return { ...catalog, itemForm };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(storefrontItemSchema), { id: 'item' });

		if (!isAdmin(locals.user)) {
			return message(form, 'Administrator access is required.', { status: 403 });
		}

		if (!form.valid) {
			return message(form, firstFormError(form), { status: 400 });
		}

		const kind = form.data.kind;

		if (kind === 'server' && (form.data.cpu ?? 0) < 1) {
			return message(form, 'CPU, memory, and disk must be at least 1 for full servers.', {
				status: 400
			});
		}

		const total = (form.data.cpu ?? 0) + (form.data.memory ?? 0) + (form.data.disk ?? 0);
		if (kind === 'resource' && total <= 0) {
			return message(form, 'Resource upgrades need at least one non-zero resource.', {
				status: 400
			});
		}

		const softwareGroup = kind === 'server' ? optionalId(form.data.softwareGroup) : null;
		const software = kind === 'server' ? optionalId(form.data.software) : null;

		if (softwareGroup === undefined || software === undefined) {
			return message(form, 'Software selections must be valid catalog IDs.', { status: 400 });
		}

		const values: StorefrontItemValues = {
			name: form.data.name,
			description: form.data.description,
			icon: form.data.icon,
			kind,
			enabled: form.data.enabled,
			oncePerUser: form.data.oncePerUser,
			price: form.data.price,
			renewalPrice: kind === 'server' ? form.data.renewalPrice : 0,
			durationDays: form.data.durationDays,
			renewable: kind === 'server' ? form.data.renewable : false,
			stackable: form.data.stackable,
			removable: kind === 'server' ? form.data.removable : false,
			cpu: form.data.cpu ?? 0,
			memory: form.data.memory ?? 0,
			disk: form.data.disk ?? 0,
			node: kind === 'server' ? form.data.node : '',
			softwareGroup,
			software,
			successMode: form.data.successMode,
			successUrl: form.data.successUrl,
			successMessage: form.data.successMessage,
			sortOrder: form.data.sortOrder
		};

		await saveStorefrontItem(null, values, locals.user?.id);
		redirect(303, '/admin/storefront');
	}
};
