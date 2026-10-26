import { redirect } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { RetryAfterRateLimiter } from "sveltekit-rate-limiter/server";
import { getAuth } from "#lib/server/auth/auth.ts";
import { maybeRunRenewals } from "#lib/server/billing/billing.ts";
import { ensureOperationalSchema } from "#lib/server/db/bootstrap.ts";
import { serverEnv } from "#lib/server/config/env.ts";
import { startDiscordBot, stopDiscordBot } from "#lib/server/discord/bot.ts";
import { logActivity, logError } from "#lib/server/system/logs.ts";
import { recordRequest } from "#lib/server/system/metrics.ts";
import {
  getPanelUserId,
  panelAuthEnabled,
} from "#lib/server/auth/panel-auth.ts";
import { getNumber, loadSettings } from "#lib/server/config/settings.ts";
import { svelteKitHandler } from "better-auth/svelte-kit";
import {createBanner} from "#lib/taag.ts"

let hasInitialized = false;

const inflight = new Set<Promise<unknown>>();

const fireAndForget = (fn: () => unknown, label = "background task") => {
  const task: Promise<unknown> = (async () => fn())()
    .catch((err) => {
      console.error(`${label} failed:`, err);
      try {
        logError({
          reference: crypto.randomUUID(),
          status: 500,
          method: "BACKGROUND",
          path: label,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : null,
          metadata: { kind: "background" },
        });
      } catch {
        // Logging must never throw out of a background task.
      }
    })
    .finally(() => {
      inflight.delete(task);
    });

  inflight.add(task);
};

let renewalsRunning = false;

const runRenewalsOnce = async () => {
  if (renewalsRunning) return;
  renewalsRunning = true;
  try {
    await ensureOperationalSchema();
    await loadSettings();
    await maybeRunRenewals();
  } finally {
    renewalsRunning = false;
  }
};

const RENEWALS_INTERVAL_MS = 60_000;

if (!building && !hasInitialized) {
  hasInitialized = true;
  console.log(createBanner())

  fireAndForget(runRenewalsOnce, "renewals");
  void startDiscordBot().catch((cause) => {
    console.error("[discord] Unable to start the embedded invite bot.", cause);
  });
  const renewalsTimer = setInterval(
    () => fireAndForget(runRenewalsOnce, "renewals"),
    RENEWALS_INTERVAL_MS,
  );
  renewalsTimer.unref();

  (process as NodeJS.EventEmitter).once("sveltekit:shutdown", async () => {
    clearInterval(renewalsTimer);
    await stopDiscordBot().catch((cause) => {
      console.error("[discord] Unable to stop the embedded invite bot.", cause);
    });
    await Promise.race([
      Promise.allSettled([...inflight]),
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
  });
}

const authLimiter = new RetryAfterRateLimiter({
  IP: [30, "10m"],
  IPUA: [12, "10m"],
});

const setupLimiter = new RetryAfterRateLimiter({
  IP: [15, "15m"],
  IPUA: [6, "15m"],
});

const adapterLimiter = new RetryAfterRateLimiter({
  IPUA: [120, "m"],
});

const rewardsLimiter = new RetryAfterRateLimiter({
  IPUA: [60, "m"],
});

const limiterFor = (method: string, pathname: string) => {
  if (method !== "POST") return undefined;

  if (pathname === "/setup") return setupLimiter;
  if (
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/register")
  ) {
    return authLimiter;
  }
  if (pathname.startsWith("/api/auth/")) return authLimiter;
  if (pathname === "/api/adapter") return adapterLimiter;
  if (
    pathname.startsWith("/afk") ||
    pathname.startsWith("/rewards") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/j4r")
  ) {
    return rewardsLimiter;
  }

  return undefined;
};

const withSecurityHeaders = (response: Response) => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );

  if (serverEnv.ORIGIN.startsWith("https://")) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
  const limiter = limiterFor(event.request.method, event.url.pathname);

  if (limiter) {
    const status = await limiter.check(event);

    if (status.limited) {
      logActivity({
        action: "request.rate_limited",
        severity: "warning",
        message: `Rate limit exceeded for ${event.url.pathname}`,
        ip: event.getClientAddress(),
        path: event.url.pathname,
        metadata: { retryAfter: status.retryAfter, reason: status.reason },
      });

      return withSecurityHeaders(
        new Response("Too many requests. Please try again shortly.", {
          status: 429,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": String(status.retryAfter),
          },
        }),
      );
    }
  }

  await ensureOperationalSchema();
  await loadSettings();

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: event.request.headers });

  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
    event.locals.panelUserId = await getPanelUserId(session.user.id);

    if (
      panelAuthEnabled() &&
      event.url.pathname.startsWith("/server") &&
      !event.locals.panelUserId
    ) {
      redirect(307, "/settings");
    }
  }

  const response = await (async () => {
    const started = performance.now();
    let result: Response | undefined;

    try {
      result = await svelteKitHandler({ event, resolve, auth, building });
      return withSecurityHeaders(result);
    } finally {
      recordRequest(
        event.request.method,
        event.url.pathname,
        result?.status ?? 0,
        performance.now() - started,
        getNumber("monitor.slowMs"),
      );
    }
  })();

  return response;
};

export const handle: Handle = handleBetterAuth;

export const handleError: HandleServerError = ({ kind, error, event }) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "An unexpected error occurred.";

  if (status < 500) {
    return { message };
  }

  const reference = crypto.randomUUID();
  const userId = event.locals.user?.id;

  logError({
    reference,
    userId,
    status,
    method: event.request.method,
    path: event.url.pathname,
    route: event.route.id,
    message,
    stack: error instanceof Error ? error.stack : null,
    metadata: { route: event.route.id, kind },
  });

  return {
    message:
      "An unexpected error occurred. Please try again or contact an administrator.",
    reference,
  };
};
