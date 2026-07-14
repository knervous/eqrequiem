import { parentPort, workerData } from "node:worker_threads";

import { createNodeDatabase } from "../db/node/factory.js";
import { GameRepository } from "./repository.js";
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
const repositoryPromise = initializeRepository(runtimeUrl, contentUrl);

workerPort.on("message", async (envelope: PersistRequestEnvelope) => {
  try {
    const response = await handleCommand(
      envelope.requestId,
      envelope.command,
      await repositoryPromise,
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

async function initializeRepository(runtimeUrl: string, contentUrl: string): Promise<GameRepository> {
  const repository = new GameRepository(createNodeDatabase(runtimeUrl), createNodeDatabase(contentUrl));
  await repository.initialize();
  return repository;
}

async function handleCommand(
  requestId: number,
  command: PersistCommand,
  repository: GameRepository,
): Promise<PersistResponseEnvelope> {
  switch (command.type) {
    case "login_load": {
      const accountId = await repository.getOrCreateAccount(command.token.trim() || "guest");
      return {
        requestId,
        ok: true,
        result: {
          type: "login_load",
          data: { accountId, characters: await repository.listCharacters(accountId) },
        },
      };
    }
    case "character_create": {
      const ok = await repository.createCharacter(command.accountId, command.character);
      return {
        requestId,
        ok: true,
        result: {
          type: "character_create",
          data: { ok, characters: await repository.listCharacters(command.accountId) },
        },
      };
    }
    case "character_delete": {
      const ok = await repository.deleteCharacter(command.accountId, command.name);
      return {
        requestId,
        ok: true,
        result: {
          type: "character_delete",
          data: { ok, characters: await repository.listCharacters(command.accountId) },
        },
      };
    }
    case "inventory_move": {
      const moves = await repository.moveItem(command);
      return { requestId, ok: true, result: { type: "inventory_move", data: { ok: true, moves } } };
    }
    case "inventory_delete":
      await repository.deleteItem(command);
      return { requestId, ok: true, result: { type: "inventory_delete", data: { ok: true } } };
  }
}
