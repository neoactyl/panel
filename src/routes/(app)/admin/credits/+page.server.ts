import { error, fail } from "@sveltejs/kit";
import { isAdmin } from "#lib/server/auth/admin.ts";
import {
  TopupError,
  createCreditTopupOption,
  deleteCreditTopupOption,
  getStripeCredentials,
  getTopupSettings,
  listTopupOptions,
  setCreditTopupOptionEnabled,
  updateCreditTopupOption,
} from "#lib/server/billing/topup.ts";
import { logActivity } from "#lib/server/system/logs.ts";
import type { Actions, PageServerLoad } from "./$types";

const guard = (user: Parameters<typeof isAdmin>[0]) => {
  if (!isAdmin(user))
    error(403, { message: "Administrator access is required." });
};

const integer = (data: FormData, key: string, fallback = 0) => {
  const parsed = Number(String(data.get(key) ?? "").trim());
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const priceToCents = (data: FormData) => {
  const raw = String(data.get("price") ?? "").trim();

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

  // Validate required fields
  const label = String(data.get("label") ?? "").trim();
  if (!label) {
    throw new TopupError("Label is required.", "INVALID_OPTION");
  }

  const credits = integer(data, "credits");
  if (credits <= 0) {
    throw new TopupError(
      "Credits must be a positive number.",
      "INVALID_OPTION",
    );
  }

  return {
    label,
    description: String(data.get("description") ?? "").trim(),
    badge: String(data.get("badge") ?? "").trim(),
    credits,
    priceCents,
    enabled: data.get("enabled") === "on",
    sortOrder: integer(data, "sortOrder"),
  };
};

const message = (cause: unknown) =>
  cause instanceof TopupError
    ? cause.message
    : "Something went wrong. Please try again.";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    guard(locals.user);

    console.log("Loading admin credits page for user:", locals.user?.id);

    const options = await listTopupOptions(true).then((options) =>
      options.map((option) => ({
        ...option,
        priceCents: Number(option.priceCents),
        credits: Number(option.credits),
      })),
    );
    console.log("Retrieved options:", options.length);

    const settings = getTopupSettings();
    console.log("Retrieved settings:", settings);

    const credentials = getStripeCredentials();
    console.log("Retrieved credentials:", {
      configured: credentials.configured,
      webhookConfigured: credentials.webhookConfigured,
      secretSource: credentials.secretSource,
      webhookSource: credentials.webhookSource,
    });

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
  } catch (error) {
    console.error("Error loading admin credits page:", error);
    error(500, {
      message: "Failed to load admin credits page. Please try again.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const actions: Actions = {
  create: async ({ locals, request }) => {
    guard(locals.user);

    try {
      const formData = await request.formData();
      console.log("Form data received:", Object.fromEntries(formData));

      const input = optionInput(formData);
      console.log("Processed input:", input);

      const created = await createCreditTopupOption(input);
      console.log("Created option:", created);

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
      return fail(400, { error: message(cause) });
    }
  },

  update: async ({ locals, request }) => {
    guard(locals.user);
    const data = await request.formData();
    const id = String(data.get("id") ?? "").trim();

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
      return fail(400, { error: message(cause) });
    }
  },

  toggle: async ({ locals, request }) => {
    guard(locals.user);
    const data = await request.formData();
    const id = String(data.get("id") ?? "").trim();
    const enabled = String(data.get("enabled") ?? "") === "true";

    if (!id) return fail(400, { error: "Choose a credit package to update." });

    await setCreditTopupOptionEnabled(id, enabled);
    return {
      success: enabled ? "Credit package enabled." : "Credit package disabled.",
    };
  },

  delete: async ({ locals, request }) => {
    guard(locals.user);
    const data = await request.formData();
    const id = String(data.get("id") ?? "").trim();

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
