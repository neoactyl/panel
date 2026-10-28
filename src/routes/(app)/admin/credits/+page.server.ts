import { error, fail } from '@sveltejs/kit';
import { actionFailure } from '#lib/server/action-error.ts';
import { adminFailure, requireAdmin } from '#lib/server/auth/admin.ts';
import {
	TopupError,
	createCreditTopupOption,
	deleteCreditTopupOption,
	getStripeCredentials,
	getTopupSettings,
	listTopupOptions,
	setCreditTopupOptionEnabled,
	updateCreditTopupOption
} from '#lib/server/billing/topup.ts';
import { formBoolean, formInt, formString, toInt } from '#lib/server/forms.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

const priceToCents = (data: FormData) => {
  const raw = formString(data, 'price');

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;

  const [whole = "0", fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
};

const optionInput = (data: FormData) => {
  const priceCents = priceToCents(data);

  if (priceCents === null) {
    throw new TopupError(
      "Enter the price as a number with up to two decimal places.",
      "INVALID_AMOUNT",
    );
  }

  const label = formString(data, 'label');
  if (!label) {
    throw new TopupError("Label is required.", "INVALID_OPTION");
  }

  const credits = toInt(data.get('credits'), 1);
  if (credits === null) {
    throw new TopupError(
      "Credits must be a positive number.",
      "INVALID_OPTION",
    );
  }

  return {
    label,
    description: formString(data, 'description'),
    badge: formString(data, 'badge'),
    credits,
    priceCents,
    enabled: formBoolean(data, 'enabled'),
    sortOrder: formInt(data, 'sortOrder') ?? 0,
  };
};

export const load: PageServerLoad = async ({ locals }) => {
  try {
    requireAdmin(locals);

    const options = await listTopupOptions(true).then((options) =>
      options.map((option) => ({
        ...option,
        priceCents: Number(option.priceCents),
        credits: Number(option.credits),
      })),
    );

    const settings = getTopupSettings();
    const credentials = getStripeCredentials();

    return {
      options,
      settings,
      status: {
        configured: credentials.configured,
        webhookConfigured: credentials.webhookConfigured,
        secretSource: credentials.secretSource,
        webhookSource: credentials.webhookSource,
      },
    };
  } catch (cause) {
    console.error("Error loading admin credits page:", cause);
    error(500, { message: "Failed to load admin credits page. Please try again." });
  }
};

export const actions: Actions = {
  create: async ({ locals, request }) => {
    const denied = adminFailure(locals);
    if (denied) return denied;

    try {
      const formData = await request.formData();
      const input = optionInput(formData);
      const created = await createCreditTopupOption(input);

      logActivity({
        userId: locals.user?.id,
        action: "admin.topup.create",
        message: `Created credit package "${created.label}"`,
        metadata: {
          optionId: created.id,
          credits: created.credits,
          priceCents: created.priceCents,
        },
      });

      return { success: "Credit package created." };
    } catch (cause) {
      console.error("Error creating credit package:", cause);
      return actionFailure(cause);
    }
  },

  update: async ({ locals, request }) => {
    const denied = adminFailure(locals);
    if (denied) return denied;

    const data = await request.formData();
    const id = formString(data, 'id');

    if (!id) return fail(400, { error: "Choose a credit package to update." });

    try {
      const updated = await updateCreditTopupOption(id, optionInput(data));

      logActivity({
        userId: locals.user?.id,
        action: "admin.topup.update",
        message: `Updated credit package "${updated.label}"`,
        metadata: {
          optionId: updated.id,
          credits: updated.credits,
          priceCents: updated.priceCents,
        },
      });

      return { success: "Credit package updated." };
    } catch (cause) {
      return actionFailure(cause);
    }
  },

  toggle: async ({ locals, request }) => {
    const denied = adminFailure(locals);
    if (denied) return denied;

    const data = await request.formData();
    const id = formString(data, 'id');
    const enabled = formString(data, 'enabled') === 'true';

    if (!id) return fail(400, { error: "Choose a credit package to update." });

    await setCreditTopupOptionEnabled(id, enabled);
    return {
      success: enabled ? "Credit package enabled." : "Credit package disabled.",
    };
  },

  delete: async ({ locals, request }) => {
    const denied = adminFailure(locals);
    if (denied) return denied;

    const data = await request.formData();
    const id = formString(data, 'id');

    if (!id) return fail(400, { error: "Choose a credit package to delete." });

    await deleteCreditTopupOption(id);

    logActivity({
      userId: locals.user?.id,
      action: "admin.topup.delete",
      message: "Deleted a credit package",
      metadata: { optionId: id },
    });

    return { success: "Credit package deleted." };
  },
};

