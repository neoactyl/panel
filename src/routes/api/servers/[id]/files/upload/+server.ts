import { error, json } from "@sveltejs/kit";
import { AdapterError, FILES_ROOT } from "#lib/adapter/sdk.ts";
import { getUserAdapter } from "#lib/server/panel/adapter.ts";
import { serverEnv } from "#lib/server/config/env.ts";
import { serverFeatureEnabled } from "#lib/server/config/settings.ts";
import type { RequestHandler } from "./$types";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const safeFilename = (value: string) =>
  value
    .replace(/[\\/]/g, "_")
    .replace(/["\r\n\0]/g, "_")
    .trim()
    .slice(0, 255);

const resolveDirectory = (value: string) => {
  const segments = value.replace(/\\/g, "/").split("/").filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === ".."))
    return null;

  const absolute = `/${segments.join("/")}`;

  if (absolute !== FILES_ROOT && !absolute.startsWith(`${FILES_ROOT}/`)) {
    return null;
  }

  return absolute;
};

export const POST: RequestHandler = async ({
  params,
  request,
  locals,
  url,
}) => {
  if (!locals.session || !locals.user) {
    error(401, { message: "Unauthorized" });
  }

  if (!serverFeatureEnabled("filemanager")) {
    error(404, { message: "This feature is disabled." });
  }

  const origin = request.headers.get("origin");
  const allowedOrigins = new Set(
    [
      new URL(request.url).origin,
      serverEnv.ORIGIN,
      serverEnv.BETTER_AUTH_URL,
    ].filter(Boolean) as string[],
  );

  if (origin && !allowedOrigins.has(origin)) {
    error(403, { message: "Cross-origin request blocked" });
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    error(403, { message: "Cross-site request blocked" });
  }

  const adapter = getUserAdapter(locals.user?.id, locals.panelUserId);

  if (!adapter.capabilities.files.upload) {
    error(403, { message: "This panel does not support file uploads." });
  }

  const directory = resolveDirectory(
    (url.searchParams.get("directory") ?? FILES_ROOT).trim() || FILES_ROOT,
  );

  if (!directory) {
    error(400, { message: "The upload directory is invalid." });
  }

  const filename = safeFilename(url.searchParams.get("filename") ?? "");

  if (!filename || filename === "." || filename === "..") {
    error(400, { message: "A valid file name is required." });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    error(413, {
      message: "This file is larger than the 512 MB upload limit.",
    });
  }

  const body = new Uint8Array(await request.arrayBuffer());

  if (body.byteLength > MAX_UPLOAD_BYTES) {
    error(413, {
      message: "This file is larger than the 512 MB upload limit.",
    });
  }

  try {
    const [entry] = await adapter.uploadFiles(params.id, directory, [
      {
        name: filename,
        size: body.byteLength,
        content: body,
      },
    ]);

    return json({ uploaded: entry?.name ?? filename, entry: entry ?? null });
  } catch (cause) {
    if (cause instanceof AdapterError) {
      return json(
        { message: cause.message, code: cause.code },
        { status: cause.statusCode ?? 502 },
      );
    }

    console.error("File upload failed", cause);
    return json(
      { message: "The file could not be uploaded." },
      { status: 500 },
    );
  }
};
