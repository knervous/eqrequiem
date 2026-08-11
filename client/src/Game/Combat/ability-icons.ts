/**
 * Where an ability or Aspect icon comes from.
 *
 * Art is generated per id into `/eltania/abilities/icons/v1/<id>.webp`, which means the
 * id in the authored content *is* the filename — no lookup table to drift. Not every id
 * has art yet, so nothing here assumes the file exists: callers render the URL and fall
 * back on error, exactly the way `item-visual.tsx` degrades through its candidates.
 *
 * The fallback is deliberately not another image. A missing icon should read as "this
 * technique, no art yet" rather than as a broken one, so it falls back to the technique's
 * own initials over its school colour, which stays legible at hotbar size.
 */

const ICON_ROOT = "/eltania/abilities/icons/v1";

/** Ids are authored (`warrior.shield_bash`), never user text; keep the path safe anyway. */
const SAFE_ID = /^[a-z0-9_.]+$/;

export const abilityIconUrl = (id: string): string | null =>
  SAFE_ID.test(id) ? `${ICON_ROOT}/${id}.webp` : null;

/**
 * Colour by school, then by kind.
 *
 * The same palette the icon prompts were written against, so a missing icon sits beside
 * generated ones without looking like a different game.
 */
const SCHOOL_TINTS: Record<string, string> = {
  arcane: "#8b6fd6",
  fire: "#d97434",
  cold: "#5aa6d9",
  nature: "#6faa52",
  sacred: "#d9b45a",
  shadow: "#6b5b8a",
};

const KIND_TINTS: Record<string, string> = {
  martial: "#a85f5f",
  spell: "#7a6fd6",
  utility: "#7f8c99",
};

export function iconTint(kind: string, school?: string | null): string {
  if (school && SCHOOL_TINTS[school]) return SCHOOL_TINTS[school]!;
  return KIND_TINTS[kind] ?? "#7f8c99";
}

/** Two letters that still read at 40 pixels: "Shield Bash" -> "SB", "Kick" -> "KI". */
export function iconInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}
