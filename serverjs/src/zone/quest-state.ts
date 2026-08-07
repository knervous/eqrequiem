import type {
  QuestItemSnapshot,
  QuestLeadKind,
  QuestLeadPlace,
  QuestStateMigration,
} from "./quest-types.js";

/** One persisted `character_quest_state` row, already parsed. */
export interface QuestStateRecord {
  revision: number;
  state: Record<string, unknown>;
}

export interface QuestLeadRecord {
  readonly leadKey: string;
  readonly kind: QuestLeadKind;
  readonly text: string;
  readonly title: string | null;
  readonly place: QuestLeadPlace | null;
  readonly status: "active" | "resolved";
  readonly order: number;
}

export interface QuestJournalEntry extends QuestLeadRecord {
  readonly questKey: string;
  readonly questTitle: string | null;
  readonly archived: boolean;
}

/** Everything the shard needs about one character to run handlers synchronously. */
export interface QuestCharacterSnapshot {
  readonly characterId: number | null;
  readonly name: string;
  readonly level: number;
  readonly experience: number;
  readonly quests: Readonly<Record<string, QuestStateRecord>>;
  readonly knowledge: Readonly<Record<string, Record<string, unknown>>>;
  readonly inventory: readonly QuestItemSnapshot[];
}

const LEADS_KEY = "leads";
const AWARDS_KEY = "awards";
const ONCE_KEY = "once";
const ARCHIVED_KEY = "archived";
const ORDER_KEY = "leadOrder";

/**
 * Authoritative in-memory quest state for one character on this shard.
 *
 * Every mutator is idempotent and reports whether it actually changed anything, so the
 * owning boundary can persist an effect exactly once even across reconnects, retries
 * and quest hot reloads.
 */
export class QuestCharacterState {
  readonly #quests = new Map<string, QuestStateRecord>();
  readonly #knowledge = new Map<string, Record<string, unknown>>();
  #inventory: readonly QuestItemSnapshot[];
  #experience: number;
  #level: number;

