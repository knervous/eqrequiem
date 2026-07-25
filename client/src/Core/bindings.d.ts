type Options = {
    rootFileSystemHandle: FileSystemDirectoryHandle;
    setSplash: (visible: boolean) => void;
};
declare class FileSystemBindings {
    private assetPromises;
    private fetchPromises;
    private unzipPromises;
    rootFileSystemHandle: FileSystemDirectoryHandle | null;
    initialize({ rootFileSystemHandle, setSplash, }: Options): Promise<void>;
    private unzipToFilesystem;
    private fetchOnce;
    private getZippedFile;
    getOrFetch(folderPath: string, fileName: string): Promise<ArrayBuffer | null>;
    getFile: (folderPath: string, fileName: string) => Promise<ArrayBuffer | null>;
}
export declare const fsBindings: FileSystemBindings;
export {};
