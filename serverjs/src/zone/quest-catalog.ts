import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import type { Logger } from "../shared/logger.js";
import type { QuestDefinition } from "./quest-types.js";
import { BUILTIN_QUESTS } from "./builtin-quests.js";

const Point = z.object({ x: z.number(), y: z.number(), z: z.number() });
const NpcIndex = z.union([z.number().int().nonnegative(), z.literal("event")]);
const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_npc_target"), npcIndex: NpcIndex, x: z.number(), y: z.number(), z: z.number() }),
  z.object({ type: z.literal("cycle_npc_target"), npcIndex: NpcIndex, points: z.array(Point).min(1) }),
  z.object({ type: z.literal("npc_say"), npcName: z.union([z.string().min(1), z.literal("event")]), message: z.string() }),
  z.object({ type: z.literal("log"), message: z.string() }),
]);
const Quest = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  zoneIds: z.array(z.number().int().nonnegative()).min(1),
  handlers: z.array(z.object({
    event: z.enum([
      "zone_start", "npc_spawn", "npc_tick", "player_enter", "say", "signal",
      "item_click", "item_tick", "custom",
    ]),
    everyTicks: z.number().int().positive().optional(),
    messageIncludes: z.string().optional(),
    signal: z.string().optional(),
    npcName: z.string().min(1).optional(),
    actions: z.array(Action),
  })),
});

export class QuestCatalog {
  private definitions: QuestDefinition[] = [];
  private revision = 0;
  private watcher: FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

  constructor(
    directory: string,
    private readonly development: boolean,
    private readonly logger: Logger,
    private readonly onUpdate: (definitions: readonly QuestDefinition[], revision: number) => void,
  ) {
    this.directory = resolve(directory);
  }

  private readonly directory: string;

  async start(): Promise<void> {
    await this.reload();
    if (!this.development) return;
    this.watcher = watch(this.directory, () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => void this.safeReload(), 75);
    });
    this.logger.info("Quest hot reload enabled", { directory: this.directory });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
  }

  async reload(): Promise<void> {
    const files = (await readdir(this.directory)).filter((name) => name.endsWith(".quest.json")).sort();
    const next: QuestDefinition[] = [];
    for (const file of files) {
      const value: unknown = JSON.parse(await readFile(resolve(this.directory, file), "utf8"));
      next.push(Quest.parse(value) as QuestDefinition);
    }
    const ids = new Set(BUILTIN_QUESTS.map((definition) => definition.id));
    for (const definition of next) {
      if (ids.has(definition.id)) throw new Error(`duplicate quest id: ${definition.id}`);
      ids.add(definition.id);
    }
    this.definitions = next;
    this.revision += 1;
    this.onUpdate(this.definitions, this.revision);
    this.logger.info("Quest catalog loaded", { revision: this.revision, questCount: next.length });
  }

  private async safeReload(): Promise<void> {
    try {
      await this.reload();
    } catch (error) {
      this.logger.warn("Quest hot reload rejected; retaining previous revision", {
        error: error instanceof Error ? error.message : String(error),
        revision: this.revision,
      });
    }
  }

  status(): { directory: string; revision: number; quests: Array<{ id: string; zoneIds: number[] }> } {
    return {
      directory: this.directory,
      revision: this.revision,
      quests: [...BUILTIN_QUESTS, ...this.definitions].map(({ id, zoneIds }) => ({ id, zoneIds })),
    };
  }
}
