import { redirect } from "@sveltejs/kit";
import { getAuth, type AuthApi } from "#lib/server/auth/auth.ts";
import { hasAdmin, setUserRole } from "#lib/server/auth/admin.ts";
import { user } from "#lib/server/db/auth.schema.ts";
import { db } from "#lib/server/db/index.ts";
import { resetAdapter } from "#lib/server/panel/adapter.ts";
import {
  getPanelConfig,
  loadSettings,
  updateSettings,
} from "#lib/server/config/settings.ts";
import { asc, count, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";

const str = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

const userCount = async () => {
  const [row] = await db.select({ total: count() }).from(user);
  return row?.total ?? 0;
};

const firstUser = () =>
  db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1)
    .get();

const applySettings = async (form: FormData): Promise<string | undefined> => {
  const existingToken = Boolean(getPanelConfig().token);
  const token = str(form, "panelToken").trim();

  if (str(form, "adapter") === "calagopus") {
    if (!/^https?:\/\/.+/i.test(str(form, "panelUrl"))) {
      return "A valid Calagopus panel URL is required.";
    }

    if (!token && !existingToken) {
      return "A panel API token is required.";
    }
  }

  const next = {
    "brand.name": str(form, "appName") || "Neoactyl",
    "brand.logo": str(form, "logo"),
    "brand.description": str(form, "description") || "Game server management",
    "panel.adapter": str(form, "adapter"),
    "panel.url": str(form, "panelUrl"),
    "panel.token": !token ? getPanelConfig().token : token,
  };

  await updateSettings(next);
  await loadSettings(true);
  resetAdapter();

  return undefined;
};

export const load: PageServerLoad = async ({ locals }) => {
  if (await hasAdmin()) {
    redirect(302, "/admin");
  }

  const [hasUsers, oldest] = await Promise.all([userCount(), firstUser()]);
  const canClaim = Boolean(
    locals.user && oldest && locals.user.id === oldest.id,
  );

  return {
    existingUser: locals.user
      ? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
      : null,
    hasUsers,
    canClaim,
    panel: {
      adapter: getPanelConfig().adapter,
      url: getPanelConfig().url,
      tokenSet: Boolean(getPanelConfig().token),
    },
  };
};

export const actions: Actions = {
  create: async (event) => {
    if (await hasAdmin()) {
      return { status: 400, body: "An administrator already exists." };
    }

    if ((await userCount()) > 0) {
      return {
        status: 409,
        body: "Accounts already exist. Sign in with the first account to claim administrator.",
      };
    }

    const form = await event.request.formData();

    const email = str(form, "email").trim().toLowerCase();

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length > 0) {
      return {
        status: 400,
        body: "That email already exists. Sign in first, then claim the administrator role.",
      };
    }

    const problem = await applySettings(form);

    if (problem) {
      return { status: 400, body: problem };
    }

    let created: Awaited<ReturnType<AuthApi["signUpEmail"]>>;

    try {
      created = await getAuth().api.signUpEmail({
        body: {
          name: str(form, "name"),
          email,
          password: str(form, "password"),
        },
      });
    } catch {
      return {
        status: 400,
        body: "Unable to create the administrator account.",
      };
    }

    const oldest = await firstUser();

    if (!oldest || oldest.id !== created.user.id) {
      return {
        status: 409,
        body: "Another account was created first. Sign in with the first account to claim administrator.",
      };
    }

    await setUserRole(created.user.id, "admin");
    redirect(303, "/admin");
  },

  claim: async (event) => {
    const { locals } = event;

    if (await hasAdmin()) {
      return { status: 400, body: "An administrator already exists." };
    }

    if (!locals.user) {
      return { status: 401, body: "Sign in to claim the administrator role." };
    }

    const oldest = await firstUser();

    if (!oldest || oldest.id !== locals.user.id) {
      return {
        status: 403,
        body: "Only the first account created on this instance can claim the administrator role.",
      };
    }

    const form = await event.request.formData();

    const problem = await applySettings(form);

    if (problem) {
      return { status: 400, body: problem };
    }

    await setUserRole(locals.user.id, "admin");
    redirect(303, "/admin");
  },
};
