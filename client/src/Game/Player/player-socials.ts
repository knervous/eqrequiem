import { CommandParser } from '@game/ChatCommands/command-parser';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';


export class PlayerSocials {
  public doSocial(actionData: ActionButtonData<string[]>) {
    for (const line of actionData.data ?? ([] as string[])) {
      console.log('Executing social command:', line);
      CommandParser.parseCommand(line);
    }
  }
}
