export interface CommandEntry {
    method: string;
    instance: any;
}
export declare class Trie {
    private root;
    /** Insert a full command string into the trie */
    insert(command: string, method: string, instance: any): void;
    /** Exact lookup */
    searchExact(command: string): CommandEntry | null;
    /** Find all commands that start with the given prefix */
    searchPrefix(prefix: string): {
        command: string;
        entry: CommandEntry;
    }[];
}
