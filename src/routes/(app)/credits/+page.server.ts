import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { getCreditBalance } from "#lib/server/billing/credits.ts";
import {
  EarnError,
  giftCredits,
  redeemVoucher,
} from "#lib/server/billing/earn.ts";
import {
  TopupError,
  createCreditCheckoutSession,
  fulfillTopupSession,
  getTopupSettings,
  listTopupHistory,
  listTopupOptions,
  resolveTopupQuote,
} from "#lib/server/billing/topup.ts";
import { user } from "#lib/server/db/auth.schema.ts";
import { db } from "#lib/server/db/index.ts";
import { getBool, getNumber } from "#lib/server/config/settings.ts";
import type { Actions, PageServerLoad } from "./$types";

const earnMessage = (cause: unknown) =>
  cause instanceof EarnError
    ? cause.message
    : "Something went wrong. Please try again.";

export const load: PageServerLoad = async ({ locals, url }) => {
  const userId = locals.user!.id;
  const checkout = url.searchParams.get("checkout");
  const sessionId = url.searchParams.get("session_id");
  const settings = getTopupSettings();

  let notice: string | null = null;
  let checkoutError: string | null = null;

  if (checkout === "success" && sessionId) {
    try {
      const result = await fulfillTopupSession(sessionId, userId);

      notice = result.applied
        ? `${result.credits.toLocaleString()} ${settings.creditName} were added to your balance.`
        : result.pending
          ? "Your payment is still processing. Credits will appear as soon as Stripe confirms it."
          : "Payment received. Your balance is already up to date.";
    } catch (cause) {
      console.error("Unable to verify a Stripe top-up on return.", cause);
      checkoutError =
        cause instanceof TopupError
          ? cause.message
          : "We could not verify your payment yet. Credits are added automatically once Stripe confirms it.";
    }
  }

  const [balance, options, history] = await Promise.all([
    getCreditBalance(userId),
    listTopupOptions(),
    listTopupHistory(userId),
  ]);

  return {
    balance,
    options,
    history,
    settings,
    notice:
      notice ??
      (checkout === "cancelled"
        ? "Checkout was cancelled. No payment was taken."
        : null),
    checkoutError,
    vouchersEnabled:
      getBool("vouchers.enabled") && getBool("credits.allowEarn"),
    giftsEnabled: getBool("credits.giftEnabled"),
    giftMin: Math.max(1, getNumber("credits.giftMin")),
  };
};

export const actions: Actions = {
  checkout: async ({ locals, request, url }) => {
    if (!locals.user) {
      return fail(401, {
        action: "checkout",
        error: "Sign in to buy credits.",
      });
    }

    const data = await request.formData();
    const optionId = String(data.get("optionId") ?? "").trim();
    const rawCredits = String(data.get("credits") ?? "").trim();
    let target: string;

    try {
      const quote = await resolveTopupQuote({
        optionId: optionId || null,
        credits: rawCredits ? Number(rawCredits) : null,
      });

      const session = await createCreditCheckoutSession({
        userId: locals.user.id,
        email: locals.user.email,
        quote,
        origin: url.origin,
      });

      target = session.url;
    } catch (error) {
      console.error(error);
      return fail(500, {
        action: "checkout",
        error:
          error instanceof TopupError
            ? error.message
            : "An unexpected error occurred during checkout. Please try again.",
      });
    }

    // Redirect to Stripe checkout (the enhance callback handles the external URL)
    redirect(303, target);
  },

  gift: async ({ locals, request }) => {
    if (!locals.user) {
      return fail(401, { action: "gift", error: "Sign in to send credits." });
    }

    const data = await request.formData();
    const email = String(data.get("recipientEmail") ?? "")
      .trim()
      .toLowerCase();
    const amount = Number(data.get("amount") ?? 0);

    if (!email) {
      return fail(400, {
        action: "gift",
        error: "Enter the email of the person you want to gift.",
      });
    }

    const recipient = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.email, email))
      .get();

    if (!recipient) {
      return fail(404, {
        action: "gift",
        error: "No account uses that email address.",
      });
    }

    try {
      const result = await giftCredits(locals.user.id, recipient.id, amount);
      return {
        action: "gift",
        success: `Sent ${result.amount.toLocaleString()} credits to ${recipient.name}.`,
      };
    } catch (cause) {
      return fail(400, { action: "gift", error: earnMessage(cause) });
    }
  },

  redeem: async ({ locals, request }) => {
    if (!locals.user) {
      return fail(401, {
        action: "redeem",
        error: "Sign in to redeem a voucher.",
      });
    }

    const data = await request.formData();
    const code = String(data.get("voucherCode") ?? "").trim();

    if (!code) {
      return fail(400, {
        action: "redeem",
        error: "Enter a voucher code to redeem.",
      });
    }

    try {
      const result = await redeemVoucher(locals.user.id, code);
      return {
        action: "redeem",
        success:
          result.kind === "resource"
            ? `Added ${result.cpu}% CPU, ${result.memory} MB memory and ${result.disk} MB disk.`
            : `Added ${result.credits} credits to your balance.`,
      };
    } catch (cause) {
      return fail(400, { action: "redeem", error: earnMessage(cause) });
    }
  },
};
