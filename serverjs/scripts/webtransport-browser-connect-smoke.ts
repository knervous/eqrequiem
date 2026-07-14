import { WebTransport, quicheLoaded } from '@fails-components/webtransport';
import { Agent as HttpAgent } from 'node:http';
import http from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import https from 'node:https';
import { URL } from 'node:url';

type HashResponse = {
  hash: string;
  status: number;
  url: string;
};

const httpsAgent = new HttpsAgent({ rejectUnauthorized: false });
const httpAgent = new HttpAgent();

const env = {
  viteOrigin: process.env.VITE_DEV_ORIGIN ?? 'https://localhost:3500',
  wtHost: process.env.VITE_WT_HOST ?? 'localhost',
  wtPort: Number(process.env.VITE_WT_PORT ?? '443'),
  wtPath: process.env.VITE_WT_PATH ?? '/eq',
  hashTimeoutMs: Number(process.env.WT_BROWSER_HASH_TIMEOUT_MS ?? '3000'),
  connectTimeoutMs: Number(process.env.WT_BROWSER_CONNECT_TIMEOUT_MS ?? '12000'),
};

async function main(): Promise<void> {
  await withTimeout(quicheLoaded, 8000, 'Timed out loading quiche transport');

  const hashResult = await fetchHashViaViteProxy();
  if (!hashResult.hash) {
    throw new Error(
      `Hash endpoint returned empty payload (status=${hashResult.status}) via ${hashResult.url}`,
    );
  }
  console.log('Hash fetch ok', {
    hashUrl: hashResult.url,
    hashStatus: hashResult.status,
    hashLength: hashResult.hash.length,
  });

  const certHashBytes = base64ToArrayBuffer(hashResult.hash);
  const connectUrl = `https://${env.wtHost}:${env.wtPort}${env.wtPath}`;
  console.log('Attempting WebTransport connect', { connectUrl });

  const transport = new WebTransport(connectUrl, {
    serverCertificateHashes: [{ algorithm: 'sha-256', value: certHashBytes }],
    forceReliable: true,
  } as any);

  try {
    await withTimeout(transport.ready, env.connectTimeoutMs, `Timed out connecting to ${connectUrl}`);
    console.log('WebTransport browser-flow connect passed', {
      connectUrl,
      hashUrl: hashResult.url,
      hashStatus: hashResult.status,
      hashLength: hashResult.hash.length,
    });
  } finally {
    transport.close({ closeCode: 0, reason: 'browser-flow smoke complete' });
  }
}

async function fetchHashViaViteProxy(): Promise<HashResponse> {
  const hashUrl =
    `${env.viteOrigin}/api/hash` +
    `?ip=${encodeURIComponent(env.wtHost)}` +
    `&port=${encodeURIComponent(String(env.wtPort))}`;

  const { status, body } = await httpGetText(hashUrl, env.hashTimeoutMs);
  return { hash: body.trim(), status, url: hashUrl };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const raw = Buffer.from(base64, 'base64');
  if (raw.length !== 32) {
    throw new Error(`Expected 32-byte SHA-256 hash, got ${raw.length} bytes`);
  }
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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

async function httpGetText(urlText: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const parsed = new URL(urlText);
  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;
  const agent = isHttps ? httpsAgent : httpAgent;

  return await new Promise((resolve, reject) => {
    const req = client.request(
      parsed,
      {
        method: 'GET',
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', (error) => {
      reject(error);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms (${urlText})`));
    });
    req.end();
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('WebTransport browser-flow connect failed:', message);
  process.exit(1);
});
