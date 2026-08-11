import type { StatusDefinition } from "../ability-types.js";

/**
 * Statuses more than one class produces.
 *
 * A stagger from a Warrior's shield and a stagger from a Monk's palm are the same thing
 * happening to the target, and duplicating them per class is how two classes end up
 * applying stuns of different lengths for no authored reason. Anything genuinely
 * class-flavoured — a Wizard's root breaking on damage where a Druid's does not — stays
 * in the class file, because that difference *is* the design.
 */
export const COMMON_STATUSES: readonly StatusDefinition[] = [
  {
    id: "common.staggered",
    name: "Staggered",
    durationMs: 2_000,
    stacking: "refresh",
    control: "stun",
  },
  {
    id: "common.snared",
    name: "Snared",
    durationMs: 12_000,
    stacking: "replace_weaker",
    control: "snare",
  },
  {
    id: "common.silenced",
    name: "Silenced",
    durationMs: 5_000,
    stacking: "refresh",
    control: "silence",
  },
  {
    id: "common.sundered",
    name: "Sundered",
    durationMs: 15_000,
    stacking: "replace_weaker",
  },
  {
    id: "common.marked",
    name: "Marked",
    durationMs: 60_000,
    stacking: "replace_weaker",
  },
];
