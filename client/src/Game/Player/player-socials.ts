import { CommandHandler } from '@game/ChatCommands/command-handler';
import { CommandParser } from '@game/ChatCommands/command-parser';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import type Player from './player';


export class PlayerSocials {
  constructor(private player: Player) {
  }

  public doSocial(actionData: ActionButtonData<string[]>) {
    for (const line of actionData.data ?? ([] as string[])) {
      console.log('Executing social command:', line);
      CommandParser.parseCommand(line);
    }
  }
}
