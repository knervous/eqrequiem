import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";

import { WebTransport, quicheLoaded } from "@fails-components/webtransport";

import { BackendApp } from "../src/app.js";
import { readEnv } from "../src/config/env.js";
import { decodePacket, encodePacket } from "../src/protocol/index.js";
import { OP } from "../src/protocol/opcodes.js";
import {
  encodeSidecar,
  decodeSidecar,
  SIDECAR_SCHEMA,
} from "../src/protocol/sidecar-codec.js";
import { createLogger } from "../src/shared/logger.js";

async function main(): Promise<void> {
  const rawEnv = {
    ...process.env,
    WT_HOST: process.env.WT_HOST ?? "localhost",
    WT_PORT: process.env.WT_PORT ?? "443",
    HTTP_HOST: process.env.HTTP_HOST ?? "localhost",
    HTTP_PORT: process.env.HTTP_PORT ?? "18080",
    LIBRA_ENABLED: process.env.LIBRA_ENABLED ?? "false",
    FEATURE_PERSIST_WORKER: process.env.FEATURE_PERSIST_WORKER ?? "false",
    FEATURE_NAV_WORKER: process.env.FEATURE_NAV_WORKER ?? "false",
  };

  const env = readEnv(rawEnv);
  const logger = createLogger("info");
  const app = new BackendApp(env, logger);

  await app.start();

  try {
    await readWithTimeout(
      quicheLoaded,
      5000,
      "Timed out waiting for quiche to load",
    );

    const certHashBytes = await loadLeafCertHashBytes(env.transport.certPath);
    const transport = new WebTransport(
      `https://${env.transport.host}:${env.transport.port}${env.transport.path}`,
      {
        serverCertificateHashes: [
          {
            algorithm: "sha-256",
            value: certHashBytes,
          },
        ],
        // Keep smoke deterministic in Node by preferring the reliable transport path.
        forceReliable: true,
      } as any,
    );

    await readWithTimeout(
      transport.ready,
      15000,
      "Timed out waiting for WebTransport client readiness",
    );

    const writer = transport.datagrams.writable.getWriter();
    const reader = transport.datagrams.readable.getReader();

    try {
      const jwtPayload = encodeSidecar(SIDECAR_SCHEMA.JWT_LOGIN, {
        token: "headless-smoke-token",
      });
      await readWithTimeout(
        writer.write(encodePacket(OP.JWT_LOGIN, jwtPayload)),
        5000,
        "Timed out writing JWT_LOGIN frame",
      );

      const jwtResponsePayload = await readOpcodePayload(
        reader,
        OP.JWT_RESPONSE,
        5000,
      );
      const jwtStatus = decodeIntPayload(jwtResponsePayload);
      if (!Number.isFinite(jwtStatus)) {
        throw new Error("JWT response payload decode failed");
      }

      const zonePayload = encodeSidecar(SIDECAR_SCHEMA.ZONE_SESSION, {
        zoneId: 2,
        instanceId: 0,
      });
      await readWithTimeout(
        writer.write(encodePacket(OP.ZONE_SESSION, zonePayload)),
        5000,
        "Timed out writing ZONE_SESSION frame",
      );

      const zoneResponsePayload = await readOpcodePayload(
        reader,
        OP.ZONE_SESSION_VALID,
        5000,
      );
      const zoneStatus = decodeIntPayload(zoneResponsePayload);
      if (zoneStatus !== 1) {
        throw new Error(`Zone response invalid: ${zoneStatus}`);
      }

      console.log("WebTransport smoke passed", {
        gateway: `${env.transport.host}:${env.transport.port}${env.transport.path}`,
        jwtStatus,
        zoneStatus,
      });
    } finally {
      reader.releaseLock();
      writer.releaseLock();
      transport.close({ closeCode: 0, reason: "smoke done" });
    }
  } finally {
    await readWithTimeout(app.stop(), 5000, "Timed out stopping backend app");
  }
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
    if (!decoded) {
      continue;
    }

    if (decoded.opcode === opcode) {
      return decoded.payload;
    }
  }

  throw new Error(`Stream closed while waiting for opcode ${opcode}`);
}

function decodeIntPayload(payload: Uint8Array): number {
  return (
    decodeSidecar<{ status: number }>(SIDECAR_SCHEMA.JWT_RESPONSE, payload)
      ?.status ??
    decodeSidecar<{ value: number }>(SIDECAR_SCHEMA.INT, payload)?.value ??
    Number.NaN
  );
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
