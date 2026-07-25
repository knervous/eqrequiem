export declare class StringTable {
    private static strings;
    static initialize(): Promise<void>;
    static getString(key: string): string | undefined;
}
