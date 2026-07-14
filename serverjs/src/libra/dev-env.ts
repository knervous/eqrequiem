import { resolve } from "node:path";

import { readEnv, type AppEnv } from "../config/env.js";

/** Standalone Libra defaults: canonical content on disk and an uncoupled local audit DB. */
export function readLibraDevEnv(
  raw: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): AppEnv {
  return readEnv({
    ...raw,
    NODE_ENV: "development",
    HTTP_HOST: raw.LIBRA_DEV_HOST ?? "127.0.0.1",
    HTTP_PORT: raw.LIBRA_DEV_PORT ?? "8082",
    LIBRA_ENABLED: "true",
    LIBRA_READONLY_RUNTIME: "true",
    CONTENT_DATABASE_URL:
      raw.LIBRA_CONTENT_DATABASE_URL
      ?? raw.CONTENT_DATABASE_URL
      ?? sqliteUrl(resolve(cwd, "data/content-db.sqlite")),
    RUNTIME_DATABASE_URL:
      raw.LIBRA_RUNTIME_DATABASE_URL
      ?? sqliteUrl(resolve(cwd, "data/libra-runtime.sqlite")),
  });
}

function sqliteUrl(filename: string): string {
  return `sqlite:${filename}`;
}
