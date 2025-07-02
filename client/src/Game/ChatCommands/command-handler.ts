import { Trie } from "./trie";
import Player from "@game/Player/player";
import GameManager from "@game/Manager/game-manager";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { ChannelMessage } from "@game/Net/internal/api/capnp/common";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { supportedZones } from "@game/Constants/supportedZones";
import {
  RequestClientZoneChange,
  ZoneChangeType,
} from "@game/Net/internal/api/capnp/zone";
import emitter from "@game/Events/events";

export function command(name: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.commandRegistry) {
      ctor.commandRegistry = new Map<string, string>();
    }
    ctor.commandRegistry.set(name, propertyKey as string);
  };
}

const addChatLine = (message: string) => {
  emitter.emit("chatMessage", { type: 0, message, color: "#ddd", chanNum: 0 });
};

const addChatLines = (lines: string | string[]) => {
  const lineArray = Array.isArray(lines)
    ? lines
    : lines
      .trim()
      .split("\n")
      .map((line) => line.trim());
  lineArray.forEach((line) => addChatLine(line));
};

export class CommandHandler {
  private trie = new Trie();
  private commandRegistry: Map<string, string>;
  private static _instance: CommandHandler | null = null;
  private setMode: React.Dispatch<React.SetStateAction<string>> | null = null;
  public static get instance(): CommandHandler {
    if (!this._instance) {
      this._instance = new CommandHandler();
    }
    return this._instance;
  }
  public setModeHandler(setMode: React.Dispatch<React.SetStateAction<string>>) {
    this.setMode = setMode;
  }
  constructor() {
    const ctor = (this as any).constructor;
    this.commandRegistry = ctor.commandRegistry ?? new Map();

    for (const [cmd, methodName] of this.commandRegistry) {
      this.trie.insert(cmd, methodName, this);
    }
  }

  public parseCommand(input: string) {
    const [raw, ...args] = input.trim().split(/\s+/);
    const cmd = raw.toLowerCase();

    let entry = this.trie.searchExact(cmd);

    if (!entry) {
      const matches = this.trie.searchPrefix(cmd);
      if (matches.length === 1) {
        entry = matches[0].entry;
      } else if (matches.length > 1) {
        entry = matches[0].entry;
      }
    }

    if (entry) {
      const fn = (this as any)[entry.method];
      if (typeof fn === "function") {
        fn.call(this, args);
      } else {
        console.error(`Handler ${entry.method} is not a function`);
      }
    } else {
      addChatLine(`Unknown command: ${cmd}`);
    }
  }

  @command("speed")
  commandSpeed(args: string[]) {
    if (+args[0] > 0 && Player.instance?.playerMovement) {
      Player.instance.playerMovement.moveSpeed = +args[0];
      addChatLine(`Speed set to ${args[0]}`);
    } else {
      addChatLine("Invalid speed value");
    }
  }

