/**
 * Floating combat text.
 *
 * Damage and healing numbers ride the same MSDF layer as nameplates rather than a
 * second text pipeline: one font atlas, one shader, one glyph buffer. The layer already
 * accepts per-instance position, size and `#rrggbbaa` colour, which is everything an
 * appear/float/fade animation needs.
 *
 * The motion is deliberately unhurried. Numbers that snap up and vanish read as noise;
 * the point of combat text is that a player can glance at it and know what happened, so
 * a value stays legible for most of its life and only then gets out of the way.
 *
 * Pure and clock-driven: `advance` takes the current time and returns what to draw, so
 * the same code runs in the sandbox, in the game, and in a test with no renderer.
 */

export type FloatingTextKind =
  | "damage"
  | "critical"
  | "heal"
  | "miss"
  | "resist"
  | "immune";

export interface FloatingTextSpawn {
  readonly kind: FloatingTextKind;
  /** Already formatted: the pool never decides how a number reads. */
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Distinguishes simultaneous hits on the same target so they do not overlap. */
  readonly slot?: number;
}

export interface FloatingTextInstance {
  id: string;
  text: string;
  x: number;
  y: number;
  z: number;
  visible: boolean;
  fontSize: number;
  color: string;
}

export interface FloatingTextStyle {
  readonly rgb: string;
  readonly fontSize: number;
}

/**
 * Colour and weight carry meaning before the number is even read: healing reads green,
 * a critical is larger and hotter, and a nothing-happened result is muted so it never
 * competes with real damage.
 */
export const DEFAULT_FLOATING_TEXT_STYLES: Readonly<Record<FloatingTextKind, FloatingTextStyle>> = {
  damage: { rgb: "ffe4b5", fontSize: 19 },
  critical: { rgb: "ffb347", fontSize: 28 },
  heal: { rgb: "9ae6a0", fontSize: 19 },
  miss: { rgb: "b9c2cc", fontSize: 15 },
  resist: { rgb: "9ab6e6", fontSize: 15 },
  immune: { rgb: "b9c2cc", fontSize: 15 },
};

export interface FloatingTextOptions {
  /** Total life. Long enough to read, short enough not to clutter. */
  readonly lifetimeMs?: number;
  /** World units risen over the whole life. */
  readonly riseUnits?: number;
  /** Sideways drift, so stacked hits fan out instead of overlapping. */
  readonly driftUnits?: number;
  /** Vertical separation between consecutive values on the same target. */
  readonly laneSpacingUnits?: number;
  /** Fraction of life spent at full opacity before the fade starts. */
  readonly holdFraction?: number;
  /**
   * Fraction of life spent scaling up on appearance.
   *
   * Defaults to 0 — no size animation — because the MSDF layer bakes glyph metrics when
   * an instance is first seen. A value born at size 0 stays invisible for its whole
   * life, which is exactly what the client was doing. Verified in the sandbox at
   * `/floating-text-parity`: constant-size values render, animated ones do not.
   * Raise it only if the layer gains per-frame glyph rescaling.
   */
  readonly appearFraction?: number;
  /** How much larger a value is at the peak of its appearance pop. */
  readonly appearOvershoot?: number;
  readonly styles?: Readonly<Record<FloatingTextKind, FloatingTextStyle>>;
  readonly maxActive?: number;
}

const DEFAULTS = {
  lifetimeMs: 1_600,
  riseUnits: 3.0,
  driftUnits: 1.6,
  // Lanes have to clear a glyph, so this tracks the style sizes above: at the
  // smaller sizes the old 0.42 was already tight, and it overlaps outright now.
  laneSpacingUnits: 0.7,
  holdFraction: 0.55,
  appearFraction: 0,
  appearOvershoot: 0.35,
  maxActive: 64,
} as const;

interface ActiveText {
  readonly id: string;
  readonly text: string;
  readonly kind: FloatingTextKind;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly drift: number;
  readonly lane: number;
  readonly bornAtMs: number;
}

