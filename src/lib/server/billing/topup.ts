import { and, asc, desc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { addCredits } from "#lib/server/billing/credits.ts";
import { serverEnv } from "#lib/server/config/env.ts";
import { getBool, getNumber, getSetting } from "#lib/server/config/settings.ts";
import { db } from "#lib/server/db/index.ts";
import { creditTopupOption, creditTransaction } from "#lib/server/db/ops.ts";
import { logActivity } from "#lib/server/system/logs.ts";
import { notifyUser } from "#lib/server/system/notifications.ts";

const MIN_CHECKOUT_CENTS = 50;
const CURRENCY_CODE = /^[a-z]{3}$/;

export class TopupError extends Error {
  code:
    | "DISABLED"
    | "NOT_CONFIGURED"
    | "INVALID_AMOUNT"
    | "INVALID_OPTION"
    | "FORBIDDEN"
    | "CHECKOUT_FAILED";

  constructor(message: string, code: TopupError["code"]) {
    super(message);
    this.name = "TopupError";
    this.code = code;
  }
}

export type CreditTopupOption = typeof creditTopupOption.$inferSelect;

export type TopupQuote = {
  optionId: string | null;
  credits: number;
  amountCents: number;
  label: string;
  description: string;
};

export type TopupSettings = {
  enabled: boolean;
  purchasesAllowed: boolean;
  currency: string;
  creditName: string;
  pricePerCredit: number;
  customEnabled: boolean;
  minCredits: number;
  maxCredits: number;
  allowPromoCodes: boolean;
  stripeConfigured: boolean;
  webhookConfigured: boolean;
};

export type TopupHistoryEntry = {
  id: string;
  credits: number;
  amountCents: number | null;
  currency: string;
  reference: string;
  createdAt: Date | null;
};

export type TopupResult = {
  applied: boolean;
  credits: number;
  balance: number | null;
  pending: boolean;
};

export const getStripeCredentials = () => {
  const secretSetting = getSetting("stripe.secretKey").trim();
  const webhookSetting = getSetting("stripe.webhookSecret").trim();
  const secretKey = secretSetting || serverEnv.STRIPE_SECRET_KEY || "";
  const webhookSecret = webhookSetting || serverEnv.STRIPE_WEBHOOK_SECRET || "";

  return {
    secretKey,
    webhookSecret,
    configured: Boolean(secretKey),
    webhookConfigured: Boolean(webhookSecret),
    secretSource: secretSetting
      ? ("settings" as const)
      : ("environment" as const),
    webhookSource: webhookSetting
      ? ("settings" as const)
      : ("environment" as const),
  };
};

let stripeCache: { key: string; client: Stripe } | null = null;

export const getStripeClient = () => {
  const { secretKey } = getStripeCredentials();
  if (!secretKey) return null;

  if (!stripeCache || stripeCache.key !== secretKey) {
    stripeCache = {
      key: secretKey,
      client: new Stripe(secretKey, { apiVersion: "2026-09-30.endive" }),
    };
  }

  return stripeCache.client;
};

const cleanCurrency = () => {
  const value = getSetting("credits.topupCurrency").trim().toLowerCase();
  return CURRENCY_CODE.test(value) ? value : "usd";
};

export const formatTopupPrice = (cents: number, currency = cleanCurrency()) => {
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
};

export const getTopupSettings = (): TopupSettings => {
  const purchasesAllowed =
    getBool("credits.allowPurchase") && getBool("credits.enabled");
  const minCredits = Math.max(
    1,
    Math.floor(getNumber("credits.topupMinCredits")),
  );
  const maxCredits = Math.max(
    minCredits,
    Math.floor(getNumber("credits.topupMaxCredits")),
  );
  const credentials = getStripeCredentials();

  return {
    enabled: purchasesAllowed && credentials.configured,
    purchasesAllowed,
    currency: cleanCurrency(),
    creditName: getSetting("credits.currency") || "Credits",
    pricePerCredit: Math.max(
      1,
      Math.floor(getNumber("credits.topupPricePerCredit")),
    ),
    customEnabled: getBool("credits.topupCustomEnabled"),
    minCredits,
    maxCredits,
    allowPromoCodes: getBool("credits.topupAllowPromoCodes"),
    stripeConfigured: credentials.configured,
    webhookConfigured: credentials.webhookConfigured,
  };
};

export const listTopupOptions = async (includeDisabled = false) => {
  const options = includeDisabled
    ? await db
        .select()
        .from(creditTopupOption)
        .orderBy(
          asc(creditTopupOption.sortOrder),
          asc(creditTopupOption.createdAt),
        )
    : await db
        .select()
        .from(creditTopupOption)
        .where(eq(creditTopupOption.enabled, true))
        .orderBy(
          asc(creditTopupOption.sortOrder),
          asc(creditTopupOption.createdAt),
        );

  // Convert numeric fields to strings when they can't be safely represented as JavaScript numbers
  return options.map((option) => ({
    ...option,
    priceCents: safeNumberToString(option.priceCents),
    credits: safeNumberToString(option.credits),
  }));
};

// Helper function to convert numbers to strings when they can't be safely represented as JavaScript numbers
function safeNumberToString(value: bigint | number): string {
  try {
    // Try to convert to a safe JavaScript number first
    const num = Number(value);
    if (Number.isSafeInteger(num)) {
      return num.toString();
    }
  } catch (e) {
    // Fallback to string representation if conversion fails
  }
  return value.toString();
}

export const getTopupOption = async (optionId: string) =>
  db
    .select()
    .from(creditTopupOption)
    .where(eq(creditTopupOption.id, optionId))
    .get();

export const resolveTopupQuote = async ({
  optionId,
  credits,
}: {
  optionId?: string | null;
  credits?: number | null;
}): Promise<TopupQuote> => {
  const settings = getTopupSettings();

  if (!settings.purchasesAllowed) {
    throw new TopupError(
      "Credit purchases are currently disabled.",
      "DISABLED",
    );
  }

  if (!settings.stripeConfigured) {
    throw new TopupError(
      "Stripe has not been configured by an administrator yet.",
      "NOT_CONFIGURED",
    );
  }

  if (optionId) {
    const option = await db
      .select()
      .from(creditTopupOption)
      .where(
        and(
          eq(creditTopupOption.id, optionId),
          eq(creditTopupOption.enabled, true),
        ),
      )
      .get();

    if (!option)
      throw new TopupError(
        "That credit package is no longer available.",
        "INVALID_OPTION",
      );

    if (!Number.isInteger(option.credits) || option.credits <= 0) {
      throw new TopupError(
        "That credit package has an invalid amount.",
        "INVALID_OPTION",
      );
    }

    if (
      !Number.isInteger(option.priceCents) ||
      option.priceCents < MIN_CHECKOUT_CENTS
    ) {
      throw new TopupError(
        `The minimum checkout total is ${formatTopupPrice(MIN_CHECKOUT_CENTS, settings.currency)}.`,
        "INVALID_OPTION",
      );
    }

    return {
      optionId: option.id,
      credits: option.credits,
      amountCents: option.priceCents,
      label: option.label,
      description: option.description,
    };
  }

  if (!settings.customEnabled) {
    throw new TopupError(
      "Choose one of the available credit packages.",
      "INVALID_AMOUNT",
    );
  }

  if (!Number.isInteger(credits) || (credits ?? 0) <= 0) {
    throw new TopupError(
      "Enter a whole number of credits to buy.",
      "INVALID_AMOUNT",
    );
  }

  const amount = credits as number;

  if (amount < settings.minCredits || amount > settings.maxCredits) {
    throw new TopupError(
      `Choose between ${settings.minCredits.toLocaleString()} and ${settings.maxCredits.toLocaleString()} ${settings.creditName}.`,
      "INVALID_AMOUNT",
    );
  }

  const amountCents = amount * settings.pricePerCredit;

  if (amountCents < MIN_CHECKOUT_CENTS) {
    throw new TopupError(
      `The minimum checkout total is ${formatTopupPrice(MIN_CHECKOUT_CENTS, settings.currency)}.`,
      "INVALID_AMOUNT",
    );
  }

  return {
    optionId: null,
    credits: amount,
    amountCents,
    label: `${amount.toLocaleString()} ${settings.creditName}`,
    description: `Add ${amount.toLocaleString()} ${settings.creditName} to your balance.`,
  };
};

export const createCreditCheckoutSession = async ({
  userId,
  email,
  quote,
  origin,
}: {
  userId: string;
  email: string;
  quote: TopupQuote;
  origin: string;
}) => {
  const settings = getTopupSettings();
  const stripe = getStripeClient();

  if (!stripe) {
    throw new TopupError(
      "Stripe has not been configured by an administrator yet.",
      "NOT_CONFIGURED",
    );
  }

  const metadata = {
    kind: "credit_topup",
    userId,
    credits: String(quote.credits),
    amountCents: String(quote.amountCents),
    optionId: quote.optionId ?? "",
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: userId,
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: settings.currency,
            unit_amount: quote.amountCents,
            product_data: {
              name: quote.label,
              description: quote.description || undefined,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: settings.allowPromoCodes ? true : undefined,
      success_url: `${origin}/credits?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credits?checkout=cancelled`,
    });

    if (!session.url) {
      throw new TopupError(
        "Stripe did not return a checkout URL.",
        "CHECKOUT_FAILED",
      );
    }

    return { id: session.id, url: session.url };
  } catch (cause) {
    if (cause instanceof TopupError) throw cause;

    console.error("Unable to create a Stripe checkout session.", cause);
    throw new TopupError(
      cause instanceof Error
        ? `Stripe could not start the checkout: ${cause.message}`
        : "Stripe could not start the checkout. Please try again.",
      "CHECKOUT_FAILED",
    );
  }
};