  constructor(
    readonly sessionId: number,
    snapshot: QuestCharacterSnapshot,
  ) {
    this.characterId = snapshot.characterId;
    this.name = snapshot.name;
    this.#level = snapshot.level;
    this.#experience = snapshot.experience;
    this.#inventory = snapshot.inventory;
    for (const [questKey, record] of Object.entries(snapshot.quests)) {
      this.#quests.set(questKey, {
        revision: record.revision,
        state: { ...record.state },
      });
    }
    for (const [key, data] of Object.entries(snapshot.knowledge)) {
      this.#knowledge.set(key, { ...data });
    }
  }

  readonly characterId: number | null;
  readonly name: string;

  get level(): number { return this.#level; }
  get experience(): number { return this.#experience; }
  get inventory(): readonly QuestItemSnapshot[] { return this.#inventory; }

  setInventory(items: readonly QuestItemSnapshot[]): void {
    this.#inventory = items;
  }

  setProgression(experience: number, level: number): void {
    this.#experience = experience;
    this.#level = level;
  }

  addExperience(amount: number): void {
    this.#experience = Math.max(0, this.#experience + amount);
  }

  /**
   * Runs the authored migration once per shard load when persisted state predates the
   * current quest revision. State is never silently reset because code changed.
   */
  ensureRevision(
    questKey: string,
    revision: number,
    migrate: QuestStateMigration | undefined,
  ): QuestStateRecord {
    const current = this.#quests.get(questKey);
    if (!current) {
      const created: QuestStateRecord = { revision, state: {} };
      this.#quests.set(questKey, created);
      return created;
    }
    if (current.revision >= revision) return current;
    const migrated = migrate
      ? migrate({ ...current.state }, current.revision)
      : current.state;
    const next: QuestStateRecord = { revision, state: migrated };
    this.#quests.set(questKey, next);
    return next;
  }

  state(questKey: string): Readonly<Record<string, unknown>> {
    return this.#quests.get(questKey)?.state ?? {};
  }

  revision(questKey: string): number {
    return this.#quests.get(questKey)?.revision ?? 0;
  }

  /** Returns the subset of `patch` that actually changed. */
  patch(
    questKey: string,
    patch: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> | null {
    const record = this.#quests.get(questKey) ?? this.ensureRevision(questKey, 0, undefined);
    const changed: Record<string, unknown> = {};
    let dirty = false;
    for (const [key, value] of Object.entries(patch)) {
      if (equal(record.state[key], value)) continue;
      record.state[key] = value;
      changed[key] = value;
      dirty = true;
    }
    return dirty ? changed : null;
  }

  knows(key: string): boolean {
    return this.#knowledge.has(key);
  }

  knowledgeKeys(): readonly string[] {
    return [...this.#knowledge.keys()];
  }

  learn(key: string, data: Record<string, unknown> | undefined): boolean {
    if (this.#knowledge.has(key)) return false;
    this.#knowledge.set(key, data ? { ...data } : {});
    return true;
  }

  forget(key: string): boolean {
    return this.#knowledge.delete(key);
  }

  hasLead(questKey: string, leadKey: string): boolean {
    return this.leads(questKey).some((lead) => lead.leadKey === leadKey);
  }

  leads(questKey: string): readonly QuestLeadRecord[] {
    const raw = this.#quests.get(questKey)?.state[LEADS_KEY];
    if (!isRecord(raw)) return [];
    return Object.entries(raw)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .map(([leadKey, lead]) => ({
        leadKey,
        kind: (lead.kind as QuestLeadKind | undefined) ?? "observation",
        text: typeof lead.text === "string" ? lead.text : "",
        title: typeof lead.title === "string" ? lead.title : null,
        place: (lead.place as QuestLeadPlace | undefined) ?? null,
        status: lead.status === "resolved" ? "resolved" as const : "active" as const,
        order: typeof lead.order === "number" ? lead.order : 0,
      }))
      .sort((left, right) => left.order - right.order);
  }

  /** Returns the assigned discovery order, or null when the lead was already known. */
  discoverLead(
    questKey: string,
    leadKey: string,
    lead: {
      readonly kind: QuestLeadKind;
      readonly text: string;
      readonly title: string | null;
      readonly place: QuestLeadPlace | null;
    },
  ): number | null {
    const record = this.#quests.get(questKey) ?? this.ensureRevision(questKey, 0, undefined);
    const leads = mutableRecord(record.state, LEADS_KEY);
    if (isRecord(leads[leadKey])) return null;
    const order = Number(record.state[ORDER_KEY] ?? 0) + 1;
    record.state[ORDER_KEY] = order;
    record.state[ARCHIVED_KEY] = false;
    leads[leadKey] = { ...lead, status: "active", order };
    return order;
  }

  resolveLead(questKey: string, leadKey: string, text: string | null): boolean {
    const record = this.#quests.get(questKey);
    if (!record) return false;
    const leads = mutableRecord(record.state, LEADS_KEY);
    const lead = leads[leadKey];
    if (!isRecord(lead) || lead.status === "resolved") return false;
    lead.status = "resolved";
    if (text !== null) lead.text = text;
    return true;
  }

  archive(questKey: string): boolean {
    const record = this.#quests.get(questKey);
    if (!record || record.state[ARCHIVED_KEY] === true) return false;
    record.state[ARCHIVED_KEY] = true;
    return true;
  }

  archived(questKey: string): boolean {
    return this.#quests.get(questKey)?.state[ARCHIVED_KEY] === true;
  }

  granted(questKey: string, awardKey: string): boolean {
    const awards = this.#quests.get(questKey)?.state[AWARDS_KEY];
    return isRecord(awards) && awards[awardKey] === true;
  }

  grant(questKey: string, awardKey: string): boolean {
    const record = this.#quests.get(questKey) ?? this.ensureRevision(questKey, 0, undefined);
    const awards = mutableRecord(record.state, AWARDS_KEY);
    if (awards[awardKey] === true) return false;
    awards[awardKey] = true;
    return true;
  }

  /** Backs the `oncePerPlayer` handler option. */
  markHandlerFired(questKey: string, handlerKey: string): boolean {
    const record = this.#quests.get(questKey) ?? this.ensureRevision(questKey, 0, undefined);
    const once = mutableRecord(record.state, ONCE_KEY);
    if (once[handlerKey] === true) return false;
    once[handlerKey] = true;
    return true;
  }

  handlerFired(questKey: string, handlerKey: string): boolean {
    const once = this.#quests.get(questKey)?.state[ONCE_KEY];
    return isRecord(once) && once[handlerKey] === true;
  }

  questKeys(): readonly string[] {
    return [...this.#quests.keys()];
  }

  journal(titles: ReadonlyMap<string, string | null> = new Map()): readonly QuestJournalEntry[] {
    const entries: QuestJournalEntry[] = [];
    for (const questKey of this.#quests.keys()) {
      const archived = this.archived(questKey);
      for (const lead of this.leads(questKey)) {
        entries.push({
          ...lead,
          questKey,
          questTitle: titles.get(questKey) ?? null,
          archived,
        });
      }
    }
    return entries;
  }

  /** The persistable projection of everything this character owns on the shard. */
  snapshot(): QuestCharacterSnapshot {
    return {
      characterId: this.characterId,
      name: this.name,
      level: this.#level,
      experience: this.#experience,
      quests: Object.fromEntries(
        [...this.#quests].map(([key, record]) => [key, {
          revision: record.revision,
          state: { ...record.state },
        }]),
      ),
      knowledge: Object.fromEntries(
        [...this.#knowledge].map(([key, data]) => [key, { ...data }]),
      ),
      inventory: this.#inventory,
    };
  }
}

/**
 * Journal view of a loaded record, for boundaries that have a snapshot but no shard
 * (zone entry, offline tooling).
 */
export function journalFromState(
  snapshot: QuestCharacterSnapshot,
  titles: ReadonlyMap<string, string | null> = new Map(),
): readonly QuestJournalEntry[] {
  return new QuestCharacterState(0, snapshot).journal(titles);
}

export function emptyCharacterSnapshot(
  overrides: Partial<QuestCharacterSnapshot> = {},
): QuestCharacterSnapshot {
  return {
    characterId: null,
    name: "",
    level: 1,
    experience: 0,
    quests: {},
    knowledge: {},
    inventory: [],
    ...overrides,
  };
}

function mutableRecord(
  state: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = state[key];
  if (isRecord(current)) return current;
  const created: Record<string, unknown> = {};
  state[key] = created;
  return created;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (left === null || right === null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
