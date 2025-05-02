import { UIEvents } from "@ui/events/ui-events";
import { Trie } from "./trie";
import Player from "@game/Player/player";
import GameManager from "@game/Manager/game-manager";

export function command(name: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.commandRegistry) {
      ctor.commandRegistry = new Map<string, string>();
    }
    ctor.commandRegistry.set(name, propertyKey as string);
  };
}

const addChatLine = (line: string, options: object = {}) => {
  UIEvents.emit("chat", { type: 0, line, color: "#ddd", ...options });
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

  @command("camp")
  commandCamp() {
    GameManager.instance.dispose();
    this.setMode("character-select");
  }

  @command("spawn")
  commandSpawn(args: string[]) {
    const spawn = args[0];
    if (spawn) {
      addChatLine(`Spawning ${spawn}`);
      GameManager.instance.spawnModel(spawn);
    } else {
      addChatLine("No model entered");
    }
  }
}
