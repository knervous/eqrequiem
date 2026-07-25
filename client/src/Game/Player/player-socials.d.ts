import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';
export declare class PlayerSocials {
    private player;
    constructor(player: Player);
    doSocial(actionData: ActionButtonData<string[]>): void;
}
