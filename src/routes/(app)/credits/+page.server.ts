import { fail, redirect } from "@sveltejs/kit";
import { getCreditBalance } from "#lib/server/billing/credits.ts";
import {
  TopupError,
  createCreditCheckoutSession,
  fulfillTopupSession,
  getTopupSettings,
  listTopupHistory,
  listTopupOptions,
  resolveTopupQuote,
} from "#lib/server/billing/topup.ts";
import type { Actions, PageServerLoad } from "./$types";

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
  };
};

export const actions: Actions = {
  checkout: async ({ locals, request, url }) => {
    if (!locals.user) return fail(401, { error: "Sign in to buy credits." });

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
      console.log(error);
      return fail(500, {
        error:
          error instanceof TopupError
            ? error.message
            : "An unexpected error occurred during checkout. Please try again.",
      });
    }

    // Redirect to Stripe checkout
    // return { success: true, target };
    redirect(303, target, { external: true });
  },
};
