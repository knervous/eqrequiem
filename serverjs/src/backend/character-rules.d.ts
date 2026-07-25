import type { BackendCharacterCreate } from "./contracts.js";
export interface CharacterBaseStats {
    str: number;
    sta: number;
    dex: number;
    agi: number;
    intel: number;
    wis: number;
    cha: number;
    points: number;
}
export declare function normalizeCharacterName(value: string): string | null;
export declare function baseCharacterStats(race: number, charClass: number): CharacterBaseStats | null;
export declare function resolveCharacterStats(character: BackendCharacterCreate): CharacterBaseStats | null;
export declare function startingSkills(race: number): ReadonlyMap<number, number>;
export declare function startingLanguages(race: number, charClass: number): ReadonlyMap<number, number>;
export declare function isStartingClassSkill(skillId: number): boolean;
export declare function startingItemMatches(raw: string, character: Pick<BackendCharacterCreate, "race" | "charClass" | "deity">, zoneId: number): boolean;
