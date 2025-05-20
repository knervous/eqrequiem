import { UIEvents } from "@ui/events/ui-events";
import { Trie } from "./trie";
import Player from "@game/Player/player";
import GameManager from "@game/Manager/game-manager";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { ChannelMessage } from "@game/Net/internal/api/capnp/common";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { Animation } from "godot";

export function command(name: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.commandRegistry) {
      ctor.commandRegistry = new Map<string, string>();
    }
    ctor.commandRegistry.set(name, propertyKey as string);
  };
}

const addChatLine = (message: string, options: object = {}) => {
  UIEvents.emit("chat", { type: 0, message, color: "#ddd", ...options });
};

const addChatLines = (lines: string | string[], options: object = {}) => {
  const lineArray = Array.isArray(lines) ? lines : lines.trim().split("\n").map((line) => line.trim());
  lineArray.forEach((line) => addChatLine(line, options));
};

export class CommandHandler {
  private trie = new Trie();
  private commandRegistry: Map<string, string>;

  constructor(private setMode: React.Dispatch<React.SetStateAction<string>>) {
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
    if (+args[0] > 0 && Player.instance) {
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
        ----- Keyboard Hotkeys -----
        Space: Jump
        Shift: Sprint
        Ctrl: Crouch
        WASD: Movement
        Mouse: Look around
        U: Toggle UI
    `);
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

  @command("zone")
  async commandZone(args: string[]) {
    const zone = args[0];
    if (zone) {
      addChatLine(`LOADING, PLEASE WAIT...`);
      await GameManager.instance.loadZone(zone);
      await GameManager.instance.instantiatePlayer({ x: 0, y: 10, z: 10 });
      addChatLine(`You have entered ${zone}`);
    } else {
      addChatLine("No zone entered");
    }
  }

  @command("ooc")
  commandOoc(args: string[]) {
    alert('TODO fill me in!');
  }

  @command("say")
  commandSay(args: string[]) {
    const message = args.join(" ");
    if (message) {
      addChatLine(`You say, '${message}'`, { type: 1 });
      WorldSocket.sendMessage(OpCodes.ChannelMessage, ChannelMessage, {
        sender: Player.instance?.player?.name ?? "",
        targetname: Player.instance?.Target?.name,
        chanNum: 0,
        message,
      });
    }
  }

  @command("camp")
  commandCamp() {
    GameManager.instance.dispose();
    this.setMode("character-select");
  }

  @command("nod")
  commandNod() {
    Player.instance?.playAnimation(AnimationDefinitions.Nod, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("amaze")
  commandAmaze() {
    Player.instance?.playAnimation(AnimationDefinitions.Amaze, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("plead")
  commandPlead() {
    Player.instance?.playAnimation(AnimationDefinitions.Plead, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("clap")
  commandClap() {
    Player.instance?.playAnimation(AnimationDefinitions.Clap, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("hungry")
  commandHungry() {
    Player.instance?.playAnimation(AnimationDefinitions.Hungry, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("blush")
  commandBlush() {
    Player.instance?.playAnimation(AnimationDefinitions.Blush, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("chuckle")
  commandChuckle() {
    Player.instance?.playAnimation(AnimationDefinitions.Chuckle, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("cough")
  commandCough() {
    Player.instance?.playAnimation(AnimationDefinitions.Cough, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("duck")
  commandDuck() {
    Player.instance?.playAnimation(AnimationDefinitions.Duck, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("puzzle")
  commandPuzzle() {
    Player.instance?.playAnimation(AnimationDefinitions.Puzzle, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("dance")
  commandDance() {
    Player.instance?.playAnimation(AnimationDefinitions.Dance, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("blink")
  commandBlink() {
    Player.instance?.playAnimation(AnimationDefinitions.Blink, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("glare")
  commandGlare() {
    Player.instance?.playAnimation(AnimationDefinitions.Glare, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("drool")
  commandDrool() {
    Player.instance?.playAnimation(AnimationDefinitions.Drool, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("kneel")
  commandKneel() {
    Player.instance?.playAnimation(AnimationDefinitions.Kneel, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("laugh")
  commandLaugh() {
    Player.instance?.playAnimation(AnimationDefinitions.Laugh, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("point")
  commandPoint() {
    Player.instance?.playAnimation(AnimationDefinitions.Point, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("shrug")
  commandShrug() {
    Player.instance?.playAnimation(AnimationDefinitions.Shrug, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("ready")
  commandReady() {
    Player.instance?.playAnimation(AnimationDefinitions.Ready, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("salute")
  commandSalute() {
    Player.instance?.playAnimation(AnimationDefinitions.Salute, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("shiver")
  commandShiver() {
    Player.instance?.playAnimation(AnimationDefinitions.Shiver, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("tap")
  commandTap() {
    Player.instance?.playAnimation(AnimationDefinitions.Tap, Animation.LoopMode.LOOP_NONE, true);
  }

  @command("bow")
  commandBow() {
    Player.instance?.playAnimation(AnimationDefinitions.Bow, Animation.LoopMode.LOOP_NONE, true);
  }

}
