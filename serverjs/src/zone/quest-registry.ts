import type {
  QuestDefinition,
  QuestHandlerDefinition,
  QuestRegistrationTarget,
} from "./quest-types.js";

export interface ZoneQuestIdentity {
  readonly id: number;
  readonly shortName: string;
}

/**
 * Code-owned quest registrations for one zone, mirroring Go's
 * ZoneQuestInterface. A fresh registry is constructed for every zone module.
 */
export class ZoneQuestRegistry {
  readonly #handlers: QuestHandlerDefinition<any>[] = [];

  constructor(readonly zone: ZoneQuestIdentity) {}

  registerZone(...handlers: readonly QuestHandlerDefinition<any>[]): this {
    return this.register({ kind: "zone" }, handlers);
  }

  registerNpc(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    return this.register({ kind: "npc", name }, handlers);
  }

  registerItem(id: number, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    return this.register({ kind: "item", id }, handlers);
  }

  registerCustom(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    return this.register({ kind: "custom", name }, handlers);
  }

  definition(): QuestDefinition {
    const handlers = [...this.#handlers].sort((left, right) =>
      targetOrder(left.target) - targetOrder(right.target));
    return {
      id: `zone:${this.zone.shortName}`,
      zoneIds: [this.zone.id],
      handlers,
    };
  }

  private register(
    target: QuestRegistrationTarget,
    handlers: readonly QuestHandlerDefinition<any>[],
  ): this {
    for (const handler of handlers) {
      this.#handlers.push({
        ...handler,
        target,
        ...(target.kind === "npc" ? { npcName: target.name } : {}),
      });
    }
    return this;
  }
}

function targetOrder(target: QuestRegistrationTarget | undefined): number {
  return target?.kind === "zone" ? 0 : 1;
}
