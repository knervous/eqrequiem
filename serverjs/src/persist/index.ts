import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { AppEnv } from '../config/env.js';
import type { Logger } from '../shared/logger.js';
import type {
  PersistCommand,
  PersistCreateCharacterResult,
  PersistDeleteCharacterResult,
  PersistEnterWorldResult,
  PersistZoneSessionResult,
  PersistLoginResult,
  PersistRequestEnvelope,
  PersistResponseEnvelope,
  PersistResult,
} from './types.js';
import type { BackendCharacterCreate } from '../backend/contracts.js';

interface PendingRequest {
  resolve: (value: PersistResult) => void;
  reject: (reason: Error) => void;
}

export class PersistService {
  private worker: Worker | null = null;
  private requestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    if (!this.env.features.persistWorker) {
      this.logger.info('Persist worker disabled via feature flag');
      return Promise.resolve();
    }

    const worker = this.createWorker();
    worker.on('message', (message: PersistResponseEnvelope) => {
      this.handleWorkerMessage(message);
    });
    worker.on('error', (error: unknown) => {
      this.logger.error('Persist worker crashed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    worker.on('exit', (code) => {
      this.logger.info('Persist worker exited', { code });
      this.worker = null;
    });

    this.worker = worker;
    this.logger.info('Persist worker started');
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (!this.worker) {
      this.logger.info('Persist scaffold stopped');
      return;
    }

    const outstanding = [...this.pending.values()];
    this.pending.clear();
    for (const request of outstanding) {
      request.reject(new Error('persist service shutting down'));
    }

    await this.worker.terminate();
    this.worker = null;
    this.logger.info('Persist scaffold stopped');
  }

  loginLoad(token: string): Promise<PersistLoginResult> {
    return this.sendCommand({ type: 'login_load', token }).then((result) => {
      if (result.type !== 'login_load') {
        throw new Error(`unexpected persist result ${result.type}`);
      }
      return result.data;
    });
  }

  createCharacter(accountId: number, character: BackendCharacterCreate): Promise<PersistCreateCharacterResult> {
    return this.sendCommand({ type: 'character_create', accountId, character }).then((result) => {
      if (result.type !== 'character_create') {
        throw new Error(`unexpected persist result ${result.type}`);
      }
      return result.data;
    });
  }

  deleteCharacter(accountId: number, name: string): Promise<PersistDeleteCharacterResult> {
    return this.sendCommand({ type: 'character_delete', accountId, name }).then((result) => {
      if (result.type !== 'character_delete') {
        throw new Error(`unexpected persist result ${result.type}`);
      }
      return result.data;
    });
  }

  enterWorld(name: string): Promise<PersistEnterWorldResult> {
    return this.sendCommand({ type: "character_enter_world", name }).then(
      (result) => {
        if (result.type !== "character_enter_world") {
          throw new Error(`unexpected persist result ${result.type}`);
        }
        return result.data;
      },
    );
  }

  resolveZoneSession(
    zoneId: number | string,
    instanceId: number,
    demoStartPending: boolean,
  ): Promise<PersistZoneSessionResult> {
    return this.sendCommand({
      type: "zone_session_resolve",
      zoneId,
      instanceId,
      demoStartPending,
    }).then((result) => {
      if (result.type !== "zone_session_resolve") {
        throw new Error(`unexpected persist result ${result.type}`);
      }
      return result.data;
    });
  }

  private sendCommand(command: PersistCommand): Promise<PersistResult> {
    if (!this.worker) {
      return Promise.reject(new Error('persist worker is not running'));
    }

    const requestId = this.requestId++;
    const envelope: PersistRequestEnvelope = { requestId, command };

    return new Promise<PersistResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
      });

      this.worker?.postMessage(envelope);
    });
  }

  private handleWorkerMessage(response: PersistResponseEnvelope): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(response.requestId);

    if (!response.ok || !response.result) {
      pending.reject(new Error(response.error ?? 'persist request failed'));
      return;
    }

    pending.resolve(response.result);
  }

  private createWorker(): Worker {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const workerJsPath = join(moduleDir, 'worker.js');

    if (existsSync(workerJsPath)) {
      return new Worker(new URL('./worker.js', import.meta.url), {
        workerData: { runtimeUrl: this.env.db.runtimeUrl, contentUrl: this.env.db.contentUrl },
      });
    }

    const workerTsPath = join(moduleDir, 'worker.ts');
    if (existsSync(workerTsPath)) {
      return new Worker(workerTsPath, {
        execArgv: process.execArgv,
        workerData: { runtimeUrl: this.env.db.runtimeUrl, contentUrl: this.env.db.contentUrl },
      });
    }

    throw new Error('Persist worker file not found (expected worker.js or worker.ts)');
  }
}
