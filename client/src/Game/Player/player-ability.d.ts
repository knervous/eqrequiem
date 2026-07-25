import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';
export declare class PlayerAbility {
    private player;
    constructor(player: Player);
    doAbility(actionData: ActionButtonData<any>): void;
}
