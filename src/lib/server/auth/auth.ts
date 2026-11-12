import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { serverEnv } from '#lib/server/config/env.ts';
import { getBool, getSetting } from '#lib/server/config/settings.ts';
import {
  sendEventEmail,
  sendTemplateEmail,
} from '#lib/server/email/mailer.ts';
import { admin } from 'better-auth/plugins';
import { stripe as stripePlugin } from '@better-auth/stripe';
import {
  getStripeClient,
  getStripeCredentials,
  handleStripeEvent,
} from '#lib/server/billing/topup.ts';

const BASE_URL = serverEnv.BETTER_AUTH_URL || serverEnv.ORIGIN;

const discordCredentials = () => {
  const clientId =
    getSetting("discord.clientId").trim() || serverEnv.DISCORD_CLIENT_ID || "";
  const clientSecret =
    getSetting("discord.clientSecret").trim() ||
    serverEnv.DISCORD_CLIENT_SECRET ||
    "";

  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const stripeRuntime = () => {
  const credentials = getStripeCredentials();
  const client = getStripeClient();

  if (!credentials.configured || !client) return null;

  return { client, webhookSecret: credentials.webhookSecret };
};

/**
 * Send transactional email without holding up the auth request. SMTP can take
 * up to the configured timeout, which must not delay sign-up or reset flows.
 */
const sendEmailInBackground = (label: string, send: () => Promise<unknown>) => {
  void send().catch((cause) => {
    console.error(`Unable to send the ${label} email.`, cause);
  });
};

const buildAuth = (
  discord: { clientId: string; clientSecret: string } | null,
  stripe: ReturnType<typeof stripeRuntime>,
) =>
  betterAuth({
    baseURL: BASE_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    trustedOrigins: [BASE_URL],
    database: drizzleAdapter(db, { provider: "sqlite" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: getBool("auth.requireEmailVerification"),
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user: recipient, url }) => {
        sendEmailInBackground('password reset', () =>
          sendEventEmail("email.events.passwordReset", {
            to: recipient.email,
            variables: {
              userName: recipient.name,
              userEmail: recipient.email,
              resetUrl: url,
              expiresIn: "1 hour",
            },
          }),
        );
      },
    },
    emailVerification: {
      // Verification is mandatory when the admin requires it, so the email
      // must still go out even if the optional event toggle is off.
      sendOnSignUp:
        getBool("email.events.emailVerification") ||
        getBool("auth.requireEmailVerification"),
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user: recipient, url }) => {
        const variables = {
          userName: recipient.name,
          userEmail: recipient.email,
          verificationUrl: url,
          expiresIn: "1 hour",
        };

        if (getBool("auth.requireEmailVerification")) {
          sendEmailInBackground('email verification', () =>
            sendTemplateEmail("email-verification", {
              to: recipient.email,
              variables,
            }),
          );
          return;
        }

        sendEmailInBackground('email verification', () =>
          sendEventEmail("email.events.emailVerification", {
            to: recipient.email,
            variables,
          }),
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure: BASE_URL.startsWith("https://"),
      },
    },
    socialProviders: discord
      ? {
          discord: {
            ...discord,
            prompt: "consent",
            scope: ["identify", "guilds"],
          },
        }
      : undefined,
    plugins: [
      admin(),
      ...(stripe
        ? [
            stripePlugin({
              stripeClient: stripe.client,
              stripeWebhookSecret: stripe.webhookSecret,
              createCustomerOnSignUp: false,
              onEvent: handleStripeEvent,
            }),
          ]
        : []),
      sveltekitCookies(getRequestEvent),
    ],
  });

type Auth = ReturnType<typeof buildAuth>;

const runtimeKey = (discord: ReturnType<typeof discordCredentials>) => {
  const stripe = getStripeCredentials();
  const discordKey = discord
    ? `${discord.clientId}:${discord.clientSecret}`
    : "";

  return `${discordKey}|${stripe.secretKey}|${stripe.webhookSecret}|${getBool(
    "auth.requireEmailVerification",
  )}|${getBool("email.events.emailVerification")}`;
};

const initialDiscord = discordCredentials();
const initialStripe = stripeRuntime();
let cached: { key: string; auth: Auth } = {
  key: runtimeKey(initialDiscord),
  auth: buildAuth(initialDiscord, initialStripe),
};

export let auth = cached.auth;

export const getAuth = () => {
  const discord = discordCredentials();
  const key = runtimeKey(discord);

  if (cached.key === key) {
    auth = cached.auth;
    return auth;
  }

  auth = buildAuth(discord, stripeRuntime());
  cached = { key, auth };
  return auth;
};

export type AuthApi = Auth["api"];
