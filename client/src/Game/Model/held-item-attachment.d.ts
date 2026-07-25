import { Matrix, type DeepImmutable } from "@babylonjs/core";
export declare function createHeldItemBindTransform(socketBindTransform: DeepImmutable<Matrix>, runtimeScale: number): Matrix;
export declare function heldItemLocalYOffset(hasBindTransform: boolean, spawnScale: number): number;
