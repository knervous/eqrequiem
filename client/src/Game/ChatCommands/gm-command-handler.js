var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { CommandMessage } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { WorldSocket } from '@ui/net/instances';
import { addChatLine, addChatLines } from './chat-message';
import { BaseCommandHandler, command } from './command-base';
import { requestZoneByShortName } from './command-handler';
export class GMCommandHandler extends BaseCommandHandler {
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
    commandZone(args) {
        requestZoneByShortName(args[0]);
    }
    commandLevel(args) {
        const level = parseInt(args[0], 10);
        if (isNaN(level) || level < 1 || level > 50) {
            addChatLine('Invalid level specified');
            return;
        }
        WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
            command: 'level',
            args: [level.toString()],
        });
    }
    commandSearchItem(args) {
        if (args.length === 0) {
            addChatLine('Please specify an item name to search for');
            return;
        }
        const itemName = args.join(' ');
        WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
            command: 'searchitem',
            args: [itemName],
        });
    }
    commandSummonItem(args) {
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
            args: [itemId],
        });
    }
    commandPurgeItems() {
        WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
            command: 'purgeitems',
            args: [],
        });
    }
    commandGearUp() {
        WorldSocket.sendMessage(OpCodes.GMCommand, CommandMessage, {
            command: 'gearup',
            args: [],
        });
    }
}
__decorate([
    command('help')
], GMCommandHandler.prototype, "commandHelp", null);
__decorate([
    command('zone')
], GMCommandHandler.prototype, "commandZone", null);
__decorate([
    command('level')
], GMCommandHandler.prototype, "commandLevel", null);
__decorate([
    command('searchitem')
], GMCommandHandler.prototype, "commandSearchItem", null);
__decorate([
    command(['summonitem', 'si'])
], GMCommandHandler.prototype, "commandSummonItem", null);
__decorate([
    command('purgeitems')
], GMCommandHandler.prototype, "commandPurgeItems", null);
__decorate([
    command('gearup')
], GMCommandHandler.prototype, "commandGearUp", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ20tY29tbWFuZC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ20tY29tbWFuZC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDNUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzdELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRTNELE1BQU0sT0FBTyxnQkFBaUIsU0FBUSxrQkFBa0I7SUFFdEQsV0FBVztRQUNULFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O1FBa0JULENBQUMsQ0FBQztJQUNSLENBQUM7SUFHRCxXQUFXLENBQUMsSUFBYztRQUN4QixzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsWUFBWSxDQUFDLElBQWM7UUFDekIsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxFQUFFLEVBQUUsQ0FBQztZQUM1QyxXQUFXLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUN2QyxPQUFPO1FBQ1QsQ0FBQztRQUNELFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUU7WUFDekQsT0FBTyxFQUFFLE9BQU87WUFDaEIsSUFBSSxFQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQzVCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFHRCxpQkFBaUIsQ0FBQyxJQUFjO1FBQzlCLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixXQUFXLENBQUMsMkNBQTJDLENBQUMsQ0FBQztZQUN6RCxPQUFPO1FBQ1QsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRTtZQUN6RCxPQUFPLEVBQUUsWUFBWTtZQUNyQixJQUFJLEVBQUssQ0FBQyxRQUFRLENBQUM7U0FDcEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGlCQUFpQixDQUFDLElBQWM7UUFDOUIsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3RCLFdBQVcsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO1lBQ25ELE9BQU87UUFDVCxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDMUIsV0FBVyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDekMsT0FBTztRQUNULENBQUM7UUFDRCxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsY0FBYyxFQUFFO1lBQ3pELE9BQU8sRUFBRSxZQUFZO1lBQ3JCLElBQUksRUFBSyxDQUFDLE1BQU0sQ0FBQztTQUNsQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBR0QsaUJBQWlCO1FBQ2YsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRTtZQUN6RCxPQUFPLEVBQUUsWUFBWTtZQUNyQixJQUFJLEVBQUssRUFBRTtTQUNaLENBQUMsQ0FBQztJQUNMLENBQUM7SUFHRCxhQUFhO1FBQ1gsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRTtZQUN6RCxPQUFPLEVBQUUsUUFBUTtZQUNqQixJQUFJLEVBQUssRUFBRTtTQUNaLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5GQztJQURDLE9BQU8sQ0FBQyxNQUFNLENBQUM7bURBcUJmO0FBR0Q7SUFEQyxPQUFPLENBQUMsTUFBTSxDQUFDO21EQUdmO0FBRUQ7SUFEQyxPQUFPLENBQUMsT0FBTyxDQUFDO29EQVdoQjtBQUdEO0lBREMsT0FBTyxDQUFDLFlBQVksQ0FBQzt5REFXckI7QUFFRDtJQURDLE9BQU8sQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQzt5REFlN0I7QUFHRDtJQURDLE9BQU8sQ0FBQyxZQUFZLENBQUM7eURBTXJCO0FBR0Q7SUFEQyxPQUFPLENBQUMsUUFBUSxDQUFDO3FEQU1qQiIsInNvdXJjZXNDb250ZW50IjpbIlxuaW1wb3J0IHsgQ29tbWFuZE1lc3NhZ2UgfSBmcm9tICdAZ2FtZS9OZXQvbWVzc2FnZXMnO1xuaW1wb3J0IHsgT3BDb2RlcyB9IGZyb20gJ0BnYW1lL05ldC9vcGNvZGVzJztcbmltcG9ydCB7IFdvcmxkU29ja2V0IH0gZnJvbSAnQHVpL25ldC9pbnN0YW5jZXMnO1xuaW1wb3J0IHsgYWRkQ2hhdExpbmUsIGFkZENoYXRMaW5lcyB9IGZyb20gJy4vY2hhdC1tZXNzYWdlJztcbmltcG9ydCB7IEJhc2VDb21tYW5kSGFuZGxlciwgY29tbWFuZCB9IGZyb20gJy4vY29tbWFuZC1iYXNlJztcbmltcG9ydCB7IHJlcXVlc3Rab25lQnlTaG9ydE5hbWUgfSBmcm9tICcuL2NvbW1hbmQtaGFuZGxlcic7XG5cbmV4cG9ydCBjbGFzcyBHTUNvbW1hbmRIYW5kbGVyIGV4dGVuZHMgQmFzZUNvbW1hbmRIYW5kbGVyIHtcbiAgQGNvbW1hbmQoJ2hlbHAnKVxuICBjb21tYW5kSGVscCgpIHtcbiAgICBhZGRDaGF0TGluZXMoYFxuICAgICAgICAgICAtLS0tLSBBdmFpbGFibGUgY29tbWFuZHMgLS0tLS1cbiAgICAgICAgICAgI2xldmVsIHtsZXZlbH0gLSBTZXRzIHlvdXIgbGV2ZWxcbiAgICAgICAgICAgI3NlYXJjaGl0ZW0ge25hbWV9IC0gU2VhcmNoZXMgZm9yIGl0ZW1zIGJ5IG5hbWVcbiAgICAgICAgICAgI3N1bW1vbml0ZW0ge2l0ZW1JZH0gLSBTdW1tb25zIGFuIGl0ZW0gYnkgaXRzIElEIFtBbGlhczogI3NpXVxuICAgICAgICAgICAjcHVyZ2VpdGVtcyAtIFJlbW92ZXMgYWxsIG9mZmxpbmUgaW52ZW50b3J5IGl0ZW1zXG4gICAgICAgICAgICNnZWFydXAgLSBFcXVpcHMgYSBmdWxsIHNldCBvZiBnZWFyXG4gICAgICAgICAgICN6b25lIHtzaG9ydG5hbWV9IC0gWm9uZXMgYnkgc2hvcnQgbmFtZVxuXG4gICAgICAgICAgIC0tLS0tIEtleWJvYXJkIEhvdGtleXMgLS0tLS1cbiAgICAgICAgICAgU3BhY2U6IEp1bXBcbiAgICAgICAgICAgU2hpZnQ6IFNwcmludFxuICAgICAgICAgICBDdHJsOiBDcm91Y2hcbiAgICAgICAgICAgV0FTRDogTW92ZW1lbnRcbiAgICAgICAgICAgTW91c2U6IExvb2sgYXJvdW5kXG4gICAgICAgICAgIFU6IFRvZ2dsZSBVSVxuICAgICAgICAgICAtLS0tLS0gR00gQ29tbWFuZHMgLS0tLS1cbiAgICAgICAgICAgI2hlbHAgLSBMaXN0cyBHTSBjb21tYW5kc1xuICAgICAgIGApO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3pvbmUnKVxuICBjb21tYW5kWm9uZShhcmdzOiBzdHJpbmdbXSkge1xuICAgIHJlcXVlc3Rab25lQnlTaG9ydE5hbWUoYXJnc1swXSk7XG4gIH1cbiAgQGNvbW1hbmQoJ2xldmVsJylcbiAgY29tbWFuZExldmVsKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbGV2ZWwgPSBwYXJzZUludChhcmdzWzBdLCAxMCk7XG4gICAgaWYgKGlzTmFOKGxldmVsKSB8fCBsZXZlbCA8IDEgfHwgbGV2ZWwgPiA1MCkge1xuICAgICAgYWRkQ2hhdExpbmUoJ0ludmFsaWQgbGV2ZWwgc3BlY2lmaWVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFdvcmxkU29ja2V0LnNlbmRNZXNzYWdlKE9wQ29kZXMuR01Db21tYW5kLCBDb21tYW5kTWVzc2FnZSwge1xuICAgICAgY29tbWFuZDogJ2xldmVsJyxcbiAgICAgIGFyZ3MgICA6IFtsZXZlbC50b1N0cmluZygpXSxcbiAgICB9KTtcbiAgfVxuXG4gIEBjb21tYW5kKCdzZWFyY2hpdGVtJylcbiAgY29tbWFuZFNlYXJjaEl0ZW0oYXJnczogc3RyaW5nW10pIHtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDApIHtcbiAgICAgIGFkZENoYXRMaW5lKCdQbGVhc2Ugc3BlY2lmeSBhbiBpdGVtIG5hbWUgdG8gc2VhcmNoIGZvcicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpdGVtTmFtZSA9IGFyZ3Muam9pbignICcpO1xuICAgIFdvcmxkU29ja2V0LnNlbmRNZXNzYWdlKE9wQ29kZXMuR01Db21tYW5kLCBDb21tYW5kTWVzc2FnZSwge1xuICAgICAgY29tbWFuZDogJ3NlYXJjaGl0ZW0nLFxuICAgICAgYXJncyAgIDogW2l0ZW1OYW1lXSxcbiAgICB9KTtcbiAgfSBcbiAgQGNvbW1hbmQoWydzdW1tb25pdGVtJywgJ3NpJ10pXG4gIGNvbW1hbmRTdW1tb25JdGVtKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICBhZGRDaGF0TGluZSgnUGxlYXNlIHNwZWNpZnkgYW4gaXRlbSBJRCB0byBzdW1tb24nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaXRlbUlkID0gYXJnc1swXTtcbiAgICBpZiAoaXNOYU4oTnVtYmVyKGl0ZW1JZCkpKSB7XG4gICAgICBhZGRDaGF0TGluZSgnSW52YWxpZCBpdGVtIElEIHNwZWNpZmllZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBXb3JsZFNvY2tldC5zZW5kTWVzc2FnZShPcENvZGVzLkdNQ29tbWFuZCwgQ29tbWFuZE1lc3NhZ2UsIHtcbiAgICAgIGNvbW1hbmQ6ICdzdW1tb25pdGVtJyxcbiAgICAgIGFyZ3MgICA6IFtpdGVtSWRdLFxuICAgIH0pO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3B1cmdlaXRlbXMnKVxuICBjb21tYW5kUHVyZ2VJdGVtcygpIHtcbiAgICBXb3JsZFNvY2tldC5zZW5kTWVzc2FnZShPcENvZGVzLkdNQ29tbWFuZCwgQ29tbWFuZE1lc3NhZ2UsIHtcbiAgICAgIGNvbW1hbmQ6ICdwdXJnZWl0ZW1zJyxcbiAgICAgIGFyZ3MgICA6IFtdLFxuICAgIH0pO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2dlYXJ1cCcpXG4gIGNvbW1hbmRHZWFyVXAoKSB7XG4gICAgV29ybGRTb2NrZXQuc2VuZE1lc3NhZ2UoT3BDb2Rlcy5HTUNvbW1hbmQsIENvbW1hbmRNZXNzYWdlLCB7XG4gICAgICBjb21tYW5kOiAnZ2VhcnVwJyxcbiAgICAgIGFyZ3MgICA6IFtdLFxuICAgIH0pO1xuICB9XG59XG4iXX0=