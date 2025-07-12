import { BaseCommandHandler } from './command-base';
import { CommandHandler } from './command-handler';
import { GMCommandHandler } from './gm-command-handler';


export class CommandParser {
  public static parseCommand(command: string): void {
    if (!command || command.trim() === '') {
      return;
    }
    let handler: BaseCommandHandler = CommandHandler.instance();
    switch (command[0]) {
      case '/':
        command = command.slice(1);
        break;
      case '#':
        command = command.slice(1);
        handler = GMCommandHandler.instance();
        break;
      default:
        command = `say ${command}`;
        break;
    }
    handler.parseCommand(command);
  }
}
