import type * as BJS from "@babylonjs/core";
export type ViewerAnimation = {
    from: number;
    to: number;
    name: string;
    fps?: number;
};
export type ShadoModelViewerOptions = {
    assetBaseUrl?: string;
    model?: string;
    onFrame?: (fps: number) => void;
    onStatus?: (status: string) => void;
};
export type ShadoModelViewer = {
    animations: ViewerAnimation[];
    mesh: BJS.Mesh;
    playAnimation: (name: string) => void;
    setTint: (rgb: readonly [number, number, number]) => void;
    setBodyVisible: (visible: boolean) => void;
    setWireframe: (enabled: boolean) => void;
    setBackFaceCulling: (enabled: boolean) => void;
    setSkeletonViewer: (enabled: boolean, displayMode?: "lines" | "spheres") => void;
    resetCamera: () => void;
    dispose: () => void;
};
export declare function createShadoModelViewer(canvas: HTMLCanvasElement, options?: ShadoModelViewerOptions): Promise<ShadoModelViewer>;
