import type { BackendCharacterCreate } from "./contracts.js";

const CHARACTER_NAME = /^[A-Z][a-z]{3,14}$/;

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

const RACE_STATS: Record<number, readonly number[]> = {
  1: [75, 75, 75, 75, 75, 75, 75], 2: [103, 95, 82, 70, 70, 60, 55],
  3: [60, 70, 70, 70, 83, 107, 70], 4: [65, 65, 95, 80, 80, 75, 75],
  5: [55, 65, 85, 70, 95, 92, 80], 6: [60, 65, 90, 75, 83, 99, 60],
  7: [70, 70, 90, 85, 60, 75, 75], 8: [90, 90, 70, 90, 83, 60, 45],
  9: [108, 109, 83, 75, 60, 52, 40], 10: [130, 122, 70, 70, 67, 60, 37],
  11: [70, 75, 95, 90, 80, 67, 50], 12: [60, 70, 85, 85, 67, 98, 60],
  128: [70, 70, 90, 85, 80, 75, 55], 130: [90, 75, 90, 70, 70, 65, 65],
  330: [70, 80, 100, 100, 75, 75, 50], 522: [70, 80, 85, 75, 80, 85, 75],
};

const CLASS_STATS: Record<number, readonly number[]> = {
  1: [10, 10, 5, 0, 0, 0, 0, 25], 2: [5, 5, 0, 0, 10, 0, 0, 30],
  3: [10, 5, 0, 0, 5, 0, 10, 20], 4: [5, 10, 10, 0, 5, 0, 0, 20],
  5: [10, 5, 0, 0, 0, 10, 5, 20], 6: [0, 10, 0, 0, 10, 0, 0, 30],
  7: [5, 5, 10, 10, 0, 0, 0, 20], 8: [5, 0, 0, 10, 0, 0, 10, 25],
  9: [0, 0, 10, 10, 0, 0, 0, 30], 10: [0, 5, 0, 0, 10, 0, 5, 30],
  11: [0, 0, 0, 10, 0, 10, 0, 30], 12: [0, 10, 0, 0, 0, 10, 0, 30],
  13: [0, 10, 0, 0, 0, 10, 0, 30], 14: [0, 0, 0, 0, 0, 10, 10, 30],
  15: [0, 10, 5, 0, 10, 0, 5, 20], 16: [10, 5, 0, 10, 0, 0, 0, 25],
};

const CLASS_RACES: readonly (readonly boolean[])[] = [
  [1,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1], [1,0,1,0,1,1,1,1,0,0,1,1,0,0,1,1],
  [1,0,1,0,1,0,1,1,0,0,1,1,0,0,1,1], [1,0,0,1,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,0,0,1,0,0,1,1,0,1,1,0,1,1], [1,0,0,1,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1], [1,0,0,1,0,0,1,0,0,0,0,0,0,1,0,1],
  [1,1,0,1,0,1,1,1,0,0,1,1,0,1,1,1], [0,1,0,0,0,0,0,0,1,1,0,0,1,1,1,0],
  [1,0,1,0,0,1,0,0,0,0,0,1,1,0,1,1], [1,0,1,0,1,1,0,0,0,0,0,1,0,0,1,1],
  [1,0,1,0,1,1,0,0,0,0,0,1,0,0,0,1], [1,0,1,0,1,1,0,0,0,0,0,1,0,0,0,1],
  [0,1,0,0,0,0,0,0,1,1,0,0,1,1,0,0], [0,1,0,0,0,0,0,1,1,1,0,0,0,1,0,0],
].map(row => row.map(Boolean));

const RACE_INDEX = new Map([1,2,3,4,5,6,7,8,9,10,11,12,128,130,330,522].map((race, index) => [race, index]));

export function normalizeCharacterName(value: string): string | null {
  const name = value.trim();
  return CHARACTER_NAME.test(name) ? name : null;
}

