import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ABILITIES } from "../src/combat/abilities/index.js";
import { CLASS_IDS, type CombatAbilityDefinition } from "../src/combat/ability-types.js";
import { ASPECTS_BY_CLASS } from "../src/combat/aspects/index.js";
import type { AspectNode, AspectTrack } from "../src/combat/aspects/types.js";

/**
 * The work order for ability and Aspect icon art.
 *
 * Every icon the UI will ask for is derived from the authored content rather than listed
 * by hand, so the manifest cannot drift from the kits: add a technique and it appears
 * here, rename one and its icon id follows. The generator that feeds sd.cpp reads this
 * file, and so does the client when it resolves an icon, which is what keeps the two
 * from disagreeing about what exists.
 *
 * Prompts are assembled from what the content already knows — class, kind, school,
 * effect verbs, the node's own player-facing line — plus one shared style block. They
 * are meant to be edited: this file is the starting point for an art pass, not a claim
 * that a generated image will be right first time.
 */

const CLASS_NAMES = Object.fromEntries(
  Object.entries(CLASS_IDS).map(([name, id]) => [id, name[0]!.toUpperCase() + name.slice(1)]),
) as Record<number, string>;

/** Shared look. Matches the existing item icon set: painted, dark fantasy, no text. */
const STYLE =
  "single centred game ability icon, painted dark fantasy realism, dramatic rim light, "
  + "deep shadowed background, rich saturated key colour, subtle inner glow, no text, "
  + "no border, no frame, no letters, square composition, high contrast, crisp silhouette";

const SCHOOL_PALETTE: Record<string, string> = {
  arcane: "violet and pale silver arcane energy",
  fire: "orange and ember-red flame",
  cold: "pale blue and white frost",
  nature: "green and amber living growth",
  sacred: "warm gold and ivory holy light",
  shadow: "deep indigo and black smoke",
};

const KIND_SUBJECT: Record<string, string> = {
  martial: "a weapon or armoured gesture",
  spell: "a conjured magical sigil or elemental burst",
  utility: "a tool, token or field-craft object",
};

/** What the ability does, in words an image generator can use. */
function verbsOf(ability: CombatAbilityDefinition): string[] {
  const verbs = new Set<string>();
  const walk = (effects: readonly CombatAbilityDefinition["effects"][number][]): void => {
    for (const effect of effects) {
      switch (effect.type) {
        case "damage": verbs.add("a strike landing"); break;
        case "heal": verbs.add("restorative light"); break;
        case "apply_status": verbs.add("a lingering mark"); break;
        case "remove_status": case "dispel": verbs.add("something being stripped away"); break;
        case "interrupt": verbs.add("an interruption, a broken cast"); break;
        case "taunt": verbs.add("a challenge, drawn attention"); break;
        case "move_self": case "teleport": verbs.add("sudden movement, a blur of motion"); break;
        case "move_target": verbs.add("an enemy hauled off balance"); break;
        case "restore_resource": verbs.add("energy flowing back"); break;
        case "spawn_projectile": verbs.add("a projectile in flight"); break;
        case "spawn_area": verbs.add("a patch of ground transformed"); break;
        case "revive": verbs.add("a soul returning"); break;
        default: break;
      }
      if (effect.type === "spawn_projectile") walk(effect.onHit);
      if (effect.type === "spawn_area") walk(effect.onTick);
    }
  };
  walk(ability.effects);
  return [...verbs];
}

function schoolOf(ability: CombatAbilityDefinition): string | null {
  for (const effect of ability.effects) {
    if (effect.type === "damage" && effect.school) return effect.school;
    if (effect.type === "spawn_projectile") {
      const nested = effect.onHit.find((hit) => hit.type === "damage" && hit.school);
      if (nested && nested.type === "damage" && nested.school) return nested.school;
    }
    if (effect.type === "spawn_area") {
      const nested = effect.onTick.find((tick) => tick.type === "damage" && tick.school);
      if (nested && nested.type === "damage" && nested.school) return nested.school;
    }
  }
  return null;
}

interface IconEntry {
  readonly id: string;
  readonly file: string;
  readonly kind: "ability" | "aspect_node";
  readonly name: string;
  readonly className: string;
  readonly classId: number;
  readonly minLevel?: number;
  readonly track?: string;
  readonly nodeKind?: string;
  readonly school?: string;
  readonly description: string;
  readonly prompt: string;
  readonly negativePrompt: string;
}

