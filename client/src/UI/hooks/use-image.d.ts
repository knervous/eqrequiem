export type AtlasEntry = {
    texture: string;
    left: number;
    top: number;
    width: number;
    height: number;
};
export type ImageEntry = {
    entry: AtlasEntry;
    image: string | null;
};
export declare const useSakImage: (path: string, crop?: boolean) => ImageEntry;
export declare const useSakImages: (paths: string[], crop?: boolean) => ImageEntry[];
export declare const useStoneImage: (path: string, crop?: boolean) => ImageEntry;
export declare const useStoneImages: (paths: string[], crop?: boolean) => ImageEntry[];
export declare const useRawImage: (folder: string, path: string, type: string) => string;
export declare const useImage: (path: string, crop?: boolean) => ImageEntry;
type AtlasType = {
    texture: string;
    x: number;
    y: number;
    cellSize: number;
};
export declare const loadItemIcon: (id: any) => AtlasType;
export declare const loadSpellIcon: (id: any) => AtlasType;
export declare const loadGemIcon: (id: any) => AtlasType;
export declare const useItemImage: (id: number) => string;
export {};
