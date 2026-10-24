import * as env from "$app/env/private";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    ORIGIN: z.string().url(),
    BETTER_AUTH_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    SETTINGS_ENCRYPTION_KEY: z.string().min(32).optional(),
    DISCORD_CLIENT_ID: optionalString,
    DISCORD_CLIENT_SECRET: optionalString,
  },
  runtimeEnv: env,
  emptyStringAsUndefined: true,
});
