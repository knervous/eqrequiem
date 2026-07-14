import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";

import type { AppEnv } from "../config/env.js";
import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import type { DbService } from "../db/index.js";
import { DatabaseInspector, quoteIdentifier } from "../db/introspection.js";
import type { Logger } from "../shared/logger.js";
import type { ZoneShardStatus } from "../zone/worker-pool.js";

type DbTarget = "content" | "runtime";
type JsonObject = Record<string, unknown>;

interface MutationAuditContext {
  requestId: string;
  actor: string;
  remoteAddress: string;
  method: string;
  dbTarget: DbTarget;
  table: string;
}

interface ValidationIssue {
  code: string;
  severity: "warning" | "error";
  table: string;
  message: string;
  count: number;
}

export interface LibraCertificateSource {
  getMaterial(): Promise<{ hashBase64: string }>;
}

export interface LibraZoneControl {
  listShards(): ZoneShardStatus[];
  startShard(zoneId: number, instanceId?: number): ZoneShardStatus;
  stopShard(zoneId: number, instanceId?: number): Promise<boolean>;
  questStatus(): {
    directory: string;
    revision: number;
    quests: Array<{ id: string; zoneIds: number[] }>;
  };
  reloadQuests(): Promise<void>;
}

export interface LibraServiceOptions {
  mode?: "full-backend" | "content-sqlite";
  certificateSource?: LibraCertificateSource;
  zones?: LibraZoneControl;
}

