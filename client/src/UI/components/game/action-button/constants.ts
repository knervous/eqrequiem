// File: client/src/UI/components/game/action-button/constants.ts
export enum ActionButtonType {
  SPELLS = 0,
  COMBAT = 1,
  SOCIALS = 2,
  ABILITIES = 3,
  INVENTORY = 4,
  OPTIONS = 5,
  HELP = 6,
  PERSONA = 7,
  WHO = 8,
  INVITE = 9,
  DISBAND = 10,
  CAMP = 11,
  SIT = 12,
  WALK = 13,
  MELEE_ATTACK = 14,
  RANGED_ATTACK = 15,
}

export const UIActions = {
  [ActionButtonType.WHO]: {
    type: ActionButtonType.WHO,
  },
  [ActionButtonType.INVITE]: {
    type: ActionButtonType.INVITE,
  },
  [ActionButtonType.DISBAND]: {
    type: ActionButtonType.DISBAND,
  },
  [ActionButtonType.CAMP]: {
    type: ActionButtonType.CAMP,
  },
  [ActionButtonType.SIT]: {
    type: ActionButtonType.SIT,
  },
  [ActionButtonType.WALK]: {
    type: ActionButtonType.WALK,
  },
  [ActionButtonType.MELEE_ATTACK]: {
    type: ActionButtonType.MELEE_ATTACK,
  },
  [ActionButtonType.RANGED_ATTACK]: {
    type: ActionButtonType.RANGED_ATTACK,
  },
  [ActionButtonType.HELP]: {
    type: ActionButtonType.HELP,
  },
  [ActionButtonType.PERSONA]: {
    type: ActionButtonType.PERSONA,
  },
  [ActionButtonType.OPTIONS]: {
    type: ActionButtonType.OPTIONS,
  },
};

export enum ActionType {
  // Combat
  MELEE_ATTACK = 0,
  RANGED_ATTACK = 1,
  COMBAT = 2,
  // Abilities
  ABILITY = 3,
  // Socials
  SOCIAL = 4,
  // Spells
  CAST_SPELL = 5,
  // Inventory
  INVENTORY = 6,
}

export interface ActionButtonData<T = any> {
  type: ActionButtonType;
  action?: ActionType;
  label?: string;
  color?: string;
  index?: number;
  data?: T;
}
