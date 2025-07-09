import { CommandHandler } from '@game/ChatCommands/command-handler';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';


export class PlayerSocials {
  constructor(private player: Player) {
  }

  public doSocial(actionData: ActionButtonData<string[]>) {
    for (const line of actionData.data ?? ([] as string[])) {
      console.log('Executing social command:', line);
      CommandHandler.instance.parseCommand(line.slice(1));
    }
  }
}
