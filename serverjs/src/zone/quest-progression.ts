/**
 * One authoritative progression model. Quest scripts never mutate `level`; everything
 * awards experience through this module so level thresholds, clamping and level-up
 * reporting stay in a single place.
 *
 * The curve itself is content: `level_experience_curve` overrides the built-in default,
 * which exists only so a fresh database is playable before the curve is tuned against
 * real play telemetry.
 */

export const DEFAULT_MAX_LEVEL = 60;

export interface LevelCurveEntry {
  readonly level: number;
  readonly cumulativeExperience: number;
}

export interface LevelProgress {
  readonly level: number;
  readonly experience: number;
  /** Experience earned inside the current level. */
  readonly intoLevel: number;
  /** Experience the current level costs in total. 0 at the cap. */
  readonly forLevel: number;
  readonly capped: boolean;
}

export interface ExperienceAwardResult extends LevelProgress {
  readonly previousLevel: number;
  readonly gained: number;
  readonly leveled: boolean;
}

/**
 * Deliberately gentle superlinear step. The shape matters more than the constants:
 * every level costs meaningfully more than the last without the classic hockey stick,
 * which would be unbalanced to import wholesale alongside changed travel and downtime.
 */
export function defaultLevelCurve(maxLevel = DEFAULT_MAX_LEVEL): LevelCurveEntry[] {
  const entries: LevelCurveEntry[] = [{ level: 1, cumulativeExperience: 0 }];
  let cumulative = 0;
  for (let level = 1; level < maxLevel; level++) {
    cumulative += Math.round(180 * Math.pow(level, 1.55));
    entries.push({ level: level + 1, cumulativeExperience: cumulative });
  }
  return entries;
}

export class LevelCurve {
  readonly #cumulative: readonly number[];

  constructor(entries: readonly LevelCurveEntry[]) {
    const sorted = [...entries]
      .filter((entry) => Number.isFinite(entry.level) && entry.level >= 1)
      .sort((left, right) => left.level - right.level);
    if (sorted.length === 0) throw new Error("a level curve requires at least one level");
    const cumulative: number[] = [];
    let previous = -1;
    for (const entry of sorted) {
      // Index by level so lookups stay O(1); gaps inherit the previous threshold.
      const value = Math.max(previous, Math.max(0, Math.trunc(entry.cumulativeExperience)));
      while (cumulative.length < entry.level - 1) {
        cumulative.push(previous < 0 ? 0 : previous);
      }
      cumulative[entry.level - 1] = value;
      previous = value;
    }
    this.#cumulative = cumulative;
  }

  static default(maxLevel = DEFAULT_MAX_LEVEL): LevelCurve {
    return new LevelCurve(defaultLevelCurve(maxLevel));
  }

  get maxLevel(): number {
    return this.#cumulative.length;
  }

  cumulativeFor(level: number): number {
    const index = Math.min(Math.max(1, Math.trunc(level)), this.maxLevel) - 1;
    return this.#cumulative[index] ?? 0;
  }

  levelFor(experience: number): number {
    const total = Math.max(0, experience);
    let level = 1;
    for (let candidate = this.maxLevel; candidate >= 1; candidate--) {
      if (total >= this.cumulativeFor(candidate)) {
        level = candidate;
        break;
      }
    }
    return level;
  }

  progress(experience: number): LevelProgress {
    const total = Math.max(0, Math.trunc(experience));
    const level = this.levelFor(total);
    const capped = level >= this.maxLevel;
    const base = this.cumulativeFor(level);
    const next = capped ? base : this.cumulativeFor(level + 1);
    return {
      level,
      experience: total,
      intoLevel: total - base,
      forLevel: capped ? 0 : next - base,
      capped,
    };
  }

  /** Applies an award and reports whether one or more level thresholds were crossed. */
  award(current: { readonly experience: number; readonly level: number }, amount: number): ExperienceAwardResult {
    const gained = Math.max(0, Math.trunc(amount));
    const progress = this.progress(Math.max(0, current.experience) + gained);
    const previousLevel = Math.max(1, Math.trunc(current.level));
    return {
      ...progress,
      // A stored level ahead of the curve (GM grants, imports) is never rolled back.
      level: Math.max(progress.level, previousLevel),
      previousLevel,
      gained,
      leveled: progress.level > previousLevel,
    };
  }
}

/**
 * Combat remains the primary repeatable source, and the world is never level-scaled;
 * instead a target far below the killer trivializes, so old camps stop paying rather
 * than the world quietly growing with the player.
 */
export function combatExperience(npcLevel: number, killerLevel: number): number {
  const target = Math.max(1, Math.trunc(npcLevel));
  const killer = Math.max(1, Math.trunc(killerLevel));
  const base = Math.round(9 * target * target);
  const gap = killer - target;
  if (gap >= 10) return 0;
  if (gap >= 6) return Math.max(1, Math.round(base * 0.15));
  if (gap >= 3) return Math.max(1, Math.round(base * 0.6));
  return base;
}

/**
 * Group split with a modest bonus for playing together, so the credit set from a kill
 * or a shared discovery never punishes grouping. Killing blow is irrelevant: callers
 * pass whichever participants the combat/quest boundary judged eligible.
 */
export function splitGroupExperience(amount: number, memberCount: number): number {
  const members = Math.max(1, Math.trunc(memberCount));
  if (members === 1) return Math.max(0, Math.trunc(amount));
  const bonus = 1 + Math.min(0.6, 0.1 * (members - 1));
  return Math.max(1, Math.round((amount * bonus) / members));
}
