import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const SDCPP_RELEASE = 'master-652-92dc726';
export const SDCPP_COMMIT = '92dc7268fc4ffb0c0cc0bd52dfcefea91326e797';
export const SDCPP_SOURCE = path.join(repositoryRoot, '.local', 'stable-diffusion.cpp');
export const SDCPP_BUILD = path.join(SDCPP_SOURCE, 'build');
export const SDCPP_BINARY = path.join(SDCPP_BUILD, 'bin', 'sd-server');
export const DEFAULT_MODEL = path.join(
  os.homedir(),
  'ComfyUI',
  'models',
  'checkpoints',
  'RealVisXL_V5.0_fp16.safetensors',
);

export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function runProcess(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

export class SdCppServer {
  constructor({
    binary = process.env.SDCPP_BIN ?? process.env.SDCPP_BINARY ?? SDCPP_BINARY,
    model = process.env.ICON_AI_MODEL_PATH ?? DEFAULT_MODEL,
    host = '127.0.0.1',
    port = 7860,
    quiet = false,
  } = {}) {
    this.binary = binary;
    this.model = model;
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
    this.quiet = quiet;
    this.child = null;
    this.recentLogs = [];
  }

  async start({ timeoutMs = 300_000 } = {}) {
    if (!(await exists(this.binary))) throw new Error(`sd-server is not built: ${this.binary}`);
    if (!(await exists(this.model))) throw new Error(`Local model not found: ${this.model}`);
    this.child = spawn(
      this.binary,
      ['--model', this.model, '--listen-ip', this.host, '--listen-port', String(this.port)],
      // sd-server uses stdin EOF as its shutdown signal, so keep the pipe open
      // for the lifetime of the managed child.
      { cwd: path.dirname(this.binary), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const capture = (chunk) => {
      const message = chunk.toString();
      if (!this.quiet || /\[(?:WARN|ERROR)\]/.test(message)) process.stderr.write(message);
      this.recentLogs.push(message);
      if (this.recentLogs.length > 80) this.recentLogs.shift();
    };
    this.child.stdout.on('data', capture);
    this.child.stderr.on('data', capture);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null) {
        throw new Error(`sd-server stopped during startup\n${this.recentLogs.join('').slice(-4_000)}`);
      }
      try {
        const response = await fetch(`${this.baseUrl}/sdapi/v1/options`);
        if (response.ok) return this;
      } catch {
        // The loopback socket is unavailable while the model is loading.
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    await this.stop();
    throw new Error(`sd-server was not ready after ${timeoutMs}ms`);
  }

  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) =>
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
          resolve();
        }, 8_000),
      ),
    ]);
  }
}
