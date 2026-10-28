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
import { setupCreateSchema } from "#lib/schemas.ts";
import { zod4 } from "sveltekit-superforms/adapters";
import { superValidate, message } from "sveltekit-superforms/server";
import { asc, count, eq } from "drizzle-orm";
import type { z } from "zod";
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

export const load: PageServerLoad = async ({ locals }) => {
  if (await hasAdmin()) {
    redirect(302, "/admin");
  }

  if ((await userCount()) > 0) {
    redirect(302, "/auth/login");
  }

  const panel = getPanelConfig();

  return {
    form: await superValidate(
      {
        appName: "Neoactyl",
        description: "",
        logo: "",
        adapter: panel.adapter === "calagopus" ? "calagopus" : "mock",
        panelUrl: panel.url ?? "",
        panelToken: panel.token ?? "",
      },
      zod4(setupCreateSchema),
      { id: "setup" },
    ),
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
    const form = await superValidate(event.request, zod4(setupCreateSchema), {
      id: "setup",
    });

    if (!form.valid) {
      return message(form, "Please review the highlighted fields.", {
        status: 400,
      });
    }

    const email = form.data.email.trim().toLowerCase();

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing.length > 0) {
      return message(form, "That email already exists. Sign in first.", {
        status: 400,
      });
    }

    const token = form.data.panelToken?.trim() ?? "";

    if (form.data.adapter === "calagopus") {
      if (!/^https?:\/\/.+/i.test(form.data.panelUrl ?? "")) {
        return message(form, "A valid Calagopus panel URL is required.", {
          status: 400,
        });
      }
      if (!token) {
        return message(form, "A panel API token is required for Calagopus.", {
          status: 400,
        });
      }
    }

    await updateSettings({
      "brand.name": form.data.appName || "Neoactyl",
      "brand.logo": form.data.logo ?? "",
      "brand.description": form.data.description || "Game server management",
      "panel.adapter": form.data.adapter,
      "panel.url": form.data.panelUrl ?? "",
      "panel.token": !token ? getPanelConfig().token : token,
    });
    await loadSettings(true);
    resetAdapter();

    let created: Awaited<ReturnType<AuthApi["signUpEmail"]>>;

    try {
      created = await getAuth().api.signUpEmail({
        body: { name: form.data.name, email, password: form.data.password },
      });
    } catch {
      return message(form, "Unable to create the administrator account.", {
        status: 400,
      });
    }

    const oldest = await firstUser();

    if (!oldest || oldest.id !== created.user.id) {
      return message(
        form,
        "Another account was created first. Sign in with the first account.",
        { status: 409 },
      );
    }

    await setUserRole(created.user.id, "admin");
    redirect(303, "/admin");
  },
};
