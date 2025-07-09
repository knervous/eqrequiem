import { Skills, ActiveCombatSkills } from '@game/Constants/skills';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';


export class PlayerCombat {
  constructor(private player: Player) {
  }

  public doCombatAction(actionData: ActionButtonData<Skills>) {
    switch (actionData.data) {
      case ActiveCombatSkills[Skills.Kick]:
        break;
      case ActiveCombatSkills[Skills.ApplyPoison]:
        break;
      case ActiveCombatSkills[Skills.Backstab]:
        break;
      case ActiveCombatSkills[Skills.Bash]:
        break;
      case ActiveCombatSkills[Skills.Disarm]:
        break;
      case ActiveCombatSkills[Skills.DragonPunchTailRake]:
        break;
      case ActiveCombatSkills[Skills.DualWield]:
        break;
      case ActiveCombatSkills[Skills.EagleStrike]:
        break;
      case ActiveCombatSkills[Skills.Evocation]:
        break;
      case ActiveCombatSkills[Skills.FlyingKick]:
        break;
      case ActiveCombatSkills[Skills.Kick]:
        break;
      case ActiveCombatSkills[Skills.RoundKick]:
        break;
      default: break;
    }
  }
}
