/**
 *
 * @param {import('@babylonjs/core/Cameras/arcRotateCamera').ArcRotateCamera} camera
 * @param {import('@babylonjs/core').Scene} scene
 */
export declare const animateVignette: (camera: any, scene: any) => void;
/**
 * Create and animate a Gaussian blur post-process,
 * e.g. for a "teleport" fade-out effect.
 *
 * @param {BABYLON.Camera} camera
 * @param {BABYLON.Scene} scene
 */
export declare function gaussianBlurTeleport(camera: any, scene: any): void;