export const applyPaidCheckoutSession = async (
  session: Stripe.Checkout.Session,
  expectedUserId?: string,
): Promise<TopupResult> => {
  const metadata = session.metadata ?? {};

  if (session.mode !== "payment" || metadata.kind !== "credit_topup") {
    return { applied: false, credits: 0, balance: null, pending: false };
  }

  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    return { applied: false, credits: 0, balance: null, pending: true };
  }

  const userId = (metadata.userId ?? "").trim();
  const credits = Number(metadata.credits);

  if (!userId || !Number.isInteger(credits) || credits <= 0) {
    console.error("Ignoring a Stripe top-up session with invalid metadata.", {
      sessionId: session.id,
      metadata,
    });
    return { applied: false, credits: 0, balance: null, pending: false };
  }

  if (expectedUserId && userId !== expectedUserId) {
    throw new TopupError(
      "This checkout does not belong to your account.",
      "FORBIDDEN",
    );
  }

  const currency = session.currency ?? getTopupSettings().currency;
  const amountCents =
    session.amount_total ?? (Number(metadata.amountCents) || 0);
  const reference = `stripe:${session.id}`;

  const result = await addCredits({
    userId,
    amount: credits,
    kind: "topup",
    reference,
    description: `Purchased ${credits.toLocaleString()} ${getSetting("credits.currency") || "Credits"} with Stripe`,
    metadata: {
      sessionId: session.id,
      paymentIntent:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      amountCents,
      currency,
      optionId: metadata.optionId || null,
    },
  });

  if (result.applied) {
    logActivity({
      userId,
      action: "credits.topup",
      message: `Purchased ${credits} credits with Stripe`,
      metadata: { sessionId: session.id, amountCents, currency },
    });

    try {
      await notifyUser({
        userId,
        kind: "credits.topup",
        title: "Credits added",
        body: `${credits.toLocaleString()} credits were added to your balance.`,
        url: "/credits",
      });
    } catch (cause) {
      console.error(
        "Unable to notify the user about a completed top-up.",
        cause,
      );
    }
  }

  return {
    applied: result.applied,
    credits,
    balance: result.balance,
    pending: false,
  };
};

