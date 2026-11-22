import { actionFailure } from '#lib/server/action-error.ts';
import { adminFailure, requireAdmin } from '#lib/server/auth/admin.ts';
import {
	createAdSlot,
	deleteAdSlot,
	listAdSlots,
	setAdSlotEnabled,
	updateAdSlot
} from '#lib/server/billing/ads.ts';
import { formBoolean, formNumber, formString } from '#lib/server/forms.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

const readInput = (data: FormData) => ({
	label: formString(data, 'label'),
	script: String(data.get('script') ?? ''),
	width: formNumber(data, 'width', 300),
	height: formNumber(data, 'height', 100),
	enabled: formBoolean(data, 'enabled'),
	sortOrder: formNumber(data, 'sortOrder')
});

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	return { ads: await listAdSlots() };
};

export const actions: Actions = {
	createAd: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		try {
			const ad = await createAdSlot({ ...readInput(await request.formData()), enabled: true });
			logActivity({
				userId: locals.user?.id,
				action: 'ads.create',
				message: `Created ad slot "${ad.label}".`,
				metadata: { adId: ad.id }
			});
			return { created: 'Ad created.' };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	updateAd: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		const id = formString(data, 'id');

		try {
			await updateAdSlot(id, readInput(data));
			logActivity({
				userId: locals.user?.id,
				action: 'ads.update',
				message: 'Updated an ad slot.',
				metadata: { adId: id }
			});
			return { updated: 'Ad updated.' };
		} catch (cause) {
			return actionFailure(cause);
		}
	},

	toggleAd: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const data = await request.formData();
		const id = formString(data, 'id');
		const enabled = formBoolean(data, 'enabled');
		await setAdSlotEnabled(id, enabled);
		logActivity({
			userId: locals.user?.id,
			action: 'ads.toggle',
			message: `${enabled ? 'Enabled' : 'Disabled'} an ad slot.`,
			metadata: { adId: id, enabled }
		});
		return { updated: 'Ad updated.' };
	},

	deleteAd: async ({ locals, request }) => {
		const denied = adminFailure(locals);
		if (denied) return denied;

		const id = formString(await request.formData(), 'id');
		await deleteAdSlot(id);
		logActivity({
			userId: locals.user?.id,
			action: 'ads.delete',
			message: 'Deleted an ad slot.',
			metadata: { adId: id }
		});
		return { deleted: 'Ad deleted.' };
	}
};
