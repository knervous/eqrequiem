export interface ZonePathPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pauseSeconds: number;
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
  readonly charClass: number;
  readonly bodyType: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly path: readonly ZonePathPoint[];
}