export const fulfillTopupSession = async (
  sessionId: string,
  expectedUserId?: string,
) => {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new TopupError(
      "Stripe has not been configured by an administrator yet.",
      "NOT_CONFIGURED",
    );
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return applyPaidCheckoutSession(session, expectedUserId);
};

export const handleStripeEvent = async (event: Stripe.Event) => {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await applyPaidCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
    );
  }
};

export const listTopupHistory = async (
  userId: string,
  limit = 25,
): Promise<TopupHistoryEntry[]> => {
  const rows = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.kind, "topup"),
      ),
    )
    .orderBy(desc(creditTransaction.createdAt))
    .limit(limit);

  return rows.map((row) => {
    let metadata: Record<string, unknown> = {};

    try {
      metadata = row.metadata
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : {};
    } catch {
      metadata = {};
    }

    const amount = metadata.amountCents;

    return {
      id: row.id,
      credits: row.amount,
      amountCents: typeof amount === "number" ? amount : null,
      currency:
        typeof metadata.currency === "string"
          ? metadata.currency
          : cleanCurrency(),
      reference: row.reference,
      createdAt: row.createdAt,
    };
  });
};

type OptionInput = {
  label: string;
  description?: string;
  badge?: string;
  credits: number;
  priceCents: number;
  enabled?: boolean;
  sortOrder?: number;
};

