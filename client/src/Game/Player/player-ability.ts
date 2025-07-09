import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';


export class PlayerAbility {
  constructor(private player: Player) {
  }

  public doAbility(actionData: ActionButtonData<any>) {
    switch (actionData.data) {
     
      default: break;
    }
  }
}
