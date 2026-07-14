
import { CommandMessage } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { WorldSocket } from '@ui/net/instances';
import { addChatLine, addChatLines } from './chat-message';
import { BaseCommandHandler, command } from './command-base';
import { requestZoneByShortName } from './command-handler';

export class GMCommandHandler extends BaseCommandHandler {
  @command('help')
  commandHelp() {
    addChatLines(`
           ----- Available commands -----
           #level {level} - Sets your level
           #searchitem {name} - Searches for items by name
           #summonitem {itemId} - Summons an item by its ID [Alias: #si]
           #purgeitems - Removes all offline inventory items
           #gearup - Equips a full set of gear
           #zone {shortname} - Zones by short name

           ----- Keyboard Hotkeys -----
           Space: Jump
           Shift: Sprint
           Ctrl: Crouch
           WASD: Movement
           Mouse: Look around
           U: Toggle UI
           ------ GM Commands -----
           #help - Lists GM commands
       `);
  }

  @command('zone')
  commandZone(args: string[]) {
    requestZoneByShortName(args[0]);
  }
  @command('level')
  commandLevel(args: string[]) {
    const level = parseInt(args[0], 10);
    if (isNaN(level) || level < 1 || level > 50) {
      addChatLine('Invalid level specified');
      return;
    }
    WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
      command: 'level',
      args   : [level.toString()],
    });
  }

  @command('searchitem')
  commandSearchItem(args: string[]) {
    if (args.length === 0) {
      addChatLine('Please specify an item name to search for');
      return;
    }
    const itemName = args.join(' ');
    WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
      command: 'searchitem',
      args   : [itemName],
    });
  } 
  @command(['summonitem', 'si'])
  commandSummonItem(args: string[]) {
    if (args.length === 0) {
      addChatLine('Please specify an item ID to summon');
      return;
    }
    const itemId = args[0];
    if (isNaN(Number(itemId))) {
      addChatLine('Invalid item ID specified');
      return;
    }
    WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
      command: 'summonitem',
      args   : [itemId],
    });
  }

  @command('purgeitems')
  commandPurgeItems() {
    WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
      command: 'purgeitems',
      args   : [],
    });
  }

  @command('gearup')
  commandGearUp() {
    WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
      command: 'gearup',
      args   : [],
    });
  }
}
