import type {
  QuestBinding,
  QuestBindingRole,
  QuestBindingVisibility,
  QuestDefinition,
  QuestHandlerDefinition,
  QuestMetadata,
  QuestRegionDefinition,
  QuestRegionShape,
  QuestRegistrationTarget,
  QuestStateMigration,
} from "./quest-types.js";

export interface ZoneQuestIdentity {
  readonly id: number;
  readonly shortName: string;
}

export interface QuestScopeOptions extends QuestMetadata {
  /**
   * Authored state revision. Bump it whenever persisted state changes shape and pair
   * the bump with `migrate`; production quest keys stay stable forever.
   */
  readonly revision?: number;
  readonly migrate?: QuestStateMigration;
}

export interface QuestBindingOptions {
  readonly role?: QuestBindingRole;
  readonly visibility?: QuestBindingVisibility;
  readonly priority?: number;
  readonly requiresKnowledge?: readonly string[];
}

export interface QuestManifestEntry {
  readonly questKey: string;
  readonly revision: number;
  readonly zoneId: number;
  readonly zoneShortName: string;
  readonly metadata: QuestMetadata;
  readonly bindings: readonly QuestBinding[];
  readonly regions: readonly QuestRegionDefinition[];
  readonly events: readonly string[];
}

/**
 * One authored quest. The scope owns quest identity, so persisted character state,
 * journal identity and discoverability metadata all line up with the same `quest_key`
 * without the journal inventing a second notion of what a quest is.
 */
export class QuestScope {
  readonly #handlers: QuestHandlerDefinition<any>[] = [];
  readonly #bindings: QuestBinding[] = [];
  readonly #regions = new Map<string, QuestRegionDefinition>();

  constructor(
    readonly questKey: string,
    readonly zone: ZoneQuestIdentity,
    private readonly options: QuestScopeOptions = {},
  ) {}

  get revision(): number {
    return this.options.revision ?? 1;
  }

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

  registerRegion(key: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    return this.register({ kind: "region", key }, handlers);
  }

  /** Registers NPC handlers and the discoverability binding they imply in one step. */
  npc(
    name: string,
    binding: QuestBindingOptions,
    ...handlers: readonly QuestHandlerDefinition<any>[]
  ): this {
    this.bind("npc", name, binding);
    return this.registerNpc(name, ...handlers);
  }

  item(
    id: number,
    binding: QuestBindingOptions,
    ...handlers: readonly QuestHandlerDefinition<any>[]
  ): this {
    this.bind("item", String(id), binding);
    return this.registerItem(id, ...handlers);
  }

  region(
    key: string,
    binding: QuestBindingOptions & { readonly shape?: QuestRegionShape; readonly label?: string },
    ...handlers: readonly QuestHandlerDefinition<any>[]
  ): this {
    if (binding.shape) this.defineRegion(key, binding.shape, binding.label);
    this.bind("region", key, binding);
    return this.registerRegion(key, ...handlers);
  }

  defineRegion(key: string, shape: QuestRegionShape, label?: string): this {
    this.#regions.set(key, { key, shape, ...(label === undefined ? {} : { label }) });
    return this;
  }

