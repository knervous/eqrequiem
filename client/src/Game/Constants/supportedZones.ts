export interface SupportedZone {
  readonly shortName: string;
  readonly longName: string;
  /**
   * The world asset base name, when it differs from `shortName`.
   *
   * Eltania's own zones no longer set this. Their assets are named after the canonical
   * key, so short name and asset key are the same string and there is nothing to
   * translate. It remains for the EverQuest zones further down, which are still
   * reachable under their original identity.
   */
  readonly assetKey?: string;
  /**
   * Read-only legacy source used when rebuilding a canonically renamed world.
   * This never changes the runtime asset key.
   */
  readonly legacySourceKey?: string;
  /** Legacy metadata may intentionally remain authoritative after a rename. */
  readonly legacyMetadataKey?: string;
  readonly aliases?: readonly string[];
}

export const supportedZones: Record<string | number, SupportedZone> = {
  '1': {
    shortName: 'talioslowharbor',
    longName : 'Talios Lowharbor',
    legacySourceKey: 'qeynos',
    aliases  : ['lowharbor'],
  },
  '2': {
    shortName: 'talioscrownward',
    longName : 'Talios Crownward',
    legacySourceKey: 'qeynos2',
    legacyMetadataKey: 'qeynos2',
    aliases  : ['crownward'],
  },
  '3': {
    shortName: 'greenveil',
    longName : 'The Greenveil',
    legacySourceKey: 'qrg',
    aliases  : ['alderhollow'],
  },
  '4': {
    shortName: 'greymarch',
    longName : 'The Greymarch',
    legacySourceKey: 'qeytoqrg',
  },
  '6': {
    shortName: 'highkeep',
    longName : 'HighKeep',
  },
  '8': {
    shortName: 'freportn',
    longName : 'North Freeport',
  },
  '9': {
    shortName: 'freportw',
    longName : 'West Freeport',
  },
  '10': {
    shortName: 'freporte',
    longName : 'East Freeport',
  },
  '11': {
    shortName: 'runnyeye',
    longName : 'Clan RunnyEye',
  },
  '12': {
    shortName: 'qey2hh1',
    longName : 'West Karana',
  },
  '13': {
    shortName: 'northkarana',
    longName : 'North Karana',
  },
  '14': {
    shortName: 'southkarana',
    longName : 'South Karana',
  },
  '15': {
    shortName: 'eastkarana',
    longName : 'East Karana',
  },
  '16': {
    shortName: 'beholder',
    longName : 'Gorge of King Xorbb',
  },
  '17': {
    shortName: 'blackrootwarrens',
    longName : 'Blackroot Warrens',
    legacySourceKey: 'blackburrow',
    aliases  : ['blackroot'],
  },
  '18': {
    shortName: 'paw',
    longName : 'Infected Paw',
  },
  '19': {
    shortName: 'rivervale',
    longName : 'Rivervale',
  },
  '20': {
    shortName: 'kithicor',
    longName : 'Kithicor Forest',
  },
  '21': {
    shortName: 'commons',
    longName : 'West Commonlands',
  },
  '22': {
    shortName: 'ecommons',
    longName : 'East Commonlands',
  },
  '23': {
    shortName: 'erudnint',
    longName : 'Erudin Palace',
  },
  '24': {
    shortName: 'erudnext',
    longName : 'Erudin',
  },
  '25': {
    shortName: 'nektulos',
    longName : 'Nektulos Forest',
  },
  '27': {
    shortName: 'lavastorm',
    longName : 'Lavastorm Mountains',
  },
  '29': {
    shortName: 'halas',
    longName : 'Halas',
  },
  '30': {
    shortName: 'everfrost',
    longName : 'Everfrost Peaks',
  },
  '31': {
    shortName: 'soldunga',
    longName : 'Solusek\'s Eye',
  },
  '32': {
    shortName: 'soldungb',
    longName : 'Nagafen\'s Lair',
  },
  '33': {
    shortName: 'misty',
    longName : 'Misty Thicket',
  },
  '34': {
    shortName: 'nro',
    longName : 'North Ro',
  },
  '35': {
    shortName: 'southro',
    longName : 'South Ro',
  },
  '36': {
    shortName: 'mournvault',
    longName : 'Mournvault: The First Descent',
    legacySourceKey: 'befallen',
  },
  '37': {
    shortName: 'oasis',
    longName : 'Oasis of Marr',
  },
  '38': {
    shortName: 'tox',
    longName : 'Toxxulia Forest',
  },
  '39': {
    shortName: 'hole',
    longName : 'The Ruins of Old Paineel',
  },
  '40': {
    shortName: 'neriaka',
    longName : 'Neriak Foreign Quarter',
  },
  '41': {
    shortName: 'neriakb',
    longName : 'Neriak Commons',
  },
  '42': {
    shortName: 'neriakc',
    longName : 'Neriak Third Gate',
  },
  '43': {
    shortName: 'neriakd',
    longName : 'Neriak Palace',
  },
  '44': {
    shortName: 'najena',
    longName : 'Najena',
  },
  '45': {
    shortName: 'qcat',
    longName : 'The Talios Undervault',
  },
  '46': {
    shortName: 'innothule',
    longName : 'Innothule Swamp',
  },
  '47': {
    shortName: 'feerrott',
    longName : 'The Feerrott(A)',
  },
  '48': {
    shortName: 'cazicthule',
    longName : 'Cazic-Thule',
  },
  '49': {
    shortName: 'oggok',
    longName : 'Oggok',
  },
  '94': {
    shortName: 'emeraldjungle',
    longName : 'The Emerald Jungle',
  },
  '50': {
    shortName: 'rathemtn',
    longName : 'Mountains of Rathe',
  },
  '51': {
    shortName: 'lakerathe',
    longName : 'Lake Rathetear',
  },
  '52': {
    shortName: 'grobb',
    longName : 'Grobb',
  },
  '54': {
    shortName: 'gfaydark',
    longName : 'The Greater Faydark',
  },
  '55': {
    shortName: 'akanon',
    longName : 'Ak\'Anon',
  },
  '56': {
    shortName: 'steamfont',
    longName : 'Steamfont Mountains',
  },
  '57': {
    shortName: 'lfaydark',
    longName : 'The Lesser Faydark',
  },
  '58': {
    shortName: 'crushbone',
    longName : 'Clan Crushbone',
  },
  '59': {
    shortName: 'mistmoore',
    longName : 'Castle Mistmoore',
  },
  '60': {
    shortName: 'kaladima',
    longName : 'South Kaladim',
  },
  '61': {
    shortName: 'felwithea',
    longName : 'Felwithe (A)',
  },
  '62': {
    shortName: 'felwitheb',
    longName : 'Felwithe (B)',
  },
  '63': {
    shortName: 'unrest',
    longName : 'Estate of Unrest',
  },
  '64': {
    shortName: 'kedge',
    longName : 'Kedge Keep',
  },
  '65': {
    shortName: 'guktop',
    longName : 'Upper Guk',
  },
  '66': {
    shortName: 'gukbottom',
    longName : 'Lower Guk',
  },
  '67': {
    shortName: 'kaladimb',
    longName : 'Kaladim (B)',
  },
  '68': {
    shortName: 'butcher',
    longName : 'Butcherblock Mountains',
  },
  '69': {
    shortName: 'oot',
    longName : 'Ocean of Tears',
  },
  '70': {
    shortName: 'cauldron',
    longName : 'Dagnor\'s Cauldron',
  },
  '71': {
    shortName: 'airplane',
    longName : 'Plane of Sky',
  },
  '72': {
    shortName: 'fearplane',
    longName : 'Plane of Fear',
  },
  '73': {
    shortName: 'permafrost',
    longName : 'Permafrost Keep',
  },
  '74': {
    shortName: 'kerraridge',
    longName : 'Kerra Isle',
  },
  '75': {
    shortName: 'paineel',
    longName : 'Paineel',
  },
  '76': {
    shortName: 'hateplane',
    longName : 'The Plane of Hate',
  },
  '77': {
    shortName: 'arena',
    longName : 'The Arena',
  },
  '98': {
    shortName: 'erudsxing',
    longName : 'Erud\'s Crossing',
  },
  '100': {
    shortName: 'stonebrunt',
    longName : 'Stonebrunt Mountains',
  },
  '101': {
    shortName: 'warrens',
    longName : 'The Warrens',
  },
};

export function getZoneAssetKey(zoneName: string): string {
  const normalized = zoneName.toLowerCase().replaceAll('-', '').trim();
  for (const zone of Object.values(supportedZones)) {
    const sName = zone.shortName.toLowerCase().replaceAll('-', '');
    const aKey = zone.assetKey ? zone.assetKey.toLowerCase().replaceAll('-', '') : sName;
    if (
      sName === normalized ||
      aKey === normalized ||
      zone.aliases?.some((alias) => alias.toLowerCase().replaceAll('-', '') === normalized)
    ) {
      return zone.assetKey ?? zone.shortName;
    }
  }
  return normalized;
}

export function findSupportedZone(input: string): [string, SupportedZone] | undefined {
  const normalized = input.toLowerCase().replaceAll('-', '').trim();
  return Object.entries(supportedZones).find(
    ([, zone]) => {
      const sName = zone.shortName.toLowerCase().replaceAll('-', '');
      const aKey = zone.assetKey ? zone.assetKey.toLowerCase().replaceAll('-', '') : sName;
      return (
        sName === normalized ||
        aKey === normalized ||
        zone.aliases?.some((alias) => alias.toLowerCase().replaceAll('-', '') === normalized)
      );
    },
  );
}
