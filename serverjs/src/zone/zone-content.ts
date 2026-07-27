export interface ZonePathPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pauseSeconds: number;
}

export interface ZoneMerchantDefinition {
  readonly catalogId: number;
  readonly keepsSoldItems: boolean;
  readonly interactionRange: number;
}

/** Fully selected spawn point: no database choice or model fallback remains in the worker. */
export interface ZoneNpcSpawnDefinition {
  readonly spawnId: number;
  readonly spawnPointId: number;
  readonly spawnGroupId: number;
  readonly npcArchetypeId: number;
  readonly name: string;
  readonly level: number;
  readonly race: number;
  readonly gender: number;
  readonly modelKey: string | null;
  readonly movementSpeed: number;
  readonly size: number;
  readonly face: number;
  readonly helm: number;
  readonly equipChest: number;
  readonly primary: number;
  readonly secondary: number;
  readonly charClass: number;
  readonly bodyType: number;
  readonly maximumHp: number;
  readonly strength: number;
  readonly stamina: number;
  readonly dexterity: number;
  readonly agility: number;
  readonly offense: number;
  readonly defense: number;
  readonly armorClass: number;
  readonly weaponDamage: number;
  readonly attackDelayMs: number;
  readonly haste: number;
  readonly meleeRange: number;
  readonly merchant?: ZoneMerchantDefinition | null;
  readonly lootItems: readonly Record<string, unknown>[];
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly path: readonly ZonePathPoint[];
}