  bind(
    kind: QuestBinding["kind"],
    key: string,
    options: QuestBindingOptions = {},
  ): this {
    const binding: QuestBinding = {
      kind,
      key,
      role: options.role ?? "source",
      // Hidden by default: an NPC owning quest content is not a reason to mark it.
      visibility: options.visibility ?? "hidden",
      ...(options.priority === undefined ? {} : { priority: options.priority }),
      ...(options.requiresKnowledge === undefined
        ? {}
        : { requiresKnowledge: [...options.requiresKnowledge] }),
    };
    const existing = this.#bindings.findIndex(
      (candidate) =>
        candidate.kind === binding.kind
        && candidate.key === binding.key
        && candidate.role === binding.role,
    );
    if (existing >= 0) this.#bindings[existing] = binding;
    else this.#bindings.push(binding);
    return this;
  }

  bindNpc(name: string, options: QuestBindingOptions = {}): this {
    return this.bind("npc", name, options);
  }

  get bindings(): readonly QuestBinding[] {
    return this.#bindings;
  }

  get regions(): readonly QuestRegionDefinition[] {
    return [...this.#regions.values()];
  }

  definition(): QuestDefinition {
    const handlers = [...this.#handlers].sort((left, right) =>
      targetOrder(left.target) - targetOrder(right.target));
    const { revision: _revision, migrate, ...metadata } = this.options;
    return {
      id: this.questKey,
      zoneIds: [this.zone.id],
      revision: this.revision,
      metadata,
      bindings: [...this.#bindings],
      regions: [...this.#regions.values()],
      ...(migrate === undefined ? {} : { migrate }),
      handlers,
    };
  }

  manifest(): QuestManifestEntry {
    const { revision: _revision, migrate: _migrate, ...metadata } = this.options;
    return {
      questKey: this.questKey,
      revision: this.revision,
      zoneId: this.zone.id,
      zoneShortName: this.zone.shortName,
      metadata,
      bindings: [...this.#bindings],
      regions: this.regions,
      events: [...new Set(this.#handlers.map((handler) => handler.event))],
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
        ...(target.kind === "region" ? { regionKey: handler.regionKey ?? target.key } : {}),
      });
    }
    return this;
  }
}

/**
 * Code-owned quest registrations for one zone, mirroring Go's ZoneQuestInterface.
 * A fresh registry is constructed for every zone module.
 *
 * Registrations made directly on the registry land in the zone's ambient scope
 * (`zone:<shortName>`); authored content should prefer `quests.quest(key)` so its state
 * and journal identity are its own.
 */
export class ZoneQuestRegistry {
  readonly #scopes = new Map<string, QuestScope>();
  readonly #ambient: QuestScope;

  constructor(readonly zone: ZoneQuestIdentity) {
    this.#ambient = new QuestScope(`zone:${zone.shortName}`, zone, { journal: "none" });
  }

  /** Declares (or returns) an authored quest scope inside this zone. */
  quest(key: string, options: QuestScopeOptions = {}): QuestScope {
    const questKey = this.qualify(key);
    const existing = this.#scopes.get(questKey);
    if (existing) return existing;
    const scope = new QuestScope(questKey, this.zone, options);
    this.#scopes.set(questKey, scope);
    return scope;
  }

  /** Alias matching the lighter authoring style in the design doc. */
  scope(key: string, options: QuestScopeOptions = {}): QuestScope {
    return this.quest(key, options);
  }

  get ambient(): QuestScope {
    return this.#ambient;
  }

  registerZone(...handlers: readonly QuestHandlerDefinition<any>[]): this {
    this.#ambient.registerZone(...handlers);
    return this;
  }

  registerNpc(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    this.#ambient.registerNpc(name, ...handlers);
    return this;
  }

  registerItem(id: number, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    this.#ambient.registerItem(id, ...handlers);
    return this;
  }

  registerCustom(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this {
    this.#ambient.registerCustom(name, ...handlers);
    return this;
  }

  defineRegion(key: string, shape: QuestRegionShape, label?: string): this {
    this.#ambient.defineRegion(key, shape, label);
    return this;
  }

  /** The ambient zone definition. Retained for callers that predate quest scopes. */
  definition(): QuestDefinition {
    return this.#ambient.definition();
  }

  definitions(): readonly QuestDefinition[] {
    return [this.#ambient, ...this.#scopes.values()]
      .filter((scope) => scope.definition().handlers.length > 0 || scope.bindings.length > 0)
      .map((scope) => scope.definition());
  }

  scopes(): readonly QuestScope[] {
    return [this.#ambient, ...this.#scopes.values()];
  }

  manifest(): readonly QuestManifestEntry[] {
    return this.scopes()
      .filter((scope) => scope.manifest().events.length > 0 || scope.bindings.length > 0)
      .map((scope) => scope.manifest());
  }

  private qualify(key: string): string {
    const trimmed = key.trim();
    return trimmed.includes(":") ? trimmed : `${this.zone.shortName}:${trimmed}`;
  }
}

function targetOrder(target: QuestRegistrationTarget | undefined): number {
  return target?.kind === "zone" ? 0 : 1;
}