export function baseCharacterStats(race: number, charClass: number): CharacterBaseStats | null {
  const racial = RACE_STATS[race];
  const classStats = CLASS_STATS[charClass];
  const raceIndex = RACE_INDEX.get(race);
  if (!racial || !classStats || raceIndex === undefined || !CLASS_RACES[charClass - 1]?.[raceIndex]) return null;
  return {
    str: racial[0]! + classStats[0]!, sta: racial[1]! + classStats[1]!,
    agi: racial[2]! + classStats[2]!, dex: racial[3]! + classStats[3]!,
    wis: racial[4]! + classStats[4]!, intel: racial[5]! + classStats[5]!,
    cha: racial[6]! + classStats[6]!, points: classStats[7]!,
  };
}

export function resolveCharacterStats(character: BackendCharacterCreate): CharacterBaseStats | null {
  const base = baseCharacterStats(character.race, character.charClass);
  if (!base) return null;
  const keys = ["str", "sta", "agi", "dex", "wis", "intel", "cha"] as const;
  const supplied = keys.every(key => Number.isFinite(character[key]));
  if (!supplied) return base;
  const values = Object.fromEntries(keys.map(key => [key, Number(character[key])])) as Record<typeof keys[number], number>;
  const spent = keys.reduce((sum, key) => sum + values[key] - base[key], 0);
  if (spent !== base.points || keys.some(key => values[key] < base[key] || values[key] > base[key] + base.points)) return null;
  return { ...base, ...values, points: 0 };
}

const RACIAL_SKILLS: Record<number, readonly (readonly [number, number])[]> = {
  6: [[29, 50]], 330: [[27, 100]], 12: [[57, 50]], 11: [[29, 50], [42, 50]],
  128: [[18, 50], [27, 50]], 4: [[18, 50], [29, 50]], 130: [[39, 50], [42, 50]],
};

const RACIAL_LANGUAGES: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0,100]], 2: [[0,100],[1,100]], 3: [[0,100],[2,100]], 4: [[0,100],[3,100]],
  5: [[0,100],[3,100],[4,100],[14,100]], 6: [[0,100],[4,100],[13,100],[14,100],[3,25]],
  7: [[0,100],[4,100]], 8: [[0,100],[5,100],[4,25]], 9: [[0,25],[13,100],[6,100]],
  10: [[0,25],[13,100],[7,100]], 11: [[0,100],[9,100]], 12: [[0,100],[8,100],[5,25]],
  128: [[0,25],[10,100],[13,100]], 130: [[0,100],[15,100],[11,100],[2,25]],
  330: [[0,100],[12,100],[6,25]], 522: [[0,100],[16,100],[17,100]],
};

export function startingSkills(race: number): ReadonlyMap<number, number> {
  const skills = new Map<number, number>([[27, 50], [55, 50]]);
  for (const [skill, value] of RACIAL_SKILLS[race] ?? []) skills.set(skill, value);
  return skills;
}

export function startingLanguages(race: number, charClass: number): ReadonlyMap<number, number> {
  const languages = new Map<number, number>(RACIAL_LANGUAGES[race] ?? [[0, 100]]);
  if (charClass === 9) languages.set(18, 100);
  return languages;
}

const NON_STARTING_CLASS_SKILLS = new Set([
  9, // bind wound
  43, 44, 45, 46, 47, // spell specializations
  56, 57, 58, 59, 60, 61, 63, 64, 65, 66, 68, 69, // tradeskills/alcohol
]);

export function isStartingClassSkill(skillId: number): boolean {
  return Number.isInteger(skillId) && skillId >= 0 && skillId <= 77 &&
    !NON_STARTING_CLASS_SKILLS.has(skillId);
}

export function startingItemMatches(
  raw: string,
  character: Pick<BackendCharacterCreate, "race" | "charClass" | "deity">,
  zoneId: number,
): boolean {
  let criteria: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) criteria = parsed as Record<string, unknown>;
  } catch { /* malformed content rule behaves as an unconstrained legacy row */ }
  const matches = (key: string, value: number): boolean => {
    const values = Array.isArray(criteria[key]) ? criteria[key]!.map(Number) : [];
    return values.length === 0 || values.includes(value);
  };
  return matches("classes", character.charClass) && matches("races", character.race) &&
    matches("deities", character.deity) && matches("zones", zoneId);
}