const NEGATIVE =
  "text, letters, numbers, watermark, signature, frame, border, ui panel, multiple objects, "
  + "collage, blurry, low contrast, flat lighting, photograph, human face closeup";

function abilityEntry(ability: CombatAbilityDefinition): IconEntry {
  const classId = ability.classIds[0]!;
  const className = CLASS_NAMES[classId] ?? "Adventurer";
  const school = schoolOf(ability);
  const verbs = verbsOf(ability);
  const description = [
    `${className} ${ability.kind} available at level ${ability.minLevel}`,
    ability.acquisition.source === "aspect"
      ? "unlocked by an Aspect node"
      : `learned from: ${ability.acquisition.source.replace(/_/g, " ")}`,
    verbs.length > 0 ? `depicts ${verbs.join(", ")}` : "depicts the technique itself",
  ].join("; ");

  const prompt = [
    `"${ability.name}" — ${KIND_SUBJECT[ability.kind] ?? "an emblem"} for a ${className}`,
    school ? `rendered in ${SCHOOL_PALETTE[school] ?? school}` : null,
    verbs.length > 0 ? `showing ${verbs.join(" and ")}` : null,
    ability.tags?.includes("requires_shield") ? "a shield is prominent" : null,
    ability.tags?.includes("requires_bow") ? "a bow or arrow is prominent" : null,
    ability.tags?.includes("stance") ? "a held, planted posture" : null,
    STYLE,
  ].filter(Boolean).join(", ");

  return {
    id: ability.id,
    file: `${ability.id}.webp`,
    kind: "ability",
    name: ability.name,
    className,
    classId,
    minLevel: ability.minLevel,
    ...(school ? { school } : {}),
    description,
    prompt,
    negativePrompt: NEGATIVE,
  };
}

function nodeEntry(
  node: AspectNode,
  track: AspectTrack,
  classId: number,
): IconEntry {
  const className = CLASS_NAMES[classId] ?? "Adventurer";
  const shape = node.kind === "active"
    ? "a bold emblem for an unlocked technique"
    : node.kind === "reaction"
      ? "a sharp, reactive emblem suggesting a counter-blow"
      : node.kind === "modifier"
        ? "a refined emblem suggesting an existing technique sharpened"
        : "a quiet heraldic emblem suggesting a permanent trait";
  return {
    id: node.id,
    file: `${node.id}.webp`,
    kind: "aspect_node",
    name: node.name,
    className,
    classId,
    track: track.name,
    nodeKind: node.kind,
    description: `${className} ${track.name} talent (${node.kind}): ${node.effect}`,
    prompt: [
      `"${node.name}" — ${shape} in the ${track.name} tradition of the ${className}`,
      `evoking: ${node.effect.replace(/\.$/, "")}`,
      "smaller and more heraldic than a spell icon, reads clearly at 48 pixels",
      STYLE,
    ].join(", "),
    negativePrompt: NEGATIVE,
  };
}

const icons: IconEntry[] = [
  ...ABILITIES.map(abilityEntry),
  ...ASPECTS_BY_CLASS.flatMap((aspects) =>
    aspects.tracks.flatMap((track) =>
      track.nodes.map((node) => nodeEntry(node, track, aspects.classId)),
    ),
  ),
];

const manifest = {
  version: 1,
  generatedFrom: "serverjs/src/combat/abilities + serverjs/src/combat/aspects",
  outputDirectory: "client/public/eltania/abilities/icons/v1",
  style: STYLE,
  negativePrompt: NEGATIVE,
  recommended: {
    size: 512,
    format: "webp",
    backgroundRemoval: true,
    note:
      "Generate at 512 and downsample; the hotbar draws at 48–64 and the Aspect tree at "
      + "40–48, so silhouette matters far more than interior detail.",
  },
  counts: {
    total: icons.length,
    abilities: icons.filter((icon) => icon.kind === "ability").length,
    aspectNodes: icons.filter((icon) => icon.kind === "aspect_node").length,
    byClass: Object.fromEntries(
      [...new Set(icons.map((icon) => icon.className))].map((className) => [
        className,
        icons.filter((icon) => icon.className === className).length,
      ]),
    ),
  },
  icons,
};

const target = path.resolve(
  import.meta.dirname,
  "../../client/public/eltania/abilities/icons/v1",
);
await mkdir(target, { recursive: true });
const file = path.join(target, "icon-manifest.json");
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${icons.length} icons -> ${file}`);
