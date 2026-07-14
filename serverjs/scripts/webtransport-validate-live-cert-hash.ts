import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import tls from 'node:tls';

const env = {
  wtHost: process.env.WT_HOST ?? 'localhost',
  wtPort: Number(process.env.WT_PORT ?? '443'),
  hashUrl: process.env.WT_HASH_URL ?? 'http://localhost:8082/hash',
  timeoutMs: Number(process.env.WT_VALIDATE_TIMEOUT_MS ?? '5000'),
};

async function main(): Promise<void> {
  const [hashFromApi, certFromServer] = await Promise.all([
    fetchHash(env.hashUrl, env.timeoutMs),
    fetchTlsLeafCert(env.wtHost, env.wtPort, env.timeoutMs),
  ]);

  const hashFromTls = createHash('sha256').update(certFromServer.raw).digest('base64');
  const matched = hashFromApi === hashFromTls;

  console.log('WT cert/hash validation', {
    host: env.wtHost,
    port: env.wtPort,
    hashUrl: env.hashUrl,
    hashFromApi,
    hashFromTls,
    matched,
    subject: certFromServer.subject?.CN ?? '(unknown)',
  });

  if (!matched) {
    process.exit(1);
  }
}

async function fetchHash(urlText: string, timeoutMs: number): Promise<string> {
  const isHttps = urlText.startsWith('https://');
  const reqFn = isHttps ? httpsRequest : httpRequest;

  return await new Promise<string>((resolve, reject) => {
    const req = reqFn(
      urlText,
      {
        method: 'GET',
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out GET ${urlText}`)));
    req.end();
  });
}

async function fetchTlsLeafCert(host: string, port: number, timeoutMs: number): Promise<tls.PeerCertificate> {
  const isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return await new Promise<tls.PeerCertificate>((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: isIpHost ? undefined : host,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        socket.end();
        if (!cert || !cert.raw) {
          reject(new Error('No peer certificate from WebTransport endpoint'));
          return;
        }
        resolve(cert);
      },
    );
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`Timed out TLS connect ${host}:${port}`)));
    socket.on('error', reject);
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
