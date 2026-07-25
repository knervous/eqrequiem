export declare class ImageCache {
    private static cache;
    static getRawImageUrl(folder: string, path: string, type: string): Promise<string>;
    static getImageUrl(folder: string, path: string, crop?: boolean, cropX?: number, cropY?: number, cropWidth?: number, cropHeight?: number): Promise<string>;
}
