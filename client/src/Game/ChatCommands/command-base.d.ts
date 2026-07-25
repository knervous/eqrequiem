import { Trie } from './trie';
export declare function command(name: string | string[]): MethodDecorator;
export declare abstract class BaseCommandHandler {
    protected trie: Trie;
    protected commandRegistry: Map<string, string>;
    static instance<T extends BaseCommandHandler>(this: new () => T): T;
    constructor();
    parseCommand(input: string): void;
}
