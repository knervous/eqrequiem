import { UIEvents } from '@ui/events/ui-events';
import { Trie } from './trie';
import Player from '@game/Player/player';
import GameManager from '@game/Manager/game-manager';

export function command(name: string): MethodDecorator {
  return ( 
    target: object, 
    propertyKey: string | symbol, 
  ) => {
    const ctor = target.constructor as any;
    if (!ctor.commandRegistry) {
      ctor.commandRegistry = new Map<string, string>();
    }
    ctor.commandRegistry.set(name, propertyKey as string);
  };
}

const  addChatLine = (line: string, options: object = {}) => {
  UIEvents.emit("chat", { type: 0, line, color: "#ddd", ...options });
};


export class CommandHandler {
  private trie = new Trie();
  private commandRegistry: Map<string, string>;

  constructor(
    private setMode: React.Dispatch<React.SetStateAction<string>>,
  ) {
    const ctor = (this as any).constructor;
    this.commandRegistry = ctor.commandRegistry ?? new Map();

    for (const [cmd, methodName] of this.commandRegistry) {
      this.trie.insert(cmd, methodName, this);
    }
  }

  parseCommand(input: string) {
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
      if (typeof fn === 'function') {
        fn.call(this, args);
      } else {
        console.error(`Handler ${entry.method} is not a function`);
      }
    } else {
      addChatLine(`Unknown command: ${cmd}`);
    }
  }

  @command('speed')
  commandSpeed(args: string[]) {
    if (+args[0] > 0 && Player.instance) {
      Player.instance.playerMovement.moveSpeed = +args[0];
      addChatLine(`Speed set to ${args[0]}`);
    } else {
      addChatLine("Invalid speed value");
    }
  }
  
  @command('help')
  commandHelp() {
    addChatLine("----- Available commands -----");
    addChatLine("/zone {shortname} - Example /zone qeynos2");
    addChatLine("/spawn {model} - Example /spawn hum");
    addChatLine("/controls - Displays controls");
    addChatLine("----- Keyboard Hotkeys -----");
    addChatLine("Space: Jump");
    addChatLine("Shift: Sprint");
    addChatLine("Ctrl: Crouch");
    addChatLine("WASD: Movement");
    addChatLine("Mouse: Look around");
    addChatLine("U: Toggle UI");
  }

  @command('controls')
  commandControls() {
    addChatLine("Movement: W, A, S, D");
    addChatLine("Jump (Up): Space");
    addChatLine("Sprint: Shift");
    addChatLine("Crouch (Down): Ctrl");
    addChatLine("Look around: Mouse with Right Click = Mouse lock");
  }

  @command('zone')
  async commandZone(args: string[]) {
    const zone = args[0];
    if (zone) {
      addChatLine(`LOADING, PLEASE WAIT...`);
      await GameManager.instance.loadZone(zone);
      await GameManager.instance.instantiatePlayer();
      addChatLine(`You have entered ${zone}`);
    } else {
      addChatLine("No zone entered");
    }
  }

  @command('camp')
  commandCamp() {
    GameManager.instance.dispose();
    this.setMode("character-select");
  }

  @command('spawn')
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
