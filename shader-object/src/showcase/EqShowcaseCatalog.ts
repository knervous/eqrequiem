import type { EqShowcaseModel } from './EqShowcaseTypes';

export const SHOWCASE_WEAPONS = ['it1', 'it7', 'it14', 'it20', 'it75'] as const;

const pc = (
  code: string,
  label: string,
  nameRace: string,
  gender: 'male' | 'female',
  scale = 1
): EqShowcaseModel => ({ code, label, kind: 'pc', nameRace, gender, scale });

export const EQ_SHOWCASE_MODELS: readonly EqShowcaseModel[] = [
  pc('hum', 'Human Male', 'human', 'male'), pc('huf', 'Human Female', 'human', 'female'),
  pc('bam', 'Barbarian Male', 'cavePerson', 'male', 1.08), pc('baf', 'Barbarian Female', 'cavePerson', 'female', 1.08),
  pc('erm', 'Erudite Male', 'human', 'male', 1.02), pc('erf', 'Erudite Female', 'human', 'female', 1.02),
  pc('elm', 'Wood Elf Male', 'elf', 'male', 0.94), pc('elf', 'Wood Elf Female', 'elf', 'female', 0.94),
  pc('him', 'High Elf Male', 'highelf', 'male', 0.98), pc('hif', 'High Elf Female', 'highelf', 'female', 0.98),
  pc('dam', 'Dark Elf Male', 'darkelf', 'male', 0.94), pc('daf', 'Dark Elf Female', 'darkelf', 'female', 0.94),
  pc('ham', 'Half Elf Male', 'elf', 'male', 0.98), pc('haf', 'Half Elf Female', 'elf', 'female', 0.98),
  pc('dwm', 'Dwarf Male', 'dwarf', 'male', 0.82), pc('dwf', 'Dwarf Female', 'dwarf', 'female', 0.82),
  pc('trm', 'Troll Male', 'ogre', 'male', 1.22), pc('trf', 'Troll Female', 'ogre', 'female', 1.22),
  pc('ogm', 'Ogre Male', 'ogre', 'male', 1.2), pc('ogf', 'Ogre Female', 'ogre', 'female', 1.2),
  pc('hom', 'Halfling Male', 'halfling', 'male', 0.72), pc('hof', 'Halfling Female', 'halfling', 'female', 0.72),
  pc('gnm', 'Gnome Male', 'gnome', 'male', 0.68), pc('gnf', 'Gnome Female', 'gnome', 'female', 0.68),
  pc('ikm', 'Iksar Male', 'dragon', 'male', 1.04), pc('ikf', 'Iksar Female', 'dragon', 'female', 1.04),
  { code: 'wol', label: 'Wolf', kind: 'npc', nameRace: 'demon', scale: 0.9 },
  { code: 'gnn', label: 'Gnoll', kind: 'npc', nameRace: 'orc', scale: 1 },
  { code: 'gob', label: 'Goblin', kind: 'npc', nameRace: 'goblin', scale: 0.82 },
  { code: 'ske', label: 'Skeleton', kind: 'npc', nameRace: 'demon', scale: 0.95 },
] as const;

/** Canonical Babylon Playground assets, deliberately kept in their native formats. */
export const BABYLON_SHOWCASE_MODELS: readonly EqShowcaseModel[] = [
  {
    code: 'bjs-dude', label: 'Dude', kind: 'pc', nameRace: 'human', gender: 'male', scale: 1,
    catalog: 'babylon', sourceUrl: 'https://assets.babylonjs.com/meshes/Dude/dude.babylon',
  },
  {
    code: 'bjs-hvgirl', label: 'HVGirl', kind: 'pc', nameRace: 'human', gender: 'female', scale: 1,
    catalog: 'babylon', sourceUrl: 'https://assets.babylonjs.com/meshes/HVGirl.glb',
  },
  {
    code: 'bjs-brainstem', label: 'BrainStem', kind: 'pc', nameRace: 'human', scale: 1,
    catalog: 'babylon', sourceUrl: 'https://assets.babylonjs.com/meshes/BrainStem/BrainStem.gltf',
  },
] as const;

const EQ_ANIMATION_LABELS: Readonly<Record<string, string>> = {
  pos: 'Pose', p01: 'Idle', o01: 'Idle · Look around',
  l01: 'Walk', l02: 'Run', l03: 'Running jump', l04: 'Jump', l05: 'Fall',
  l06: 'Crouch walk', l07: 'Climb', l08: 'Crouch', l09: 'Swim',
  p02: 'Sit', p03: 'Turn', p04: 'Strafe', p05: 'Loot', p06: 'Swim',
  c01: 'Kick', c02: 'Pierce', c03: 'Two-handed slash', c04: 'Two-handed blunt',
  c05: 'One-handed slash', c06: 'Off-hand slash', c07: 'Bash', c08: 'Hand-to-hand',
  c09: 'Archery', c10: 'Swimming attack', c11: 'Roundhouse kick',
  d01: 'Minor damage', d02: 'Heavy damage', d04: 'Drowning', d05: 'Death',
  s01: 'Cheer', s02: 'Disappointed', s03: 'Wave', s04: 'Rude', s06: 'Nod',
  s07: 'Amaze', s08: 'Plead', s09: 'Clap', s10: 'Hungry', s11: 'Blush',
  s12: 'Chuckle', s13: 'Cough', s14: 'Duck', s15: 'Puzzle', s16: 'Dance',
  s17: 'Blink', s18: 'Glare', s19: 'Drool', s20: 'Kneel', s21: 'Laugh',
  s22: 'Point', s23: 'Shrug', s24: 'Ready', s25: 'Salute', s26: 'Shiver',
  s27: 'Tap foot', s28: 'Bow',
};

export function showcaseAnimationLabel(name: string): string {
  const known = EQ_ANIMATION_LABELS[name.toLowerCase()];
  if (known) return known;
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, first => first.toUpperCase());
}
