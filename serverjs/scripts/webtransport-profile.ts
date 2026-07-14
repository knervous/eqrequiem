import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";

import { WebTransport, quicheLoaded } from "@fails-components/webtransport";

import { BackendApp } from "../src/app.js";
import { readEnv } from "../src/config/env.js";
import { decodePacket, encodePacket } from "../src/protocol/index.js";
import { OP } from "../src/protocol/opcodes.js";
import {
  decodeSidecar,
  encodeSidecar,
  SIDECAR_SCHEMA,
} from "../src/protocol/sidecar-codec.js";
import { createLogger } from "../src/shared/logger.js";

interface Sample {
  ok: boolean;
  connectMs: number;
  jwtMs: number;
  zoneMs: number;
  totalMs: number;
  error?: string;
}

async function main(): Promise<void> {
  const rawEnv = {
    ...process.env,
    WT_HOST: process.env.WT_HOST ?? "localhost",
    WT_PORT: process.env.WT_PORT ?? "443",
    HTTP_HOST: process.env.HTTP_HOST ?? "localhost",
    HTTP_PORT: process.env.HTTP_PORT ?? "19081",
    LIBRA_ENABLED: process.env.LIBRA_ENABLED ?? "false",
    FEATURE_PERSIST_WORKER: process.env.FEATURE_PERSIST_WORKER ?? "false",
    FEATURE_NAV_WORKER: process.env.FEATURE_NAV_WORKER ?? "false",
  };

  const clients = parseIntSafe(process.env.WT_PROFILE_CLIENTS, 25);
  const concurrency = parseIntSafe(process.env.WT_PROFILE_CONCURRENCY, 5);
  const warmup = parseIntSafe(process.env.WT_PROFILE_WARMUP, 3);

  const env = readEnv(rawEnv);
  const logger = createLogger("error");
  const app = new BackendApp(env, logger);

  await app.start();

  try {
    await readWithTimeout(
      quicheLoaded,
      8000,
      "Timed out waiting for quiche to load",
    );
    const certHashBytes = await loadLeafCertHashBytes(env.transport.certPath);

    for (let i = 0; i < warmup; i++) {
      await runProfileClient(i, env, certHashBytes).catch(() => undefined);
    }

    const jobs = Array.from({ length: clients }, (_, idx) => idx);
    const samples = await runConcurrent(jobs, concurrency, async (id) =>
      runProfileClient(id, env, certHashBytes),
    );

    const okSamples = samples.filter((s) => s.ok);
    const failSamples = samples.filter((s) => !s.ok);

    console.log("WebTransport profile summary", {
      clients,
      concurrency,
      warmup,
      success: okSamples.length,
      failed: failSamples.length,
      connect: summarize(okSamples.map((s) => s.connectMs)),
      jwt: summarize(okSamples.map((s) => s.jwtMs)),
      zone: summarize(okSamples.map((s) => s.zoneMs)),
      total: summarize(okSamples.map((s) => s.totalMs)),
      firstErrors: failSamples.slice(0, 5).map((s) => s.error ?? "unknown"),
    });
  } finally {
    await readWithTimeout(app.stop(), 8000, "Timed out stopping backend app");
  }
}

async function runProfileClient(
  clientId: number,
  env: ReturnType<typeof readEnv>,
  certHashBytes: ArrayBuffer,
): Promise<Sample> {
  const startedAt = nowMs();
  const transport = new WebTransport(
    `https://${env.transport.host}:${env.transport.port}${env.transport.path}`,
    {
      serverCertificateHashes: [{ algorithm: "sha-256", value: certHashBytes }],
      forceReliable: true,
    } as any,
  );

  let datagramReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let datagramWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;

  try {
    await readWithTimeout(
      transport.ready,
      15000,
      `Client ${clientId} readiness timed out`,
    );
    const connectedAt = nowMs();

    datagramReader = transport.datagrams.readable.getReader();
    datagramWriter = transport.datagrams.createWritable().getWriter();

    const jwtPayload = encodeSidecar(SIDECAR_SCHEMA.JWT_LOGIN, {
      token: `profile-token-${clientId}-${Date.now()}`,
    });
    await readWithTimeout(
      datagramWriter.write(encodePacket(OP.JWT_LOGIN, jwtPayload)),
      5000,
      `Client ${clientId} JWT write timed out`,
    );
    const jwtResp = await readOpcodePayload(
      datagramReader,
      OP.JWT_RESPONSE,
      5000,
    );
    const jwtStatus =
      decodeSidecar<{ status: number }>(SIDECAR_SCHEMA.JWT_RESPONSE, jwtResp)
        ?.status ?? Number.NaN;
    if (!Number.isFinite(jwtStatus)) {
      throw new Error(`Client ${clientId} invalid JWT response`);
    }
    const jwtAt = nowMs();

    const zonePayload = encodeSidecar(SIDECAR_SCHEMA.ZONE_SESSION, {
      zoneId: 2,
      instanceId: 0,
    });
    await readWithTimeout(
      datagramWriter.write(encodePacket(OP.ZONE_SESSION, zonePayload)),
      5000,
      `Client ${clientId} zone write timed out`,
    );
    const zoneResp = await readOpcodePayload(
      datagramReader,
      OP.ZONE_SESSION_VALID,
      5000,
    );
    const zoneStatus =
      decodeSidecar<{ value: number }>(SIDECAR_SCHEMA.INT, zoneResp)?.value ??
      Number.NaN;
    if (zoneStatus !== 1) {
      throw new Error(`Client ${clientId} invalid zone response ${zoneStatus}`);
    }
    const zoneAt = nowMs();

    return {
      ok: true,
      connectMs: connectedAt - startedAt,
      jwtMs: jwtAt - connectedAt,
      zoneMs: zoneAt - jwtAt,
      totalMs: zoneAt - startedAt,
    };
  } catch (error) {
    const endedAt = nowMs();
    return {
      ok: false,
      connectMs: 0,
      jwtMs: 0,
      zoneMs: 0,
      totalMs: endedAt - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    datagramReader?.releaseLock();
    datagramWriter?.releaseLock();
    transport.close({ closeCode: 0, reason: "profile done" });
  }
}

async function readOpcodePayload(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  opcode: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  while (true) {
    const { done, value } = await readWithTimeout(
      reader.read(),
      timeoutMs,
      `Timed out waiting for opcode ${opcode}`,
    );
    if (done || !value) {
      break;
    }

    const decoded = decodePacket(value);
    if (decoded && decoded.opcode === opcode) {
      return decoded.payload;
    }
  }

  throw new Error(`Datagram stream closed while waiting for opcode ${opcode}`);
}

async function loadLeafCertHashBytes(certPath: string): Promise<ArrayBuffer> {
  const pem = await readFile(certPath, "utf8");
  const matches = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  );
  if (!matches || matches.length === 0) {
    throw new Error(`No certificate found in ${certPath}`);
  }

  const leaf = new X509Certificate(matches[0]);
  const bytes = leaf.fingerprint256
    .split(":")
    .map((hex) => Number.parseInt(hex, 16));
  return Uint8Array.from(bytes).buffer;
}

function summarize(values: number[]): {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  avg: number;
} {
  if (values.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, avg: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    count: sorted.length,
    min: round(sorted[0]),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
    avg: round(sum / sorted.length),
  };
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const idx = (sortedValues.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) {
        return;
      }
      results[current] = await handler(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

function parseIntSafe(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function nowMs(): number {
  return performance.now();
}

async function readWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
