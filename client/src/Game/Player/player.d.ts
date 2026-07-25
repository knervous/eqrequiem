import type * as BJS from "@babylonjs/core";
import type GameManager from "@game/Manager/game-manager";
import { Entity } from "@game/Model/entity";
import { MoveItem, PlayerProfile } from "@game/Net/messages";
import { ActionButtonData } from "@ui/components/game/action-button/constants";
import { PlayerAbility } from "./player-ability";
import { PlayerCamera } from "./player-cam";
import { PlayerCombat } from "./player-combat";
import { PlayerInventory } from "./player-inventory";
import { PlayerKeyboard } from "./player-keyboard";
import { PlayerMovement } from "./player-movement";
import { PlayerSocials } from "./player-socials";
export default class Player {
    gameManager: GameManager;
    private inGame;
    playerMovement: PlayerMovement | null;
    playerCamera: PlayerCamera;
    playerKeyboard: PlayerKeyboard;
    playerCombat: PlayerCombat;
    playerAbility: PlayerAbility;
    playerSocials: PlayerSocials;
    playerInventory: PlayerInventory;
    static instance: Player | null;
    player: PlayerProfile | null;
    playerEntity: Entity | null;
    isPlayerMoving: boolean;
    model: string;
    currentAnimation: string;
    currentPlayToEnd: boolean;
    private originalCollisionFilter;
    private raycastTickCounter;
    private readonly raycastCheckInterval;
    private loadGeneration;
    private disposed;
    private readonly tickHandler;
    /**
     * Running
     */
    private running;
    get Running(): boolean;
    set Running(value: boolean);
    /**
     * Sitting
     */
    private sitting;
    get Sitting(): boolean;
    set Sitting(value: boolean);
    /**
     * Target
     */
    private target;
    get Target(): Entity | null;
    set Target(target: Entity | null);
    get hasCursorItem(): boolean;
    constructor(gameManager: GameManager, camera: BJS.UniversalCamera, inGame?: boolean);
    dispose(): void;
    getPlayerRotation(): BJS.Vector3;
    getPlayerPosition(): BJS.Vector3 | undefined;
    inputMouseButton(buttonIndex: number): void;
    inputMouseMotion(x: number, y: number): void;
    setGravity(on: boolean): void;
    setCollision(on: boolean): void;
    tick(): void;
    private get headVariation();
    private get headModelName();
    get physicsPlugin(): BJS.HavokPlugin;
    setRotation(yaw: number): void;
    setPosition(x: number, y: number, z: number): void;
    UpdateNameplate(lines: string[]): Promise<void>;
    /**
     * Retrieves or creates a shared parent node on the scene
     * under which all entities will be bucketed.
     */
    private getOrCreateNodeContainer;
    Load(player: PlayerProfile, fromCharSelect?: boolean): Promise<void>;
    toggleAutoRun(): void;
    playAnimation(animationName: string, playThrough?: boolean): void;
    playPos(): void;
    playStationaryJump(): void;
    playJump(): void;
    playWalk(): void;
    playRun(): void;
    playDuckWalk(): void;
    playShuffle(): void;
    playIdle(): void;
    doAction(actionData?: ActionButtonData): void;
    toggleSit(): void;
    toggleWalk(): void;
    autoAttack(): void;
    rangedAttack(): void;
    moveItem(item: MoveItem): void;
}
