import { z } from "zod";

import type { LogLevel } from "../shared/logger.js";

const BooleanFromEnv = z
  .union([z.boolean(), z.string().trim().toLowerCase()])
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === "true" || value === "1" || value === "yes") {
      return true;
    }
    if (value === "false" || value === "0" || value === "no") {
      return false;
    }

    throw new Error(`Invalid boolean value: ${value}`);
  });

const CsvListFromEnv = z.string().transform((value) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0),
);

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WT_HOST: z.string().default("::"),
  WT_PORT: z.coerce.number().int().min(1).max(65535).default(443),
  WT_PATH: z.string().min(1).default("/game"),
  WT_SECRET: z.string().min(1).default("shadows-of-eltania-dev-secret"),
  WT_CERT_PATH: z.string().min(1).default("./certs/wt-localhost-cert.pem"),
  WT_KEY_PATH: z.string().min(1).default("./certs/wt-localhost-key.pem"),
  WT_READY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(10000),
  HTTP_HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LIBRA_ENABLED: BooleanFromEnv.default(true),
  LIBRA_API_KEY: z.string().default(""),
  LIBRA_READONLY_RUNTIME: BooleanFromEnv.default(true),
  LIBRA_MAX_PAGE_SIZE: z.coerce.number().int().min(25).max(5000).default(500),
  LIBRA_WRITE_ALLOWLIST: CsvListFromEnv.default(["*"]),
  LIBRA_VALIDATION_MAX_ISSUES: z.coerce
    .number()
    .int()
    .min(10)
    .max(2000)
    .default(250),
  CONTENT_DATABASE_URL: z.string().min(1).optional(),
  RUNTIME_DATABASE_URL: z.string().min(1).optional(),
  CONTENT_DB_URL: z.string().min(1).optional(),
  RUNTIME_DB_URL: z.string().min(1).optional(),
  ZONE_TICK_RATE_HZ: z.coerce.number().min(1).max(1000).default(20),
  ZONE_WORK_BUDGET_MS: z.coerce.number().min(1).max(250).default(8),
  QUEST_DIR: z.string().min(1).default("./quests"),
  FEATURE_AOI_PRIORITY: BooleanFromEnv.default(true),
  FEATURE_PERSIST_WORKER: BooleanFromEnv.default(true),
  FEATURE_NAV_WORKER: BooleanFromEnv.default(true),
});

export type AppEnv = {
  nodeEnv: "development" | "test" | "production";
  logLevel: LogLevel;
  transport: {
    host: string;
    port: number;
    path: string;
    secret: string;
    certPath: string;
    keyPath: string;
    readyTimeoutMs: number;
  };
  http: {
    host: string;
    port: number;
  };
  libra: {
    enabled: boolean;
    apiKey: string;
    readonlyRuntime: boolean;
    maxPageSize: number;
    writeAllowlist: string[];
    validationMaxIssues: number;
  };
  db: {
    contentUrl: string;
    runtimeUrl: string;
  };
  zone: {
    tickRateHz: number;
    workBudgetMs: number;
    questDir: string;
  };
  features: {
    aoiPriority: boolean;
    persistWorker: boolean;
    navWorker: boolean;
  };
};

export function readEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.parse(raw);
  const contentUrl =
    parsed.CONTENT_DATABASE_URL ??
    parsed.CONTENT_DB_URL ??
    "sqlite:./data/content-db.sqlite";
  const runtimeUrl =
    parsed.RUNTIME_DATABASE_URL ??
    parsed.RUNTIME_DB_URL ??
    "sqlite:./data/runtime-db.sqlite";

  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    transport: {
      host: parsed.WT_HOST,
      port: parsed.WT_PORT,
      path: parsed.WT_PATH,
      secret: parsed.WT_SECRET,
      certPath: parsed.WT_CERT_PATH,
      keyPath: parsed.WT_KEY_PATH,
      readyTimeoutMs: parsed.WT_READY_TIMEOUT_MS,
    },
    http: {
      host: parsed.HTTP_HOST,
      port: parsed.HTTP_PORT,
    },
    libra: {
      enabled: parsed.LIBRA_ENABLED,
      apiKey: parsed.LIBRA_API_KEY,
      readonlyRuntime: parsed.LIBRA_READONLY_RUNTIME,
      maxPageSize: parsed.LIBRA_MAX_PAGE_SIZE,
      writeAllowlist: parsed.LIBRA_WRITE_ALLOWLIST,
      validationMaxIssues: parsed.LIBRA_VALIDATION_MAX_ISSUES,
    },
    db: {
      contentUrl,
      runtimeUrl,
    },
    zone: {
      tickRateHz: parsed.ZONE_TICK_RATE_HZ,
      workBudgetMs: parsed.ZONE_WORK_BUDGET_MS,
      questDir: parsed.QUEST_DIR,
    },
    features: {
      aoiPriority: parsed.FEATURE_AOI_PRIORITY,
      persistWorker: parsed.FEATURE_PERSIST_WORKER,
      navWorker: parsed.FEATURE_NAV_WORKER,
    },
  };
}
