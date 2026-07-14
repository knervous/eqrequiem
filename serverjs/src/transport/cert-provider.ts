import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import type { AppEnv } from '../config/env.js';
import type { Logger } from '../shared/logger.js';

export interface TransportCertMaterial {
  certPem: string;
  keyPem: string;
  hashBase64: string;
  source: 'file' | 'ephemeral';
}

export class TransportCertProvider {
  private loadPromise: Promise<TransportCertMaterial> | null = null;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {}

  async getMaterial(): Promise<TransportCertMaterial> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadMaterial();
    }
    return this.loadPromise;
  }

  private async loadMaterial(): Promise<TransportCertMaterial> {
    const mode = (process.env.WT_CERT_MODE ?? 'ephemeral').trim().toLowerCase();
    const material = mode === 'ephemeral'
      ? await this.generateEphemeralMaterial()
      : await this.readFileMaterial();

    this.logger.info('Transport cert material loaded', {
      mode: material.source,
      hashBase64: material.hashBase64,
      certPath: material.source === 'file' ? this.env.transport.certPath : '(ephemeral)',
    });

    return material;
  }

  private async readFileMaterial(): Promise<TransportCertMaterial> {
    const certPem = await readFile(this.env.transport.certPath, 'utf8');
    const keyPem = await readFile(this.env.transport.keyPath, 'utf8');
    return {
      certPem,
      keyPem,
      hashBase64: hashCertPem(certPem),
      source: 'file',
    };
  }

  private async generateEphemeralMaterial(): Promise<TransportCertMaterial> {
    const tempDir = await mkdtemp(join(tmpdir(), 'wt-cert-'));
    const certPath = join(tempDir, 'cert.pem');
    const keyPath = join(tempDir, 'key.pem');
    const csrPath = join(tempDir, 'cert.csr');
    const extPath = join(tempDir, 'openssl-ext.cnf');
    try {
      // WebTransport custom-certificate mode requires a short-lived cert.
      // Match the Go server behavior (10 days) and stay under the 14-day limit.
      const days = process.env.WT_CERT_DAYS ?? '10';
      const extConfig = [
        '[req]',
        'distinguished_name = req_distinguished_name',
        'prompt = no',
        '',
        '[req_distinguished_name]',
        'CN = localhost',
        '',
        '[v3_req]',
        'basicConstraints = critical,CA:FALSE',
        'keyUsage = critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage = serverAuth',
        'subjectAltName = @alt_names',
        '',
        '[alt_names]',
        'DNS.1 = localhost',
        'IP.1 = 127.0.0.1',
        'IP.2 = ::1',
        '',
      ].join('\n');
      await writeFile(extPath, extConfig, 'utf8');

      await runCommand('openssl', [
        'req',
        '-new',
        '-nodes',
        '-newkey',
        'rsa:2048',
        '-keyout',
        keyPath,
        '-out',
        csrPath,
        '-sha256',
        '-config',
        extPath,
      ]);

      await runCommand('openssl', [
        'x509',
        '-req',
        '-in',
        csrPath,
        '-signkey',
        keyPath,
        '-out',
        certPath,
        '-sha256',
        '-days',
        days,
        '-extensions',
        'v3_req',
        '-extfile',
        extPath,
      ]);

      const certPem = await readFile(certPath, 'utf8');
      const keyPem = await readFile(keyPath, 'utf8');
      return {
        certPem,
        keyPem,
        hashBase64: hashCertPem(certPem),
        source: 'ephemeral',
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function hashCertPem(certPem: string): string {
  const der = readFirstCertDerFromPem(certPem);
  return createHash('sha256').update(der).digest('base64');
}

function readFirstCertDerFromPem(pem: string): Buffer {
  const match = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!match || !match[1]) {
    throw new Error('CERTIFICATE block not found in transport cert PEM');
  }

  const base64 = match[1].replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}
