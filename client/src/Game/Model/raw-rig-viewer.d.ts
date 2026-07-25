import type * as BJS from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";
export declare function getRawRigModelKeys(): string[];
export type RawRigViewerOptions = {
    model?: string;
    onFrame?: (fps: number) => void;
    onStatus?: (status: string) => void;
};
export type RawRigViewer = {
    animations: string[];
    mesh: BJS.Mesh;
    playAnimation: (name: string) => void;
    setWireframe: (enabled: boolean) => void;
    setSkeletonViewer: (enabled: boolean, displayMode?: "lines" | "spheres") => void;
    resetCamera: () => void;
    dispose: () => void;
};
export declare function createRawRigViewer(canvas: HTMLCanvasElement, options?: RawRigViewerOptions): Promise<RawRigViewer>;
