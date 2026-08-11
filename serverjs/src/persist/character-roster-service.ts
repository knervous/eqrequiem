import type { BackendCharacterCreate } from "../backend/contracts.js";
import type { CharacterProfileProjection } from "./game-data-repository.js";
import type { GameDatabase } from "./game-database.js";
import type {
  PersistCreateCharacterResult,
  PersistDeleteCharacterResult,
  PersistLoginResult,
} from "./types.js";

/** Account and character-selection use cases shared by worker and browser adapters. */
export class CharacterRosterService {
  constructor(private readonly database: GameDatabase) {}

  initialize(): Promise<void> {
    return this.database.game.initialize();
  }

  async login(identity: string): Promise<PersistLoginResult> {
    const accountId = await this.accountId(identity);
    return {
      accountId,
      characters: await this.database.game.listCharacters(accountId),
    };
  }

  accountId(identity: string): Promise<number> {
    return this.database.game.getOrCreateAccount(identity.trim() || "guest");
  }

  async createCharacter(
    accountId: number,
    character: BackendCharacterCreate,
  ): Promise<PersistCreateCharacterResult> {
    const ok = await this.database.game.createCharacter(accountId, character);
    return {
      ok,
      characters: await this.database.game.listCharacters(accountId),
    };
  }

  async deleteCharacter(
    accountId: number,
    name: string,
  ): Promise<PersistDeleteCharacterResult> {
    const ok = await this.database.game.deleteCharacter(accountId, name);
    return {
      ok,
      characters: await this.database.game.listCharacters(accountId),
    };
  }

  async enterWorld(name: string): Promise<{
    readonly character: CharacterProfileProjection | null;
    readonly demoStartPending: boolean;
  }> {
    const character = await this.database.data.characterByName(name.trim());
    if (!character) return { character: null, demoStartPending: false };
    await this.database.game.touchCharacterLogin(Number(character.id));
    return {
      character,
      demoStartPending: await this.database.game.applyDemoStart(character.name),
    };
  }

  mostRecentCharacter(): Promise<{ id: number; name: string } | null> {
    return this.database.data.mostRecentCharacter();
  }
}
