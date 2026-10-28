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

const str = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export const load: PageServerLoad = async ({ locals }) => {
  if (await hasAdmin()) {
    redirect(302, "/admin");
  }

  if ((await userCount()) > 0) {
    redirect(302, "/auth/login");
  }

  const panel = getPanelConfig();

  return {
    form: {
      appName: "Neoactyl",
      description: "",
      logo: "",
      adapter: panel.adapter === "calagopus" ? "calagopus" : "mock",
      panelUrl: panel.url ?? "",
      panelToken: panel.token ?? "",
    },
    branding: {
      name: "Neoactyl",
      logo: "",
    },
    panel: {
      adapter: panel.adapter,
      url: panel.url,
      tokenSet: Boolean(panel.token),
    },
  };
};

export const actions: Actions = {
  setup: async (event) => {
    const form = await event.request.formData();

    const name = str(form, "name");
    const email = str(form, "email").trim().toLowerCase();
    const password = str(form, "password");
    const confirmPassword = str(form, "confirmPassword");
    const appName = str(form, "appName") || "Neoactyl";
    const description = str(form, "description") || "Game server management";
    const logo = str(form, "logo");
    const adapter = str(form, "adapter");
    const panelUrl = str(form, "panelUrl");
    const panelToken = str(form, "panelToken");

    if (!name || !email || !password || !confirmPassword) {
      return { status: 400, body: "All fields are required." };
    }

    if (password !== confirmPassword) {
      return { status: 400, body: "Passwords do not match." };
    }

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length > 0) {
      return { status: 400, body: "That email already exists. Sign in first." };
    }

    if (adapter === "calagopus") {
      if (!/^https?:\/\/.+/i.test(panelUrl)) {
        return {
          status: 400,
          body: "A valid Calagopus panel URL is required.",
        };
      }
      if (!panelToken) {
        return {
          status: 400,
          body: "A panel API token is required for Calagopus.",
        };
      }
    }

    await updateSettings({
      "brand.name": appName,
      "brand.logo": logo,
      "brand.description": description,
      "panel.adapter": adapter,
      "panel.url": panelUrl,
      "panel.token": !panelToken ? getPanelConfig().token : panelToken,
    });
    await loadSettings(true);
    resetAdapter();

    let created: Awaited<ReturnType<AuthApi["signUpEmail"]>>;

    try {
      created = await getAuth().api.signUpEmail({
        body: { name, email, password },
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
        body: "Another account was created first. Sign in with the first account.",
      };
    }

    await setUserRole(created.user.id, "admin");
    redirect(303, "/admin");
  },
};
