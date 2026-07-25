import { Skills } from '@game/Constants/skills';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';
export declare class PlayerCombat {
    private player;
    constructor(player: Player);
    doCombatAction(actionData: ActionButtonData<Skills>): void;
}