/** Ease-out cubic: fast at first, settling — reads as "arriving" rather than "sliding". */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Symmetric ease for the appearance pop. */
const easeOutBack = (t: number, overshoot: number): number => {
  const c = 1 + overshoot * 2;
  const p = t - 1;
  return 1 + c * p * p * p + overshoot * 2 * p * p;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const toHexByte = (value: number): string =>
  Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");

export class FloatingTextPool {
  #active: ActiveText[] = [];
  #sequence = 0;

  constructor(private readonly options: FloatingTextOptions = {}) {}

  get activeCount(): number {
    return this.#active.length;
  }

  spawn(spawn: FloatingTextSpawn, nowMs: number): string {
    const maxActive = this.options.maxActive ?? DEFAULTS.maxActive;
    // Drop the oldest rather than refusing the newest: the most recent hit is the one
    // the player is actually waiting to see.
    if (this.#active.length >= maxActive) this.#active.shift();

    this.#sequence += 1;
    const id = `fct:${this.#sequence}`;
    const slot = spawn.slot ?? this.#sequence;
    // Fan across five lanes rather than alternating two: two hits landing in the same
    // frame on the same target were still landing on top of each other, which is
    // exactly the case combat text has to survive.
    const drift = ((slot % 5) - 2) / 2;
    const lane = slot % 3;

    this.#active.push({
      id,
      text: spawn.text,
      kind: spawn.kind,
      originX: spawn.x,
      originY: spawn.y,
      originZ: spawn.z,
      drift,
      lane,
      bornAtMs: nowMs,
    });
    return id;
  }

  /** Drops everything, e.g. on zone change. */
  clear(): void {
    this.#active.length = 0;
  }

  /**
   * Retires expired values and returns what should be drawn this frame.
   *
   * Returns fresh objects rather than mutating shared ones so a caller can concatenate
   * the result straight into the nameplate layer's input array.
   */
  advance(nowMs: number): FloatingTextInstance[] {
    const lifetimeMs = this.options.lifetimeMs ?? DEFAULTS.lifetimeMs;
    const riseUnits = this.options.riseUnits ?? DEFAULTS.riseUnits;
    const driftUnits = this.options.driftUnits ?? DEFAULTS.driftUnits;
    const laneSpacing = this.options.laneSpacingUnits ?? DEFAULTS.laneSpacingUnits;
    const holdFraction = this.options.holdFraction ?? DEFAULTS.holdFraction;
    const appearFraction = this.options.appearFraction ?? DEFAULTS.appearFraction;
    const overshoot = this.options.appearOvershoot ?? DEFAULTS.appearOvershoot;
    const styles = this.options.styles ?? DEFAULT_FLOATING_TEXT_STYLES;

    const drawn: FloatingTextInstance[] = [];
    const kept: ActiveText[] = [];

    for (const entry of this.#active) {
      const age = nowMs - entry.bornAtMs;
      if (age >= lifetimeMs) continue;
      kept.push(entry);

      const life = clamp01(age / lifetimeMs);
      const style = styles[entry.kind] ?? DEFAULT_FLOATING_TEXT_STYLES.damage;

      // Rise eases out: quick initial lift, then a slow drift upward.
      // The lane offset is applied at birth rather than over time, so two simultaneous
      // values start apart instead of drifting apart after they are already unreadable.
      const z = entry.originZ + entry.lane * laneSpacing + riseUnits * easeOut(life);
      const x = entry.originX + entry.drift * driftUnits * easeOut(life);

      // Appearance pop, then settle to the style's size.
      const appear = appearFraction > 0 ? clamp01(life / appearFraction) : 1;
      const scale = appear >= 1 ? 1 : easeOutBack(appear, overshoot);
      const fontSize = style.fontSize * scale;

      // Hold at full opacity, then fade out over the remainder.
      const fade = life <= holdFraction
        ? 1
        : 1 - clamp01((life - holdFraction) / (1 - holdFraction));
      // Squared so the value stays readable through most of the fade instead of
      // spending half its life as a ghost.
      const alpha = fade * fade;

      drawn.push({
        id: entry.id,
        text: entry.text,
        x,
        y: entry.originY,
        z,
        visible: alpha > 0.02,
        fontSize,
        color: `#${style.rgb}${toHexByte(alpha)}`,
      });
    }

    this.#active = kept;
    return drawn;
  }
}

/** Formats a combat result the way a player expects to read it. */
export function formatCombatText(
  kind: FloatingTextKind,
  amount?: number,
): string {
  switch (kind) {
    case "heal":
      return `+${Math.max(0, Math.round(amount ?? 0))}`;
    case "miss":
      return "miss";
    case "resist":
      return "resist";
    case "immune":
      return "immune";
    case "critical":
    case "damage":
    default:
      return `${Math.max(0, Math.round(amount ?? 0))}`;
  }
}
