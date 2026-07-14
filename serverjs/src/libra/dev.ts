import { DbService } from "../db/index.js";
import { createLogger } from "../shared/logger.js";
import { readLibraDevEnv } from "./dev-env.js";
import { LibraService } from "./index.js";

const env = readLibraDevEnv();
const logger = createLogger(env.logLevel);
const databases = new DbService(env, logger);
const libra = new LibraService(env, logger, databases, { mode: "content-sqlite" });
let stopping = false;

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info("Stopping standalone Libra editor", { signal });
  await libra.stop();
  await databases.stop();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void stop(signal).finally(() => process.exit(0)));
}

await databases.start();
await libra.start();
logger.info("Standalone Libra content editor ready", {
  api: `http://${env.http.host}:${env.http.port}/libra`,
  contentDb: env.db.contentUrl,
});
