import { aspectNode } from "../combat/aspects/index.js";
import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import {
  canLearn,
  canPrepare,
  canSpendAspectPoint,
  startingTechniques,
  type AspectRefusal,
  type CharacterTechniqueState,
  type LearnRefusal,
  type PrepareRefusal,
} from "./technique-progression.js";

/**
 * Persistence for the three progression scopes a character owns.
 *
 * The rules live in `technique-progression.ts`; this only stores decisions. Both
 * runtimes call the same methods, and every write validates through the same shared
 * predicate first — a repository that could learn an ineligible technique would make
 * the rules advisory.
 */

interface AbilityRow extends DatabaseRow {
  ability_id: string;
}
interface PreparedRow extends DatabaseRow {
  slot: number;
  ability_id: string;
}
interface AspectRow extends DatabaseRow {
  node_id: string;
  points: number;
}

export class TechniqueRepository {
  constructor(private readonly runtime: DatabaseBackend) {}

  /** Runs one progression request against a single database transaction. */
  transaction<T>(work: (repository: TechniqueRepository) => Promise<T>): Promise<T> {
    return this.runtime.transaction((database) =>
      work(new TechniqueRepository(database))
    );
  }

  /** Loads everything the progression rules need to answer a question. */
  async load(
    characterId: number,
    identity: { readonly level: number; readonly classId: number },
    knowledge: ReadonlySet<string> = new Set(),
  ): Promise<CharacterTechniqueState> {
    const [abilities, prepared, aspects] = await Promise.all([
      this.runtime.query<AbilityRow>(
        "SELECT ability_id FROM character_abilities WHERE character_id = ?",
        [characterId],
      ),
      this.runtime.query<PreparedRow>(
        "SELECT slot, ability_id FROM character_prepared_actions WHERE character_id = ? ORDER BY slot",
        [characterId],
      ),
      this.runtime.query<AspectRow>(
        "SELECT node_id, points FROM character_aspect_points WHERE character_id = ?",
        [characterId],
      ),
    ]);
    return {
      level: identity.level,
      classId: identity.classId,
      knowledge,
      learned: new Set(abilities.rows.map((row) => row.ability_id)),
      prepared: new Map(prepared.rows.map((row) => [Number(row.slot), row.ability_id])),
      aspectPoints: new Map(
        aspects.rows.map((row) => [row.node_id, Number(row.points)]),
      ),
    };
  }

  /**
   * Grants the techniques a class begins with.
   *
   * Called once at creation so a level-1 character is immediately their class — the
   * design is explicit that no class should wait for a trainer to become playable.
   */
  async grantStartingTechniques(characterId: number, classId: number): Promise<string[]> {
    const granted = startingTechniques(classId);
    for (const abilityId of granted) {
      await this.runtime.execute(
        `INSERT INTO character_abilities (character_id, ability_id, source)
         VALUES (?, ?, 'starting') ON CONFLICT DO NOTHING`,
        [characterId, abilityId],
      );
    }
    // Starting techniques go straight onto the bar; an empty hotbar at level 1 is a
    // worse first impression than any loadout decision is worth.
    let slot = 0;
    for (const abilityId of granted) {
      await this.runtime.execute(
        `INSERT INTO character_prepared_actions (character_id, slot, ability_id)
         VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
        [characterId, slot++, abilityId],
      );
    }
    return granted;
  }

  /** Learns a technique. Returns the refusal when the character may not. */
  async learn(
    characterId: number,
    abilityId: string,
    state: CharacterTechniqueState,
    source = "trainer",
  ): Promise<LearnRefusal | null> {
    const refusal = canLearn(abilityId, state);
    if (refusal) return refusal;
    await this.runtime.execute(
      `INSERT INTO character_abilities (character_id, ability_id, source)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [characterId, abilityId, source],
    );
    return null;
  }

  async prepare(
    characterId: number,
    abilityId: string,
    slot: number,
    state: CharacterTechniqueState,
    inCombat: boolean,
  ): Promise<PrepareRefusal | null> {
    const refusal = canPrepare(abilityId, slot, state, inCombat);
    if (refusal) return refusal;
    // Delete-then-insert rather than upsert: dialects disagree about ON CONFLICT
    // targets, and a loadout write is rare enough that two statements cost nothing.
    await this.runtime.execute(
      "DELETE FROM character_prepared_actions WHERE character_id = ? AND slot = ?",
      [characterId, slot],
    );
    await this.runtime.execute(
      "INSERT INTO character_prepared_actions (character_id, slot, ability_id) VALUES (?, ?, ?)",
      [characterId, slot, abilityId],
    );
    return null;
  }

  async clearSlot(characterId: number, slot: number, inCombat: boolean): Promise<boolean> {
    if (inCombat) return false;
    await this.runtime.execute(
      "DELETE FROM character_prepared_actions WHERE character_id = ? AND slot = ?",
      [characterId, slot],
    );
    return true;
  }

  async spendAspectPoint(
    characterId: number,
    nodeId: string,
    state: CharacterTechniqueState,
  ): Promise<AspectRefusal | null> {
    const refusal = canSpendAspectPoint(nodeId, state);
    if (refusal) return refusal;
    // Record what the node actually cost. Storing 1 for a two-point capstone was a quiet
    // discount: the gate checked the real cost, the row charged less, and the character
    // ended up with more points than the level ever granted.
    const cost = aspectNode(nodeId)?.cost ?? 1;
    await this.runtime.execute(
      `INSERT INTO character_aspect_points (character_id, node_id, points)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      [characterId, nodeId, cost],
    );
    return null;
  }

  /**
   * Refunds every Aspect point.
   *
   * Free through the demo by design — a punitive respec makes players research builds
   * instead of trying things, which is the opposite of what two readable tracks are for.
   * Learned techniques are untouched: a respec changes emphasis, never knowledge.
   */
  async respecAspects(characterId: number): Promise<void> {
    await this.runtime.execute(
      "DELETE FROM character_aspect_points WHERE character_id = ?",
      [characterId],
    );
  }
}
