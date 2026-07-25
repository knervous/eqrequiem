var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import { CLASS_DATA_NAMES } from '@game/Constants/class-data';
import RACE_DATA from '@game/Constants/race-data';
import { supportedZones } from '@game/Constants/supportedZones';
import emitter from '@game/Events/events';
import GameManager from '@game/Manager/game-manager';
import { ChannelMessage } from '@game/Net/messages';
import { RequestClientZoneChange, ZoneChangeType, } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import { WorldSocket } from '@ui/net/instances';
import { addChatLine, addChatLines } from './chat-message';
import { BaseCommandHandler, command } from './command-base';
export function requestZoneByShortName(rawZone) {
    const zone = rawZone?.trim().toLowerCase();
    if (!zone) {
        addChatLine('Usage: /zone {shortname} or #zone {shortname}');
        return;
    }
    const supportedZone = Object.values(supportedZones).find((value) => value.shortName.toLowerCase() === zone);
    if (!supportedZone) {
        addChatLine(`Zone '${zone}' not found. Type /listzones to see available zones.`);
        return;
    }
    if (!WorldSocket.isConnected) {
        void GameManager.instance.loadZone(supportedZone.shortName);
        void GameManager.instance.instantiatePlayer({
            race: 1,
            charClass: 1,
            name: 'Soandso',
            x: 15,
            y: 15,
            z: 15,
            face: 4,
        });
        return;
    }
    WorldSocket.sendMessage(OpCodes.RequestClientZoneChange, RequestClientZoneChange, {
        type: ZoneChangeType.FROM_ZONE,
        zoneId: supportedZone.shortName,
    });
    addChatLine(`Zoning to ${supportedZone.longName}...`);
}
export class CommandHandler extends BaseCommandHandler {
    setMode = null;
    setModeHandler(setMode) {
        this.setMode = setMode;
    }
    commandSpeed(args) {
        if (+args[0] > 0 && Player.instance?.playerMovement) {
            Player.instance.playerMovement.moveSpeed = +args[0];
            addChatLine(`Speed set to ${args[0]}`);
        }
        else {
            addChatLine('Invalid speed value');
        }
    }
    commandSit() {
        if (Player.instance) {
            Player.instance.toggleSit();
        }
    }
    commandWalk() {
        if (Player.instance) {
            Player.instance.toggleWalk();
        }
    }
    commandHelp() {
        addChatLines(`
        ----- Available commands -----
        /zone {shortname} - Example /zone qeynos2
        /spawn {model} - Example /spawn hum
        /controls - Displays controls
        /goto - Teleports you to the specified coordinates or current target, example: /goto 100 200 300
        /target {name}
        /zone - Changes your zone, example: /zone qeynos2
        /listzones - Lists all available zones
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
    commandLocation() {
        if (Player.instance?.getPlayerPosition() !== undefined) {
            const { x, y, z } = Player.instance.getPlayerPosition();
            addChatLine(`Your current location is: X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);
        }
        else {
            addChatLine('You are not in the game or your player entity is not initialized.');
        }
    }
    commandControls() {
        addChatLines([
            'Movement: W, A, S, D',
            'Jump (Up): Space',
            'Sprint: Shift',
            'Crouch (Down): Ctrl',
            'Look around: Mouse with Right Click = Mouse lock',
        ]);
    }
    commandTarget(args) {
        const targetName = args.join(' ').trim();
        if (!targetName) {
            return;
        }
        const entity = Player.instance?.playerEntity?.getClosestSpawns(1, (s) => s.cleanName.toLowerCase().startsWith(targetName.toLowerCase()))?.[0];
        if (entity && Player.instance) {
            Player.instance.Target = entity;
        }
    }
    commandListZones() {
        const zoneList = Object.entries(supportedZones)
            .map(([, value]) => `${value.shortName} - ${value.longName}`)
            .join('\n');
        addChatLines(`Available zones:\n${zoneList}`);
        addChatLine('To change zones, use: /zone {shortname}');
    }
    commandZone(args) {
        requestZoneByShortName(args[0]);
    }
    // @command("ooc")
    // commandOoc(args: string[]) {
    //   alert("TODO fill me in!");
    // }
    commandWho() {
        if (!GameManager.instance.ZoneManager?.CurrentZone) {
            return;
        }
        const entities = GameManager.instance.ZoneManager?.EntityPool?.getPlayerEntities() ?? [];
        addChatLine(`----- There are ${entities.length} players in ${GameManager.instance.ZoneManager?.CurrentZone?.longName} -----`);
        addChatLines(entities.map((e) => `[${e.spawn.level} ${RACE_DATA[e.spawn.race]?.name ?? 'Unknown'} ${CLASS_DATA_NAMES[e.spawn.charClass]}] ${e.spawn.name}`));
    }
    commandInvite(args) {
        console.log('Invite command not implemented yet.', args);
    }
    commandDisband() {
        console.log('Disband command not implemented yet.');
    }
    commandOptions() {
        addChatLine('Options command not implemented yet.');
    }
    commandPersona() {
        addChatLine('Persona command not implemented yet.');
    }
    commandSay(args) {
        const message = args.join(' ');
        if (message) {
            addChatLine(`You say, '${message}'`);
            WorldSocket.sendStreamMessage(OpCodes.ChannelMessage, ChannelMessage, {
                sender: Player.instance?.player?.name ?? '',
                targetname: Player.instance?.Target?.spawn?.name,
                chanNum: 0,
                message,
            });
        }
    }
    commandCamp() {
        GameManager.instance?.dispose();
        WorldSocket.sendMessage(OpCodes.Camp, null, null);
        setTimeout(() => {
            emitter.emit('setMode', 'character-select');
        }, 100);
    }
    commandNod() {
        Player.instance?.playAnimation(AnimationDefinitions.Nod, true);
    }
    commandAmaze() {
        Player.instance?.playAnimation(AnimationDefinitions.Amaze, true);
    }
    commandPlead() {
        Player.instance?.playAnimation(AnimationDefinitions.Plead, true);
    }
    commandClap() {
        Player.instance?.playAnimation(AnimationDefinitions.Clap, true);
    }
    commandHungry() {
        Player.instance?.playAnimation(AnimationDefinitions.Hungry, true);
    }
    commandBlush() {
        Player.instance?.playAnimation(AnimationDefinitions.Blush, true);
    }
    commandChuckle() {
        Player.instance?.playAnimation(AnimationDefinitions.Chuckle, true);
    }
    commandCough() {
        Player.instance?.playAnimation(AnimationDefinitions.Cough, true);
    }
    commandDuck() {
        Player.instance?.playAnimation(AnimationDefinitions.Duck, true);
    }
    commandPuzzle() {
        Player.instance?.playAnimation(AnimationDefinitions.Puzzle, true);
    }
    commandDance() {
        Player.instance?.playAnimation(AnimationDefinitions.Dance, true);
    }
    commandBlink() {
        Player.instance?.playAnimation(AnimationDefinitions.Blink, true);
    }
    commandGlare() {
        Player.instance?.playAnimation(AnimationDefinitions.Glare, true);
    }
    commandDrool() {
        Player.instance?.playAnimation(AnimationDefinitions.Drool, true);
    }
    commandKneel() {
        Player.instance?.playAnimation(AnimationDefinitions.Kneel, true);
    }
    commandLaugh() {
        Player.instance?.playAnimation(AnimationDefinitions.Laugh, true);
    }
    commandPoint() {
        Player.instance?.playAnimation(AnimationDefinitions.Point, true);
    }
    commandShrug() {
        Player.instance?.playAnimation(AnimationDefinitions.Shrug, true);
    }
    commandReady() {
        Player.instance?.playAnimation(AnimationDefinitions.Ready, true);
    }
    commandSalute() {
        Player.instance?.playAnimation(AnimationDefinitions.Salute, true);
    }
    commandShiver() {
        Player.instance?.playAnimation(AnimationDefinitions.Shiver, true);
    }
    commandTap() {
        Player.instance?.playAnimation(AnimationDefinitions.Tap, true);
    }
    commandBow() {
        Player.instance?.playAnimation(AnimationDefinitions.Bow, true);
    }
    commandWave() {
        Player.instance?.playAnimation(AnimationDefinitions.Wave, true);
    }
    commandCheer() {
        Player.instance?.playAnimation(AnimationDefinitions.Cheer, true);
    }
    commandRude() {
        Player.instance?.playAnimation(AnimationDefinitions.Rude, true);
    }
    commandHail() {
        this.commandSay([
            Player.instance?.Target
                ? `Hail, ${Player.instance.Target.cleanName}`
                : 'Hail',
        ]);
    }
    commandConsider() {
        if (Player.instance?.Target) {
            addChatLine(`You consider ${Player.instance.Target.cleanName}`);
        }
        else {
            addChatLine('You must target a creature to consider it.');
        }
    }
    commandGoto(args) {
        let x, y, z;
        if (args.length !== 3) {
            if (Player.instance?.Target) {
                const targetPosition = Player.instance.Target.spawnPosition;
                x = targetPosition.x;
                y = targetPosition.y;
                z = targetPosition.z;
            }
            else {
                addChatLine('Usage: /goto x y z');
                return;
            }
        }
        else {
            x = parseFloat(args[0]);
            y = parseFloat(args[1]);
            z = parseFloat(args[2]);
        }
        Player.instance?.setPosition(x, y, z);
    }
}
__decorate([
    command('speed')
], CommandHandler.prototype, "commandSpeed", null);
__decorate([
    command('sit')
], CommandHandler.prototype, "commandSit", null);
__decorate([
    command('walk')
], CommandHandler.prototype, "commandWalk", null);
__decorate([
    command('help')
], CommandHandler.prototype, "commandHelp", null);
__decorate([
    command('location')
], CommandHandler.prototype, "commandLocation", null);
__decorate([
    command('controls')
], CommandHandler.prototype, "commandControls", null);
__decorate([
    command('target')
], CommandHandler.prototype, "commandTarget", null);
__decorate([
    command('listzones')
], CommandHandler.prototype, "commandListZones", null);
__decorate([
    command('zone')
], CommandHandler.prototype, "commandZone", null);
__decorate([
    command('who')
], CommandHandler.prototype, "commandWho", null);
__decorate([
    command('invite')
], CommandHandler.prototype, "commandInvite", null);
__decorate([
    command('disband')
], CommandHandler.prototype, "commandDisband", null);
__decorate([
    command('options')
], CommandHandler.prototype, "commandOptions", null);
__decorate([
    command('persona')
], CommandHandler.prototype, "commandPersona", null);
__decorate([
    command('say')
], CommandHandler.prototype, "commandSay", null);
__decorate([
    command('camp')
], CommandHandler.prototype, "commandCamp", null);
__decorate([
    command('nod')
], CommandHandler.prototype, "commandNod", null);
__decorate([
    command('amaze')
], CommandHandler.prototype, "commandAmaze", null);
__decorate([
    command('plead')
], CommandHandler.prototype, "commandPlead", null);
__decorate([
    command('clap')
], CommandHandler.prototype, "commandClap", null);
__decorate([
    command('hungry')
], CommandHandler.prototype, "commandHungry", null);
__decorate([
    command('blush')
], CommandHandler.prototype, "commandBlush", null);
__decorate([
    command('chuckle')
], CommandHandler.prototype, "commandChuckle", null);
__decorate([
    command('cough')
], CommandHandler.prototype, "commandCough", null);
__decorate([
    command('duck')
], CommandHandler.prototype, "commandDuck", null);
__decorate([
    command('puzzle')
], CommandHandler.prototype, "commandPuzzle", null);
__decorate([
    command('dance')
], CommandHandler.prototype, "commandDance", null);
__decorate([
    command('blink')
], CommandHandler.prototype, "commandBlink", null);
__decorate([
    command('glare')
], CommandHandler.prototype, "commandGlare", null);
__decorate([
    command('drool')
], CommandHandler.prototype, "commandDrool", null);
__decorate([
    command('kneel')
], CommandHandler.prototype, "commandKneel", null);
__decorate([
    command('laugh')
], CommandHandler.prototype, "commandLaugh", null);
__decorate([
    command('point')
], CommandHandler.prototype, "commandPoint", null);
__decorate([
    command('shrug')
], CommandHandler.prototype, "commandShrug", null);
__decorate([
    command('ready')
], CommandHandler.prototype, "commandReady", null);
__decorate([
    command('salute')
], CommandHandler.prototype, "commandSalute", null);
__decorate([
    command('shiver')
], CommandHandler.prototype, "commandShiver", null);
__decorate([
    command('tap')
], CommandHandler.prototype, "commandTap", null);
__decorate([
    command('bow')
], CommandHandler.prototype, "commandBow", null);
__decorate([
    command('wave')
], CommandHandler.prototype, "commandWave", null);
__decorate([
    command('cheer')
], CommandHandler.prototype, "commandCheer", null);
__decorate([
    command('rude')
], CommandHandler.prototype, "commandRude", null);
__decorate([
    command('hail')
], CommandHandler.prototype, "commandHail", null);
__decorate([
    command('consider')
], CommandHandler.prototype, "commandConsider", null);
__decorate([
    command('goto')
], CommandHandler.prototype, "commandGoto", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29tbWFuZC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzlELE9BQU8sU0FBUyxNQUFNLDJCQUEyQixDQUFDO0FBQ2xELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNoRSxPQUFPLE9BQU8sTUFBTSxxQkFBcUIsQ0FBQztBQUMxQyxPQUFPLFdBQVcsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEQsT0FBTyxFQUNMLHVCQUF1QixFQUN2QixjQUFjLEdBQ2YsTUFBTSxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDNUMsT0FBTyxNQUFNLE1BQU0scUJBQXFCLENBQUM7QUFDekMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRTdELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUFnQjtJQUNyRCxNQUFNLElBQUksR0FBRyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDM0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1YsV0FBVyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDN0QsT0FBTztJQUNULENBQUM7SUFDRCxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMs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SUFHRCxXQUFXO1FBQ1QsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFHRCxhQUFhO1FBQ1gsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxjQUFjO1FBQ1osTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxXQUFXO1FBQ1QsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFHRCxhQUFhO1FBQ1gsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxZQUFZO1FBQ1YsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFHRCxhQUFhO1FBQ1gsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFHRCxhQUFhO1FBQ1gsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFHRCxVQUFVO1FBQ1IsTUFBTSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFHRCxVQUFVO1FBQ1IsTUFBTSxDQUFDLFFBQVEsRUFB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QU8sQ0FBQyxRQUFRLENBQUM7bURBR2pCO0FBR0Q7SUFEQyxPQUFPLENBQUMsUUFBUSxDQUFDO21EQUdqQjtBQUdEO0lBREMsT0FBTyxDQUFDLEtBQUssQ0FBQztnREFHZDtBQUdEO0lBREMsT0FBTyxDQUFDLEtBQUssQ0FBQztnREFHZDtBQUdEO0lBREMsT0FBTyxDQUFDLE1BQU0sQ0FBQztpREFHZjtBQUdEO0lBREMsT0FBTyxDQUFDLE9BQU8sQ0FBQztrREFHaEI7QUFHRDtJQURDLE9BQU8sQ0FBQyxNQUFNLENBQUM7aURBR2Y7QUFHRDtJQURDLE9BQU8sQ0FBQyxNQUFNLENBQUM7aURBT2Y7QUFHRDtJQURDLE9BQU8sQ0FBQyxVQUFVLENBQUM7cURBT25CO0FBRUQ7SUFEQyxPQUFPLENBQUMsTUFBTSxDQUFDO2lEQW9CZiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFuaW1hdGlvbkRlZmluaXRpb25zIH0gZnJvbSAnQGdhbWUvQW5pbWF0aW9uL2FuaW1hdGlvbi1jb25zdGFudHMnO1xuaW1wb3J0IHsgQ0xBU1NfREFUQV9OQU1FUyB9IGZyb20gJ0BnYW1lL0NvbnN0YW50cy9jbGFzcy1kYXRhJztcbmltcG9ydCBSQUNFX0RBVEEgZnJvbSAnQGdhbWUvQ29uc3RhbnRzL3JhY2UtZGF0YSc7XG5pbXBvcnQgeyBzdXBwb3J0ZWRab25lcyB9IGZyb20gJ0BnYW1lL0NvbnN0YW50cy9zdXBwb3J0ZWRab25lcyc7XG5pbXBvcnQgZW1pdHRlciBmcm9tICdAZ2FtZS9FdmVudHMvZXZlbnRzJztcbmltcG9ydCBHYW1lTWFuYWdlciBmcm9tICdAZ2FtZS9NYW5hZ2VyL2dhbWUtbWFuYWdlcic7XG5pbXBvcnQgeyBDaGFubmVsTWVzc2FnZSB9IGZyb20gJ0BnYW1lL05ldC9tZXNzYWdlcyc7XG5pbXBvcnQge1xuICBSZXF1ZXN0Q2xpZW50Wm9uZUNoYW5nZSxcbiAgWm9uZUNoYW5nZVR5cGUsXG59IGZyb20gJ0BnYW1lL05ldC9tZXNzYWdlcyc7XG5pbXBvcnQgeyBPcENvZGVzIH0gZnJvbSAnQGdhbWUvTmV0L29wY29kZXMnO1xuaW1wb3J0IFBsYXllciBmcm9tICdAZ2FtZS9QbGF5ZXIvcGxheWVyJztcbmltcG9ydCB7IFdvcmxkU29ja2V0IH0gZnJvbSAnQHVpL25ldC9pbnN0YW5jZXMnO1xuaW1wb3J0IHsgYWRkQ2hhdExpbmUsIGFkZENoYXRMaW5lcyB9IGZyb20gJy4vY2hhdC1tZXNzYWdlJztcbmltcG9ydCB7IEJhc2VDb21tYW5kSGFuZGxlciwgY29tbWFuZCB9IGZyb20gJy4vY29tbWFuZC1iYXNlJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3Rab25lQnlTaG9ydE5hbWUocmF3Wm9uZT86IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCB6b25lID0gcmF3Wm9uZT8udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGlmICghem9uZSkge1xuICAgIGFkZENoYXRMaW5lKCdVc2FnZTogL3pvbmUge3Nob3J0bmFtZX0gb3IgI3pvbmUge3Nob3J0bmFtZX0nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3VwcG9ydGVkWm9uZSA9IE9iamVjdC52YWx1ZXMoc3VwcG9ydGVkWm9uZXMpLmZpbmQoXG4gICAgKHZhbHVlKSA9PiB2YWx1ZS5zaG9ydE5hbWUudG9Mb3dlckNhc2UoKSA9PT0gem9uZSxcbiAgKTtcbiAgaWYgKCFzdXBwb3J0ZWRab25lKSB7XG4gICAgYWRkQ2hhdExpbmUoYFpvbmUgJyR7em9uZX0nIG5vdCBmb3VuZC4gVHlwZSAvbGlzdHpvbmVzIHRvIHNlZSBhdmFpbGFibGUgem9uZXMuYCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghV29ybGRTb2NrZXQuaXNDb25uZWN0ZWQpIHtcbiAgICB2b2lkIEdhbWVNYW5hZ2VyLmluc3RhbmNlLmxvYWRab25lKHN1cHBvcnRlZFpvbmUuc2hvcnROYW1lKTtcbiAgICB2b2lkIEdhbWVNYW5hZ2VyLmluc3RhbmNlLmluc3RhbnRpYXRlUGxheWVyKHtcbiAgICAgIHJhY2U6IDEsXG4gICAgICBjaGFyQ2xhc3M6IDEsXG4gICAgICBuYW1lOiAnU29hbmRzbycsXG4gICAgICB4OiAxNSxcbiAgICAgIHk6IDE1LFxuICAgICAgejogMTUsXG4gICAgICBmYWNlOiA0LFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBXb3JsZFNvY2tldC5zZW5kTWVzc2FnZShcbiAgICBPcENvZGVzLlJlcXVlc3RDbGllbnRab25lQ2hhbmdlLFxuICAgIFJlcXVlc3RDbGllbnRab25lQ2hhbmdlLFxuICAgIHtcbiAgICAgIHR5cGU6IFpvbmVDaGFuZ2VUeXBlLkZST01fWk9ORSxcbiAgICAgIHpvbmVJZDogc3VwcG9ydGVkWm9uZS5zaG9ydE5hbWUsXG4gICAgfSxcbiAgKTtcbiAgYWRkQ2hhdExpbmUoYFpvbmluZyB0byAke3N1cHBvcnRlZFpvbmUubG9uZ05hbWV9Li4uYCk7XG59XG5cblxuZXhwb3J0IGNsYXNzIENvbW1hbmRIYW5kbGVyIGV4dGVuZHMgQmFzZUNvbW1hbmRIYW5kbGVyIHtcbiAgcHJpdmF0ZSBzZXRNb2RlOiBSZWFjdC5EaXNwYXRjaDxSZWFjdC5TZXRTdGF0ZUFjdGlvbjxzdHJpbmc+PiB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyBzZXRNb2RlSGFuZGxlcihzZXRNb2RlOiBSZWFjdC5EaXNwYXRjaDxSZWFjdC5TZXRTdGF0ZUFjdGlvbjxzdHJpbmc+Pikge1xuICAgIHRoaXMuc2V0TW9kZSA9IHNldE1vZGU7XG4gIH1cblxuICBAY29tbWFuZCgnc3BlZWQnKVxuICBjb21tYW5kU3BlZWQoYXJnczogc3RyaW5nW10pIHtcbiAgICBpZiAoK2FyZ3NbMF0gPiAwICYmIFBsYXllci5pbnN0YW5jZT8ucGxheWVyTW92ZW1lbnQpIHtcbiAgICAgIFBsYXllci5pbnN0YW5jZS5wbGF5ZXJNb3ZlbWVudC5tb3ZlU3BlZWQgPSArYXJnc1swXTtcbiAgICAgIGFkZENoYXRMaW5lKGBTcGVlZCBzZXQgdG8gJHthcmdzWzBdfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBhZGRDaGF0TGluZSgnSW52YWxpZCBzcGVlZCB2YWx1ZScpO1xuICAgIH1cbiAgfVxuXG4gIEBjb21tYW5kKCdzaXQnKVxuICBjb21tYW5kU2l0KCkge1xuICAgIGlmIChQbGF5ZXIuaW5zdGFuY2UpIHtcbiAgICAgIFBsYXllci5pbnN0YW5jZS50b2dnbGVTaXQoKTtcbiAgICB9IFxuICB9XG5cbiAgQGNvbW1hbmQoJ3dhbGsnKVxuICBjb21tYW5kV2FsaygpIHtcbiAgICBpZiAoUGxheWVyLmluc3RhbmNlKSB7XG4gICAgICBQbGF5ZXIuaW5zdGFuY2UudG9nZ2xlV2FsaygpO1xuICAgIH1cbiAgfVxuXG4gIEBjb21tYW5kKCdoZWxwJylcbiAgY29tbWFuZEhlbHAoKSB7XG4gICAgYWRkQ2hhdExpbmVzKGBcbiAgICAgICAgLS0tLS0gQXZhaWxhYmxlIGNvbW1hbmRzIC0tLS0tXG4gICAgICAgIC96b25lIHtzaG9ydG5hbWV9IC0gRXhhbXBsZSAvem9uZSBxZXlub3MyXG4gICAgICAgIC9zcGF3biB7bW9kZWx9IC0gRXhhbXBsZSAvc3Bhd24gaHVtXG4gICAgICAgIC9jb250cm9scyAtIERpc3BsYXlzIGNvbnRyb2xzXG4gICAgICAgIC9nb3RvIC0gVGVsZXBvcnRzIHlvdSB0byB0aGUgc3BlY2lmaWVkIGNvb3JkaW5hdGVzIG9yIGN1cnJlbnQgdGFyZ2V0LCBleGFtcGxlOiAvZ290byAxMDAgMjAwIDMwMFxuICAgICAgICAvdGFyZ2V0IHtuYW1lfVxuICAgICAgICAvem9uZSAtIENoYW5nZXMgeW91ciB6b25lLCBleGFtcGxlOiAvem9uZSBxZXlub3MyXG4gICAgICAgIC9saXN0em9uZXMgLSBMaXN0cyBhbGwgYXZhaWxhYmxlIHpvbmVzXG4gICAgICAgIC0tLS0tIEtleWJvYXJkIEhvdGtleXMgLS0tLS1cbiAgICAgICAgU3BhY2U6IEp1bXBcbiAgICAgICAgU2hpZnQ6IFNwcmludFxuICAgICAgICBDdHJsOiBDcm91Y2hcbiAgICAgICAgV0FTRDogTW92ZW1lbnRcbiAgICAgICAgTW91c2U6IExvb2sgYXJvdW5kXG4gICAgICAgIFU6IFRvZ2dsZSBVSVxuICAgICAgICAtLS0tLS0gR00gQ29tbWFuZHMgLS0tLS1cbiAgICAgICAgI2hlbHAgLSBMaXN0cyBHTSBjb21tYW5kc1xuICAgIGApO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2xvY2F0aW9uJylcbiAgY29tbWFuZExvY2F0aW9uKCkge1xuICAgIGlmIChQbGF5ZXIuaW5zdGFuY2U/LmdldFBsYXllclBvc2l0aW9uKCkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgeyB4LCB5LCB6IH0gPSBQbGF5ZXIuaW5zdGFuY2UuZ2V0UGxheWVyUG9zaXRpb24oKSE7XG4gICAgICBhZGRDaGF0TGluZShcbiAgICAgICAgYFlvdXIgY3VycmVudCBsb2NhdGlvbiBpczogWDogJHt4LnRvRml4ZWQoMil9LCBZOiAke3kudG9GaXhlZCgyKX0sIFo6ICR7ei50b0ZpeGVkKDIpfWAsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBhZGRDaGF0TGluZShcbiAgICAgICAgJ1lvdSBhcmUgbm90IGluIHRoZSBnYW1lIG9yIHlvdXIgcGxheWVyIGVudGl0eSBpcyBub3QgaW5pdGlhbGl6ZWQuJyxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQGNvbW1hbmQoJ2NvbnRyb2xzJylcbiAgY29tbWFuZENvbnRyb2xzKCkge1xuICAgIGFkZENoYXRMaW5lcyhbXG4gICAgICAnTW92ZW1lbnQ6IFcsIEEsIFMsIEQnLFxuICAgICAgJ0p1bXAgKFVwKTogU3BhY2UnLFxuICAgICAgJ1NwcmludDogU2hpZnQnLFxuICAgICAgJ0Nyb3VjaCAoRG93bik6IEN0cmwnLFxuICAgICAgJ0xvb2sgYXJvdW5kOiBNb3VzZSB3aXRoIFJpZ2h0IENsaWNrID0gTW91c2UgbG9jaycsXG4gICAgXSk7XG4gIH1cblxuICBAY29tbWFuZCgndGFyZ2V0JylcbiAgY29tbWFuZFRhcmdldChhcmdzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IHRhcmdldE5hbWUgPSBhcmdzLmpvaW4oJyAnKS50cmltKCk7XG4gICAgaWYgKCF0YXJnZXROYW1lKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGVudGl0eSA9IFBsYXllci5pbnN0YW5jZT8ucGxheWVyRW50aXR5Py5nZXRDbG9zZXN0U3Bhd25zKDEsIChzKSA9PlxuICAgICAgcy5jbGVhbk5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHRhcmdldE5hbWUudG9Mb3dlckNhc2UoKSksXG4gICAgKT8uWzBdO1xuICAgIGlmIChlbnRpdHkgJiYgUGxheWVyLmluc3RhbmNlKSB7XG4gICAgICBQbGF5ZXIuaW5zdGFuY2UuVGFyZ2V0ID0gZW50aXR5O1xuICAgIH1cbiAgfVxuXG4gIEBjb21tYW5kKCdsaXN0em9uZXMnKVxuICBjb21tYW5kTGlzdFpvbmVzKCkge1xuICAgIGNvbnN0IHpvbmVMaXN0ID0gT2JqZWN0LmVudHJpZXMoc3VwcG9ydGVkWm9uZXMpXG4gICAgICAubWFwKChbLCB2YWx1ZV0pID0+IGAke3ZhbHVlLnNob3J0TmFtZX0gLSAke3ZhbHVlLmxvbmdOYW1lfWApXG4gICAgICAuam9pbignXFxuJyk7XG4gICAgYWRkQ2hhdExpbmVzKGBBdmFpbGFibGUgem9uZXM6XFxuJHt6b25lTGlzdH1gKTtcbiAgICBhZGRDaGF0TGluZSgnVG8gY2hhbmdlIHpvbmVzLCB1c2U6IC96b25lIHtzaG9ydG5hbWV9Jyk7XG4gIH1cblxuICBAY29tbWFuZCgnem9uZScpXG4gIGNvbW1hbmRab25lKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgcmVxdWVzdFpvbmVCeVNob3J0TmFtZShhcmdzWzBdKTtcbiAgfVxuXG4gIC8vIEBjb21tYW5kKFwib29jXCIpXG4gIC8vIGNvbW1hbmRPb2MoYXJnczogc3RyaW5nW10pIHtcbiAgLy8gICBhbGVydChcIlRPRE8gZmlsbCBtZSBpbiFcIik7XG4gIC8vIH1cblxuICBAY29tbWFuZCgnd2hvJylcbiAgY29tbWFuZFdobygpIHtcbiAgICBpZiAoIUdhbWVNYW5hZ2VyLmluc3RhbmNlLlpvbmVNYW5hZ2VyPy5DdXJyZW50Wm9uZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBlbnRpdGllcyA9IEdhbWVNYW5hZ2VyLmluc3RhbmNlLlpvbmVNYW5hZ2VyPy5FbnRpdHlQb29sPy5nZXRQbGF5ZXJFbnRpdGllcygpID8/IFtdO1xuICAgIGFkZENoYXRMaW5lKGAtLS0tLSBUaGVyZSBhcmUgJHtlbnRpdGllcy5sZW5ndGh9IHBsYXllcnMgaW4gJHtHYW1lTWFuYWdlci5pbnN0YW5jZS5ab25lTWFuYWdlcj8uQ3VycmVudFpvbmU/LmxvbmdOYW1lfSAtLS0tLWApO1xuICAgIGFkZENoYXRMaW5lcyhlbnRpdGllcy5tYXAoKGUpID0+IGBbJHtlLnNwYXduLmxldmVsfSAke1JBQ0VfREFUQVtlLnNwYXduLnJhY2VdPy5uYW1lID8/ICdVbmtub3duJ30gJHtDTEFTU19EQVRBX05BTUVTW2Uuc3Bhd24uY2hhckNsYXNzXX1dICR7ZS5zcGF3bi5uYW1lfWApKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdpbnZpdGUnKVxuICBjb21tYW5kSW52aXRlKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgY29uc29sZS5sb2coJ0ludml0ZSBjb21tYW5kIG5vdCBpbXBsZW1lbnRlZCB5ZXQuJywgYXJncyk7XG4gIH1cblxuICBAY29tbWFuZCgnZGlzYmFuZCcpXG4gIGNvbW1hbmREaXNiYW5kKCkge1xuICAgIGNvbnNvbGUubG9nKCdEaXNiYW5kIGNvbW1hbmQgbm90IGltcGxlbWVudGVkIHlldC4nKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdvcHRpb25zJylcbiAgY29tbWFuZE9wdGlvbnMoKSB7XG4gICAgYWRkQ2hhdExpbmUoJ09wdGlvbnMgY29tbWFuZCBub3QgaW1wbGVtZW50ZWQgeWV0LicpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3BlcnNvbmEnKVxuICBjb21tYW5kUGVyc29uYSgpIHtcbiAgICBhZGRDaGF0TGluZSgnUGVyc29uYSBjb21tYW5kIG5vdCBpbXBsZW1lbnRlZCB5ZXQuJyk7XG4gIH1cblxuICBAY29tbWFuZCgnc2F5JylcbiAgY29tbWFuZFNheShhcmdzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLmpvaW4oJyAnKTtcbiAgICBpZiAobWVzc2FnZSkge1xuICAgICAgYWRkQ2hhdExpbmUoYFlvdSBzYXksICcke21lc3NhZ2V9J2ApO1xuICAgICAgV29ybGRTb2NrZXQuc2VuZFN0cmVhbU1lc3NhZ2UoT3BDb2Rlcy5DaGFubmVsTWVzc2FnZSwgQ2hhbm5lbE1lc3NhZ2UsIHtcbiAgICAgICAgc2VuZGVyICAgIDogUGxheWVyLmluc3RhbmNlPy5wbGF5ZXI/Lm5hbWUgPz8gJycsXG4gICAgICAgIHRhcmdldG5hbWU6IFBsYXllci5pbnN0YW5jZT8uVGFyZ2V0Py5zcGF3bj8ubmFtZSxcbiAgICAgICAgY2hhbk51bSAgIDogMCxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIEBjb21tYW5kKCdjYW1wJylcbiAgY29tbWFuZENhbXAoKSB7XG4gICAgR2FtZU1hbmFnZXIuaW5zdGFuY2U/LmRpc3Bvc2UoKTtcbiAgICBXb3JsZFNvY2tldC5zZW5kTWVzc2FnZShPcENvZGVzLkNhbXAsIG51bGwsIG51bGwpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgZW1pdHRlci5lbWl0KCdzZXRNb2RlJywgJ2NoYXJhY3Rlci1zZWxlY3QnKTtcbiAgICB9LCAxMDApO1xuICB9XG5cbiAgQGNvbW1hbmQoJ25vZCcpXG4gIGNvbW1hbmROb2QoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLk5vZCwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnYW1hemUnKVxuICBjb21tYW5kQW1hemUoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLkFtYXplLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdwbGVhZCcpXG4gIGNvbW1hbmRQbGVhZCgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuUGxlYWQsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2NsYXAnKVxuICBjb21tYW5kQ2xhcCgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuQ2xhcCwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnaHVuZ3J5JylcbiAgY29tbWFuZEh1bmdyeSgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuSHVuZ3J5LCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdibHVzaCcpXG4gIGNvbW1hbmRCbHVzaCgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuQmx1c2gsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2NodWNrbGUnKVxuICBjb21tYW5kQ2h1Y2tsZSgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuQ2h1Y2tsZSwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnY291Z2gnKVxuICBjb21tYW5kQ291Z2goKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLkNvdWdoLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdkdWNrJylcbiAgY29tbWFuZER1Y2soKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLkR1Y2ssIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3B1enpsZScpXG4gIGNvbW1hbmRQdXp6bGUoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLlB1enpsZSwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnZGFuY2UnKVxuICBjb21tYW5kRGFuY2UoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLkRhbmNlLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdibGluaycpXG4gIGNvbW1hbmRCbGluaygpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuQmxpbmssIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2dsYXJlJylcbiAgY29tbWFuZEdsYXJlKCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5HbGFyZSwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnZHJvb2wnKVxuICBjb21tYW5kRHJvb2woKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLkRyb29sLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdrbmVlbCcpXG4gIGNvbW1hbmRLbmVlbCgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuS25lZWwsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2xhdWdoJylcbiAgY29tbWFuZExhdWdoKCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5MYXVnaCwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgncG9pbnQnKVxuICBjb21tYW5kUG9pbnQoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLlBvaW50LCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdzaHJ1ZycpXG4gIGNvbW1hbmRTaHJ1ZygpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuU2hydWcsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3JlYWR5JylcbiAgY29tbWFuZFJlYWR5KCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5SZWFkeSwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnc2FsdXRlJylcbiAgY29tbWFuZFNhbHV0ZSgpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuU2FsdXRlLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdzaGl2ZXInKVxuICBjb21tYW5kU2hpdmVyKCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5TaGl2ZXIsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ3RhcCcpXG4gIGNvbW1hbmRUYXAoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLlRhcCwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgnYm93JylcbiAgY29tbWFuZEJvdygpIHtcbiAgICBQbGF5ZXIuaW5zdGFuY2U/LnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuQm93LCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCd3YXZlJylcbiAgY29tbWFuZFdhdmUoKSB7XG4gICAgUGxheWVyLmluc3RhbmNlPy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLldhdmUsIHRydWUpO1xuICB9XG5cbiAgQGNvbW1hbmQoJ2NoZWVyJylcbiAgY29tbWFuZENoZWVyKCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5DaGVlciwgdHJ1ZSk7XG4gIH1cblxuICBAY29tbWFuZCgncnVkZScpXG4gIGNvbW1hbmRSdWRlKCkge1xuICAgIFBsYXllci5pbnN0YW5jZT8ucGxheUFuaW1hdGlvbihBbmltYXRpb25EZWZpbml0aW9ucy5SdWRlLCB0cnVlKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdoYWlsJylcbiAgY29tbWFuZEhhaWwoKSB7XG4gICAgdGhpcy5jb21tYW5kU2F5KFtcbiAgICAgIFBsYXllci5pbnN0YW5jZT8uVGFyZ2V0XG4gICAgICAgID8gYEhhaWwsICR7UGxheWVyLmluc3RhbmNlLlRhcmdldC5jbGVhbk5hbWV9YFxuICAgICAgICA6ICdIYWlsJyxcbiAgICBdKTtcbiAgfVxuXG4gIEBjb21tYW5kKCdjb25zaWRlcicpXG4gIGNvbW1hbmRDb25zaWRlcigpIHtcbiAgICBpZiAoUGxheWVyLmluc3RhbmNlPy5UYXJnZXQpIHtcbiAgICAgIGFkZENoYXRMaW5lKGBZb3UgY29uc2lkZXIgJHtQbGF5ZXIuaW5zdGFuY2UuVGFyZ2V0LmNsZWFuTmFtZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYWRkQ2hhdExpbmUoJ1lvdSBtdXN0IHRhcmdldCBhIGNyZWF0dXJlIHRvIGNvbnNpZGVyIGl0LicpO1xuICAgIH1cbiAgfVxuICBAY29tbWFuZCgnZ290bycpXG4gIGNvbW1hbmRHb3RvKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgbGV0IHgsIHksIHo7XG4gICAgaWYgKGFyZ3MubGVuZ3RoICE9PSAzKSB7XG4gICAgICBpZiAoUGxheWVyLmluc3RhbmNlPy5UYXJnZXQpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UG9zaXRpb24gPSBQbGF5ZXIuaW5zdGFuY2UuVGFyZ2V0LnNwYXduUG9zaXRpb247XG4gICAgICAgIHggPSB0YXJnZXRQb3NpdGlvbi54O1xuICAgICAgICB5ID0gdGFyZ2V0UG9zaXRpb24ueTtcbiAgICAgICAgeiA9IHRhcmdldFBvc2l0aW9uLno7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhZGRDaGF0TGluZSgnVXNhZ2U6IC9nb3RvIHggeSB6Jyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgeCA9IHBhcnNlRmxvYXQoYXJnc1swXSk7XG4gICAgICB5ID0gcGFyc2VGbG9hdChhcmdzWzFdKTtcbiAgICAgIHogPSBwYXJzZUZsb2F0KGFyZ3NbMl0pO1xuICAgIH1cblxuICAgIFBsYXllci5pbnN0YW5jZT8uc2V0UG9zaXRpb24oeCwgeSwgeik7XG4gIH1cbn1cbiJdfQ==