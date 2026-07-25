export declare function configureRootFileSystem(handle: FileSystemDirectoryHandle): void;
export declare function getRootEQFile(folderPath: string, fileName: string): Promise<ArrayBuffer | undefined>;
export declare function writeRootEQFile(folderPath: string, fileName: string, data: FileSystemWriteChunkType): Promise<boolean>;
export declare function getEQFile(directoryName: string, fileName: string, type?: 'arrayBuffer'): Promise<ArrayBuffer | null>;
export declare function getEQFile(directoryName: string, fileName: string, type: 'text'): Promise<string | null>;
export declare function getEQFile<T = unknown>(directoryName: string, fileName: string, type: 'json'): Promise<T | null>;
