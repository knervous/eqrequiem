import type { AppEnv } from "../config/env.js";
import type { Logger } from "../shared/logger.js";
import { databaseDialectFromUrl, type DatabaseBackend } from "./backend.js";
import { createNodeDatabase } from "./node/factory.js";
import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "./canonical-schema.js";

export class DbService {
  private contentBackend: DatabaseBackend | null = null;
  private runtimeBackend: DatabaseBackend | null = null;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    const contentDialect = databaseDialectFromUrl(this.env.db.contentUrl);
    const runtimeDialect = databaseDialectFromUrl(this.env.db.runtimeUrl);
    this.contentBackend = createNodeDatabase(this.env.db.contentUrl);
    this.runtimeBackend = createNodeDatabase(this.env.db.runtimeUrl);
    await Promise.all([
      applyCanonicalContentSchema(this.contentBackend),
      applyCanonicalRuntimeSchema(this.runtimeBackend),
    ]);
    this.logger.info("Database backends configured", {
      contentDb: this.env.db.contentUrl,
      runtimeDb: this.env.db.runtimeUrl,
      contentDialect,
      runtimeDialect,
    });
  }

  backend(target: "content" | "runtime"): DatabaseBackend {
    const backend = target === "content" ? this.contentBackend : this.runtimeBackend;
    if (!backend) throw new Error(`Database service is not started (${target})`);
    return backend;
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.contentBackend?.close(),
      this.runtimeBackend?.close(),
    ]);
    this.contentBackend = null;
    this.runtimeBackend = null;
    this.logger.info("Database backends stopped");
  }
}
