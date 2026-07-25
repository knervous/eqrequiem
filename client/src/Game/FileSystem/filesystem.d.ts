export declare class FileSystem {
    static getFileBytes(folderPath: string, fileName?: string): Promise<ArrayBuffer | undefined>;
    static getFileJSON<T>(folderPath: string, fileName?: string): Promise<T | undefined>;
}
