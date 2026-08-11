import type { DatabaseBackend } from "../db/backend.js";
import { MerchantRepository } from "../merchant/merchant-repository.js";
import { CharacterProgressRepository } from "../progression/character-progress-repository.js";
import { TechniqueRepository } from "../progression/technique-repository.js";
import { GameDataRepository } from "./game-data-repository.js";
import { GameRepository } from "./repository.js";
import { WorldStateRepository } from "./world-state-repository.js";
import { ZoneSnapshotRepository } from "./zone-snapshot-repository.js";

/**
 * One repository composition root for live and embedded runtimes. It records which
 * backend owns runtime state, which owns content, and how attached content is named.
 * Callers no longer reconstruct that dialect/topology decision for every operation.
 */
export class GameDatabase {
  readonly game: GameRepository;
  readonly data: GameDataRepository;
  readonly progress: CharacterProgressRepository;
  readonly techniques: TechniqueRepository;
  readonly merchants: MerchantRepository;
  readonly worldState: WorldStateRepository;
  readonly zoneSnapshots: ZoneSnapshotRepository;

  constructor(
    readonly runtime: DatabaseBackend,
    readonly content: DatabaseBackend = runtime,
    readonly contentPrefix = "",
  ) {
    this.game = new GameRepository(runtime, content, contentPrefix);
    this.data = new GameDataRepository(content, runtime, contentPrefix);
    this.progress = new CharacterProgressRepository(
      runtime,
      content,
      contentPrefix,
    );
    this.techniques = new TechniqueRepository(runtime);
    this.merchants = new MerchantRepository(content, runtime, contentPrefix);
    this.worldState = new WorldStateRepository(runtime);
    this.zoneSnapshots = new ZoneSnapshotRepository(runtime);
  }

  /** Rebind runtime repositories to an admitted caller transaction. */
  inTransaction(transaction: DatabaseBackend): GameDatabase {
    return new GameDatabase(
      transaction,
      this.content === this.runtime ? transaction : this.content,
      this.contentPrefix,
    );
  }
}
