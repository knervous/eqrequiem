
import { addChatLine } from './chat-message';
import { Trie } from './trie';

export function command(name: string | string[]): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.commandRegistry) {
      ctor.commandRegistry = new Map<string, string>();
    }
    if (Array.isArray(name)) {
      for (const cmd of name) {
        ctor.commandRegistry.set(cmd, propertyKey as string);
      }
    } else {
      ctor.commandRegistry.set(name, propertyKey as string);
    }
  };
}

export abstract class BaseCommandHandler {
  protected trie = new Trie();
  protected commandRegistry: Map<string, string>;

  public static instance<T extends BaseCommandHandler>(this: new () => T): T {
    const ctor = this as any;
    if (!ctor._instance) {
      ctor._instance = new this();
    }
    return ctor._instance as T;
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
      if (typeof fn === 'function') {
        fn.call(this, args);
      } else {
        console.error(`Handler ${entry.method} is not a function`);
      }
    } else {
      addChatLine(`Unknown command: ${cmd}`);
    }
  }
}