export class LibraService {
  private server: Server | null = null;
  private readonly allowAllWrites: boolean;
  private readonly writeAllowlist: Set<string>;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly databases: DbService,
    private readonly options: LibraServiceOptions = {},
  ) {
    this.allowAllWrites = env.libra.writeAllowlist.includes("*");
    this.writeAllowlist = new Set(env.libra.writeAllowlist.map((entry) => entry.toLowerCase()));
  }

  async start(): Promise<void> {
    if (!this.env.libra.enabled) {
      this.logger.info("Libra disabled by config");
      return;
    }
    await this.ensureAuditTable();
    this.server = createServer((request, response) => void this.handleRequest(request, response));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.env.http.port, this.env.http.host, resolve);
    });
    this.logger.info("Libra backend editor started", {
      host: this.env.http.host,
      port: this.env.http.port,
      contentDialect: this.database("content").dialect,
      runtimeDialect: this.database("runtime").dialect,
      readonlyRuntime: this.env.libra.readonlyRuntime,
      mode: this.mode,
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => error ? reject(error) : resolve());
    });
    this.server = null;
    this.logger.info("Libra backend editor stopped");
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (!request.url) return this.writeJson(response, 400, { error: "bad_request" });

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const path = url.pathname;
    if (request.method === "GET" && path === "/hash") {
      if (!this.options.certificateSource) {
        this.writeText(response, 404, "");
        return;
      }
      try {
        this.writeText(response, 200, (await this.options.certificateSource.getMaterial()).hashBase64);
      } catch {
        this.writeText(response, 500, "");
      }
      return;
    }
    if (!this.authorized(request)) {
      this.writeJson(response, 401, { error: "unauthorized", message: "missing or invalid x-libra-key" });
      return;
    }

    const requestId = readHeader(request, "x-request-id") ?? makeRequestId();
    const actor = readHeader(request, "x-libra-actor") ?? "unknown";
    const remoteAddress = request.socket.remoteAddress ?? "unknown";

    try {
      if (request.method === "GET" && path === "/libra") {
        this.writeJson(response, 200, {
          service: "libra",
          mode: this.mode,
          routes: [
            "GET /libra/health",
            "GET /libra/meta/tables|columns",
            "GET /libra/content/zones|npcs",
            "GET|POST|PUT|DELETE /libra/data",
            "GET|POST|DELETE /libra/shards",
            "GET|POST /libra/quests",
            "GET /libra/validate",
          ],
        });
        return;
      }
      if (request.method === "GET" && path === "/libra/health") {
        this.writeJson(response, 200, {
          ok: true,
          service: "libra",
          mode: this.mode,
          requestId,
          contentDialect: this.database("content").dialect,
          runtimeDialect: this.database("runtime").dialect,
          shardCount: this.options.zones?.listShards().length ?? 0,
          questRevision: this.options.zones?.questStatus().revision ?? 0,
        });
        return;
      }
      if (path === "/libra/shards") {
        const zones = this.requireZoneControl();
        if (request.method === "GET") {
          this.writeJson(response, 200, { requestId, shards: zones.listShards() });
          return;
        }
        const zoneId = readPositiveInt(url, "zoneId", -1, 1_000_000);
        const instanceId = readPositiveInt(url, "instanceId", 0, 1_000_000);
        if (zoneId < 0) throw new Error("zoneId is required");
        if (request.method === "POST") {
          this.writeJson(response, 201, { requestId, shard: zones.startShard(zoneId, instanceId) });
          return;
        }
        if (request.method === "DELETE") {
          this.writeJson(response, 200, { requestId, stopped: await zones.stopShard(zoneId, instanceId) });
          return;
        }
      }
      if (path === "/libra/quests") {
        const zones = this.requireZoneControl();
        if (request.method === "GET") {
          this.writeJson(response, 200, { requestId, ...zones.questStatus() });
          return;
        }
        if (request.method === "POST") {
          await zones.reloadQuests();
          this.writeJson(response, 200, { requestId, ...zones.questStatus() });
          return;
        }
      }
      if (request.method === "GET" && path === "/libra/validate") {
        const target = readDbTarget(url);
        const issues = await this.runValidation(target);
        this.writeJson(response, 200, { requestId, db: target, issueCount: issues.length, issues });
        return;
      }
      if (request.method === "GET" && path === "/libra/content/zones") {
        const search = `%${url.searchParams.get("search")?.trim() ?? ""}%`;
        const limit = readPositiveInt(url, "limit", 250, this.env.libra.maxPageSize);
        const rows = (await this.database("content").query(
          `SELECT zone.id, zone.short_name, zone.name, zone.safe_x, zone.safe_y, zone.safe_z,
            COUNT(spawn.id) AS spawn_count
           FROM zones zone LEFT JOIN spawn_points spawn ON spawn.zone_id = zone.id
           WHERE lower(zone.short_name) LIKE lower(?) OR lower(zone.name) LIKE lower(?)
           GROUP BY zone.id, zone.short_name, zone.name, zone.safe_x, zone.safe_y, zone.safe_z
           ORDER BY zone.short_name LIMIT ${limit}`,
          [search, search],
        )).rows;
        this.writeJson(response, 200, { requestId, count: rows.length, rows });
        return;
      }
      if (request.method === "GET" && path === "/libra/content/npcs") {
        const search = `%${url.searchParams.get("search")?.trim() ?? ""}%`;
        const limit = readPositiveInt(url, "limit", 250, this.env.libra.maxPageSize);
        const rows = (await this.database("content").query(
          `SELECT npc.id, npc.npc_key, npc.name, npc.level, npc.race_id, npc.gender,
            npc.model_key, npc.behavior_key, npc.movement_speed,
            COUNT(member.spawn_group_id) AS spawn_group_count
           FROM npc_archetypes npc
           LEFT JOIN spawn_group_members member ON member.npc_archetype_id = npc.id
           WHERE lower(npc.name) LIKE lower(?) OR lower(npc.npc_key) LIKE lower(?)
           GROUP BY npc.id, npc.npc_key, npc.name, npc.level, npc.race_id, npc.gender,
             npc.model_key, npc.behavior_key, npc.movement_speed
           ORDER BY npc.name LIMIT ${limit}`,
          [search, search],
        )).rows;
        this.writeJson(response, 200, { requestId, count: rows.length, rows });
        return;
      }
      if (request.method === "GET" && path === "/libra/meta/tables") {
        const target = readDbTarget(url);
        const tables = await this.inspector(target).listTables();
        this.writeJson(response, 200, { db: target, count: tables.length, tables });
        return;
      }
      if (request.method === "GET" && path === "/libra/meta/columns") {
        const target = readDbTarget(url);
        const table = readTable(url);
        this.writeJson(response, 200, { db: target, table, columns: await this.inspector(target).listColumns(table) });
        return;
      }
      if (path === "/libra/data") {
        const target = readDbTarget(url);
        const table = readTable(url);
        const inspector = this.inspector(target);
        if (request.method === "GET") {
          const limit = readPositiveInt(url, "limit", 100, this.env.libra.maxPageSize);
          const offset = readPositiveInt(url, "offset", 0, 500_000);
          const rows = await inspector.rows(table, limit, offset);
          this.writeJson(response, 200, { requestId, db: target, table, limit, offset, count: rows.length, rows });
          return;
        }
        if (target === "runtime" && this.env.libra.readonlyRuntime) {
          this.writeJson(response, 403, { error: "forbidden", message: "runtime DB is read-only" });
          return;
        }
        this.assertWriteAllowed(target, table);
        const body = await readJsonBody(request);
        const audit = { requestId, actor, remoteAddress, method: request.method ?? "", dbTarget: target, table };
        if (request.method === "POST") {
          const row = asObject(body.row);
          const affected = await this.audited(audit, row, null, () => inspector.insert(table, row));
          this.writeJson(response, 201, { requestId, ok: true, affected });
          return;
        }
        if (request.method === "PUT") {
          const row = asObject(body.row);
          const keys = await inspector.primaryKeys(table);
          const key = Object.fromEntries(keys.map((name) => [name, row[name]]));
          const updated = await this.audited(audit, row, key, () => inspector.update(table, row));
          this.writeJson(response, 200, { requestId, ok: true, updated });
          return;
        }
        if (request.method === "DELETE") {
          const key = asObject(body.key);
          const deleted = await this.audited(audit, null, key, () => inspector.delete(table, key));
          this.writeJson(response, 200, { requestId, ok: true, deleted });
          return;
        }
      }
      this.writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Libra request failed", { method: request.method, path, error: message });
      this.writeJson(response, 400, { error: "bad_request", message });
    }
  }

  private database(target: DbTarget): DatabaseBackend {
    return this.databases.backend(target);
  }

  private get mode(): "full-backend" | "content-sqlite" {
    return this.options.mode ?? "full-backend";
  }

  private requireZoneControl(): LibraZoneControl {
    if (!this.options.zones) {
      throw new Error("zone and quest controls require Libra's full-backend mode");
    }
    return this.options.zones;
  }

  private inspector(target: DbTarget): DatabaseInspector {
    return new DatabaseInspector(this.database(target));
  }

  private async ensureAuditTable(): Promise<void> {
    const database = this.database("runtime");
    const id = database.dialect === "postgres"
      ? "BIGSERIAL PRIMARY KEY"
      : database.dialect === "mysql"
        ? "BIGINT AUTO_INCREMENT PRIMARY KEY"
        : "INTEGER PRIMARY KEY AUTOINCREMENT";
    await database.execute(`CREATE TABLE IF NOT EXISTS libra_audit_log (
      id ${id}, happened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      request_id TEXT NOT NULL, actor TEXT NOT NULL, remote_address TEXT NOT NULL,
      method TEXT NOT NULL, db_target TEXT NOT NULL, table_name TEXT NOT NULL,
      primary_key_json TEXT, mutation_json TEXT, outcome TEXT NOT NULL, message TEXT
    )`);
  }

  private async audited<T>(
    context: MutationAuditContext,
    mutation: DatabaseRow | null,
    key: DatabaseRow | null,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      const value = await work();
      await this.writeAudit(context, "success", key, mutation, null);
      return value;
    } catch (error) {
      await this.writeAudit(context, "failed", key, mutation, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async writeAudit(
    context: MutationAuditContext,
    outcome: "success" | "failed",
    key: DatabaseRow | null,
    mutation: DatabaseRow | null,
    message: string | null,
  ): Promise<void> {
    try {
      await this.database("runtime").execute(
        `INSERT INTO libra_audit_log
         (request_id, actor, remote_address, method, db_target, table_name, primary_key_json, mutation_json, outcome, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [context.requestId, context.actor, context.remoteAddress, context.method, context.dbTarget,
          context.table, key ? JSON.stringify(key) : null, mutation ? JSON.stringify(mutation) : null, outcome, message],
      );
    } catch (error) {
      this.logger.warn("Libra audit log write failed", { requestId: context.requestId, error: String(error) });
    }
  }

  private async runValidation(target: DbTarget): Promise<ValidationIssue[]> {
    if (target === "runtime") return [];
    const inspector = this.inspector("content");
    const tables = new Set((await inspector.listTables()).map(({ table }) => table));
    const checks = [
      { child: "spawn_points", childKey: "spawn_group_id", parent: "spawn_groups", parentKey: "id" },
      { child: "spawn_group_members", childKey: "spawn_group_id", parent: "spawn_groups", parentKey: "id" },
      { child: "spawn_group_members", childKey: "npc_archetype_id", parent: "npc_archetypes", parentKey: "id" },
    ];
    const issues: ValidationIssue[] = [];
    for (const check of checks) {
      if (!tables.has(check.child) || !tables.has(check.parent)) continue;
      const db = this.database("content");
      const q = (value: string) => quoteIdentifier(value, db.dialect);
      const result = await db.query<{ count: number | bigint | string }>(
        `SELECT COUNT(*) AS count FROM ${q(check.child)} c LEFT JOIN ${q(check.parent)} p ON p.${q(check.parentKey)} = c.${q(check.childKey)} WHERE p.${q(check.parentKey)} IS NULL`,
      );
      const count = Number(result.rows[0]?.count ?? 0);
      if (count > 0) issues.push({
        code: `${check.child}_orphan_${check.parent}`,
        severity: "error",
        table: check.child,
        message: `${check.child} rows reference missing ${check.parent}`,
        count,
      });
    }
    return issues.slice(0, this.env.libra.validationMaxIssues);
  }

  private assertWriteAllowed(target: DbTarget, table: string): void {
    if (this.allowAllWrites) return;
    if (this.writeAllowlist.has(`${target}.${table}`.toLowerCase()) || this.writeAllowlist.has(`${target}.*`)) return;
    throw new Error(`writes not allowed for ${target}.${table}`);
  }

  private authorized(request: IncomingMessage): boolean {
    if (!this.env.libra.apiKey) return true;
    return request.headers["x-libra-key"] === this.env.libra.apiKey;
  }

  private writeJson(response: ServerResponse, status: number, body: JsonObject): void {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body, jsonReplacer));
  }

  private writeText(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(body);
  }
}

function readDbTarget(url: URL): DbTarget {
  const target = url.searchParams.get("db") ?? "content";
  if (target !== "content" && target !== "runtime") throw new Error("db must be content or runtime");
  return target;
}

function readTable(url: URL): string {
  const table = url.searchParams.get("table");
  if (!table) throw new Error("table is required");
  return table;
}

function readPositiveInt(url: URL, name: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${name} is invalid`);
  return value;
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return asObject(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
}

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected JSON object");
  return value as JsonObject;
}

function readHeader(request: IncomingMessage, header: string): string | null {
  const value = request.headers[header];
  return typeof value === "string" ? value : null;
}

function makeRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return value;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,x-libra-key,x-libra-actor,x-request-id");
}
