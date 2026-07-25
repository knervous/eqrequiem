export declare enum ActionButtonType {
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
    RANGED_ATTACK = 15
}
export declare const UIActions: {
    8: {
        type: ActionButtonType;
    };
    9: {
        type: ActionButtonType;
    };
    10: {
        type: ActionButtonType;
    };
    11: {
        type: ActionButtonType;
    };
    12: {
        type: ActionButtonType;
    };
    13: {
        type: ActionButtonType;
    };
    14: {
        type: ActionButtonType;
    };
    15: {
        type: ActionButtonType;
    };
    6: {
        type: ActionButtonType;
    };
    7: {
        type: ActionButtonType;
    };
    5: {
        type: ActionButtonType;
    };
};
export declare enum ActionType {
    MELEE_ATTACK = 0,
    RANGED_ATTACK = 1,
    COMBAT = 2,
    ABILITY = 3,
    SOCIAL = 4,
    CAST_SPELL = 5,
    INVENTORY = 6
}
export type HotButtonData = {
    hotButton?: boolean;
    hotButtonIndex?: number;
};
export interface ActionButtonData<T = any> {
    type: ActionButtonType;
    action?: ActionType;
    label?: string;
    color?: string;
    index?: number;
    data?: T;
}
export type FullActionData = ActionButtonData & HotButtonData;
export type ItemEntryData = {
    slot: number;
};
export type FullItemEntryData = ItemEntryData & HotButtonData;