const validateOptionInput = (input: OptionInput) => {
  const label = input.label.trim();
  const description = (input.description ?? "").trim();
  const badge = (input.badge ?? "").trim();
  const credits = Math.floor(input.credits);
  const priceCents = Math.round(input.priceCents);
  const sortOrder = Math.floor(input.sortOrder ?? 0);

  if (label.length < 1 || label.length > 80) {
    throw new TopupError(
      "The package name must be between 1 and 80 characters.",
      "INVALID_OPTION",
    );
  }

  if (description.length > 300) {
    throw new TopupError(
      "The package description is too long.",
      "INVALID_OPTION",
    );
  }

  if (badge.length > 24) {
    throw new TopupError(
      "The package badge must be 24 characters or fewer.",
      "INVALID_OPTION",
    );
  }

  if (!Number.isInteger(credits) || credits <= 0) {
    throw new TopupError(
      "Credits must be a positive whole number.",
      "INVALID_AMOUNT",
    );
  }

  if (!Number.isInteger(priceCents) || priceCents < MIN_CHECKOUT_CENTS) {
    throw new TopupError(
      `The price must be at least ${formatTopupPrice(MIN_CHECKOUT_CENTS)}.`,
      "INVALID_AMOUNT",
    );
  }

  return {
    label,
    description,
    badge,
    credits,
    priceCents,
    enabled: input.enabled ?? true,
    sortOrder,
  };
};

export const createCreditTopupOption = async (input: OptionInput) => {
  const values = validateOptionInput(input);
  const [created] = await db
    .insert(creditTopupOption)
    .values(values)
    .returning();

  if (!created)
    throw new TopupError(
      "The credit package could not be created.",
      "INVALID_OPTION",
    );

  return created;
};

export const updateCreditTopupOption = async (
  optionId: string,
  input: OptionInput,
) => {
  const values = validateOptionInput(input);
  const [updated] = await db
    .update(creditTopupOption)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(creditTopupOption.id, optionId))
    .returning();

  if (!updated)
    throw new TopupError(
      "That credit package no longer exists.",
      "INVALID_OPTION",
    );

  return updated;
};

export const setCreditTopupOptionEnabled = async (
  optionId: string,
  enabled: boolean,
) => {
  await db
    .update(creditTopupOption)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(creditTopupOption.id, optionId))
    .run();
};

export const deleteCreditTopupOption = async (optionId: string) => {
  await db
    .delete(creditTopupOption)
    .where(eq(creditTopupOption.id, optionId))
    .run();
};
