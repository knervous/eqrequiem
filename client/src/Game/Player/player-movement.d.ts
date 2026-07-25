import type * as BJS from '@babylonjs/core';
import type Player from './player';
export declare class PlayerMovement {
    private player;
    private scene;
    moveSpeed: number;
    turnSpeed: number;
    gravity: boolean;
    jumpImpulseStrength: number;
    finalVelocity: BJS.Vector3;
    private sprintMultiplier;
    private updateDelta;
    private jumpState;
    private lastPlayerPosition;
    private keyStates;
    private autoRun;
    moveForward: boolean;
    private get physicsBody();
    constructor(player: Player, scene: BJS.Scene);
    toggleAutoRun(): void;
    dispose(): void;
    private isActionPressed;
    private isMovementKeysPressed;
    private isOnFloor;
    movementTick(delta: number): void;
}
