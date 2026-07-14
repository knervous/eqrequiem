export interface LibraSection {
  id: string
  label: string
  description: string
  tables: string[]
}

export const LIBRA_SECTIONS: LibraSection[] = [
  {
    id: 'world-zones',
    label: 'World & Zones',
    description: 'Canonical zone metadata and spatial spawn placement.',
    tables: ['zones', 'spawn_points'],
  },
  {
    id: 'npc-spawns',
    label: 'NPC & Spawns',
    description: 'NPC archetypes, weighted spawn groups, and placements used by zone shards.',
    tables: ['npc_archetypes', 'spawn_groups', 'spawn_group_members', 'spawn_points'],
  },
  {
    id: 'items-loot',
    label: 'Items & Loot',
    description: 'Canonical item templates; loot and merchant domains will attach here as first-class models.',
    tables: ['items'],
  },
  {
    id: 'rules-config',
    label: 'Rules & Config',
    description: 'Versioned content releases and dynamic quest definitions.',
    tables: ['content_releases', 'quest_definitions'],
  },
]

export const GENERIC_SECTION_ID = 'all'