  @command("help")
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
    `);
  }

  @command("location")
  commandLocation() {
    if (Player.instance?.getPlayerPosition() !== undefined) {
      const { x, y, z } = Player.instance.getPlayerPosition()!;
      addChatLine(
        `Your current location is: X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`,
      );
    } else {
      addChatLine(
        "You are not in the game or your player entity is not initialized.",
      );
    }
  }

  @command("controls")
  commandControls() {
    addChatLines([
      "Movement: W, A, S, D",
      "Jump (Up): Space",
      "Sprint: Shift",
      "Crouch (Down): Ctrl",
      "Look around: Mouse with Right Click = Mouse lock",
    ]);
  }

  @command("target")
  commandTarget(args: string[]) {
    const targetName = args.join(" ").trim();
    if (!targetName) {
      return;
    }
    const entity = Player.instance?.playerEntity?.getClosestSpawns(1, (s) =>
      s.cleanName.toLowerCase().startsWith(targetName.toLowerCase()),
    )?.[0];
    if (entity && Player.instance) {
      Player.instance.Target = entity;
    }
  }

  @command("listzones")
  commandListZones() {
    const zoneList = Object.entries(supportedZones)
      .map(([, value]) => `${value.shortName} - ${value.longName}`)
      .join("\n");
    addChatLines(`Available zones:\n${zoneList}`);
    addChatLine(`To change zones, use: /zone {shortname}`);
  }

  @command("zone")
  async commandZone(args: string[]) {
    const zone = args[0];
    const supportedZone = Object.entries(supportedZones).find(
      ([, value]) => value.shortName.toLowerCase() === zone.toLowerCase(),
    );
    if (!supportedZone) {
      addChatLine(`Zone '${zone}' not found. Type /listzones to see available zones.`);
      return;
    } 
    if (!WorldSocket.isConnected) {
      GameManager.instance.loadZone(zone);
      GameManager.instance.instantiatePlayer({
        race: 1,
        charClass: 1,
        name: "Soandso",
        x: 15,
        y: 15,
        z: 15,
        face: 4,
      });
      return;
    }
    if (zone) {

      WorldSocket.sendMessage(
        OpCodes.RequestClientZoneChange,
        RequestClientZoneChange,
        {
          type: ZoneChangeType.FROM_ZONE,
          x: 5,
          y: 5,
          z: 5,
          zoneId: supportedZone[0],
        },
      );
    } else {
      addChatLine("No zone entered");
    }
  }

  @command("ooc")
  commandOoc(args: string[]) {
    alert("TODO fill me in!");
  }

  @command("say")
  commandSay(args: string[]) {
    const message = args.join(" ");
    if (message) {
      addChatLine(`You say, '${message}'`, { type: 1 });
      WorldSocket.sendMessage(OpCodes.ChannelMessage, ChannelMessage, {
        sender: Player.instance?.player?.name ?? "",
        targetname: Player.instance?.Target?.spawn?.name,
        chanNum: 0,
        message,
      });
    }
  }

  @command("camp")
  commandCamp() {
    GameManager.instance.dispose();
    this.setMode?.("character-select");
  }

  @command("nod")
  commandNod() {
    Player.instance?.playAnimation(AnimationDefinitions.Nod, true);
  }

  @command("amaze")
  commandAmaze() {
    Player.instance?.playAnimation(AnimationDefinitions.Amaze, true);
  }

  @command("plead")
  commandPlead() {
    Player.instance?.playAnimation(AnimationDefinitions.Plead, true);
  }

  @command("clap")
  commandClap() {
    Player.instance?.playAnimation(AnimationDefinitions.Clap, true);
  }

  @command("hungry")
  commandHungry() {
    Player.instance?.playAnimation(AnimationDefinitions.Hungry, true);
  }

  @command("blush")
  commandBlush() {
    Player.instance?.playAnimation(AnimationDefinitions.Blush, true);
  }

  @command("chuckle")
  commandChuckle() {
    Player.instance?.playAnimation(AnimationDefinitions.Chuckle, true);
  }

  @command("cough")
  commandCough() {
    Player.instance?.playAnimation(AnimationDefinitions.Cough, true);
  }

  @command("duck")
  commandDuck() {
    Player.instance?.playAnimation(AnimationDefinitions.Duck, true);
  }

  @command("puzzle")
  commandPuzzle() {
    Player.instance?.playAnimation(AnimationDefinitions.Puzzle, true);
  }

  @command("dance")
  commandDance() {
    Player.instance?.playAnimation(AnimationDefinitions.Dance, true);
  }

  @command("blink")
  commandBlink() {
    Player.instance?.playAnimation(AnimationDefinitions.Blink, true);
  }

  @command("glare")
  commandGlare() {
    Player.instance?.playAnimation(AnimationDefinitions.Glare, true);
  }

  @command("drool")
  commandDrool() {
    Player.instance?.playAnimation(AnimationDefinitions.Drool, true);
  }

  @command("kneel")
  commandKneel() {
    Player.instance?.playAnimation(AnimationDefinitions.Kneel, true);
  }

  @command("laugh")
  commandLaugh() {
    Player.instance?.playAnimation(AnimationDefinitions.Laugh, true);
  }

  @command("point")
  commandPoint() {
    Player.instance?.playAnimation(AnimationDefinitions.Point, true);
  }

  @command("shrug")
  commandShrug() {
    Player.instance?.playAnimation(AnimationDefinitions.Shrug, true);
  }

  @command("ready")
  commandReady() {
    Player.instance?.playAnimation(AnimationDefinitions.Ready, true);
  }

  @command("salute")
  commandSalute() {
    Player.instance?.playAnimation(AnimationDefinitions.Salute, true);
  }

  @command("shiver")
  commandShiver() {
    Player.instance?.playAnimation(AnimationDefinitions.Shiver, true);
  }

  @command("tap")
  commandTap() {
    Player.instance?.playAnimation(AnimationDefinitions.Tap, true);
  }

  @command("bow")
  commandBow() {
    Player.instance?.playAnimation(AnimationDefinitions.Bow, true);
  }

  @command("hail")
  commandHail() {
    this.commandSay([
      Player.instance?.Target
        ? `Hail, ${Player.instance.Target.cleanName}`
        : "Hail",
    ]);
  }

  @command("goto")
  commandGoto(args: string[]) {
    let x, y, z;
    if (args.length !== 3) {
      if (Player.instance?.Target) {
        const targetPosition = Player.instance.Target.spawnPosition;
        x = targetPosition.x;
        y = targetPosition.y;
        z = targetPosition.z;
      } else {
        addChatLine("Usage: /goto x y z");
        return;
      }
    } else {
      x = parseFloat(args[0]);
      y = parseFloat(args[1]);
      z = parseFloat(args[2]);
    }

    Player.instance?.setPosition(x, y, z);
  }
}
