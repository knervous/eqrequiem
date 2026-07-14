export interface Character {
  name: string;
  level: number;
}

interface Account {
  id: number;
  token: string;
  characters: Character[];
}

export class AccountStore {
  private nextAccountId = 1;
  private readonly byToken = new Map<string, Account>();

  getOrCreateByToken(token: string): Account {
    const existing = this.byToken.get(token);
    if (existing) {
      return existing;
    }

    const account: Account = {
      id: this.nextAccountId++,
      token,
      characters: [],
    };

    this.byToken.set(token, account);
    return account;
  }

  getById(accountId: number): Account | undefined {
    for (const account of this.byToken.values()) {
      if (account.id === accountId) {
        return account;
      }
    }

    return undefined;
  }

  createCharacter(accountId: number, name: string): boolean {
    const account = this.getById(accountId);
    if (!account) {
      return false;
    }

    const normalized = name.trim();
    if (normalized.length < 3 || normalized.length > 16) {
      return false;
    }

    if (account.characters.some((character) => character.name.toLowerCase() === normalized.toLowerCase())) {
      return false;
    }

    account.characters.push({ name: normalized, level: 1 });
    return true;
  }

  deleteCharacter(accountId: number, name: string): boolean {
    const account = this.getById(accountId);
    if (!account) {
      return false;
    }

    const before = account.characters.length;
    account.characters = account.characters.filter((character) => character.name !== name);
    return account.characters.length < before;
  }

  listCharacters(accountId: number): Character[] {
    const account = this.getById(accountId);
    if (!account) {
      return [];
    }

    return [...account.characters];
  }
}
