import { parentPort, workerData } from "node:worker_threads";

import { createNodeDatabase } from "../db/node/factory.js";
import { GameDatabase } from "./game-database.js";
import { CharacterRosterService } from "./character-roster-service.js";
import { ZoneSessionService } from "./zone-session-service.js";
import type {
  PersistCommand,
  PersistRequestEnvelope,
  PersistResponseEnvelope,
} from "./types.js";

const port = parentPort;
if (!port) process.exit(1);
const workerPort = port;
const runtimeUrl =
  (workerData as { runtimeUrl?: string; contentUrl?: string } | null)?.runtimeUrl ??
  process.env.RUNTIME_DATABASE_URL ??
  "sqlite:./data/runtime-db.sqlite";
const contentUrl =
  (workerData as { contentUrl?: string } | null)?.contentUrl ??
  process.env.CONTENT_DATABASE_URL ??
  "sqlite:./data/content-db.sqlite";
const servicesPromise = initializeServices(runtimeUrl, contentUrl);
let commandQueue: Promise<void> = Promise.resolve();

workerPort.on("message", (envelope: PersistRequestEnvelope) => {
  const command = commandQueue.then(async () => {
    try {
      const response = await handleCommand(
        envelope.requestId,
        envelope.command,
        await servicesPromise,
      );
      workerPort.postMessage(response);
    } catch (error) {
      workerPort.postMessage({
        requestId: envelope.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PersistResponseEnvelope);
    }
  });
  commandQueue = command.then(() => undefined, () => undefined);
});

interface PersistWorkerServices {
  readonly roster: CharacterRosterService;
  readonly zones: ZoneSessionService;
}

async function initializeServices(
  runtimeUrl: string,
  contentUrl: string,
): Promise<PersistWorkerServices> {
  const database = new GameDatabase(
    createNodeDatabase(runtimeUrl),
    createNodeDatabase(contentUrl),
  );
  const roster = new CharacterRosterService(database);
  await roster.initialize();
  return { roster, zones: new ZoneSessionService(database) };
}

async function handleCommand(
  requestId: number,
  command: PersistCommand,
  services: PersistWorkerServices,
): Promise<PersistResponseEnvelope> {
  const { roster, zones } = services;
  switch (command.type) {
    case "login_load": {
      const data = await roster.login(command.token);
      return {
        requestId,
        ok: true,
        result: {
          type: "login_load",
          data,
        },
      };
    }
    case "character_create": {
      const data = await roster.createCharacter(command.accountId, command.character);
      return {
        requestId,
        ok: true,
        result: {
          type: "character_create",
          data,
        },
      };
    }
    case "character_delete": {
      const data = await roster.deleteCharacter(command.accountId, command.name);
      return {
        requestId,
        ok: true,
        result: {
          type: "character_delete",
          data,
        },
      };
    }
    case "character_enter_world": {
      const entered = await roster.enterWorld(command.name);
      return {
        requestId,
        ok: true,
        result: {
          type: "character_enter_world",
          data: {
            ok: entered.character !== null,
            characterId: entered.character ? Number(entered.character.id) : null,
            name: entered.character?.name ?? null,
            demoStartPending: entered.demoStartPending,
          },
        },
      };
    }
    case "zone_session_resolve": {
      const data = await zones.resolve(
        command.zoneId,
        command.instanceId,
        command.demoStartPending,
      );
      return {
        requestId,
        ok: true,
        result: { type: "zone_session_resolve", data },
      };
    }
  }
}
