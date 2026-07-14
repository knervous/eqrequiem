import type { AppEnv } from '../config/env.js';
import type { Logger } from '../shared/logger.js';

export class NavService {
  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    this.logger.info('Nav scaffold started', {
      enabled: this.env.features.navWorker,
    });
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.logger.info('Nav scaffold stopped');
    return Promise.resolve();
  }
}
