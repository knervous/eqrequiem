import { BackendApp } from './app.js';
import { readEnv } from './config/env.js';
import { registerShutdownHooks } from './runtime/shutdown.js';
import { createLogger } from './shared/logger.js';

const env = readEnv();
const logger = createLogger(env.logLevel);
const app = new BackendApp(env, logger);

registerShutdownHooks(app, logger);

await app.start();
