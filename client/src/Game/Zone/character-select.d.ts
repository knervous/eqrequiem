import type * as BJS from "@babylonjs/core";
import { CharacterSelectEntry } from "@game/Net/messages";
import Player from "@game/Player/player";
import type GameManager from "../Manager/game-manager";
export default class CharacterSelect {
    private cameraDistance;
    private cameraHeight;
    private lookatOffset;
    private cameraPosition;
    private cameraPitch;
    private orbitAngle;
    private rotationSpeed;
    private gameManager;
    private zoneManager;
    private readonly locations;
    character: Player | null;
    private camera;
    private orbitObserver;
    faceCam: boolean;
    private loadGeneration;
    private disposed;
    constructor(gameManager: GameManager);
    private initialize;
    dispose(): void;
    private updateCameraPosition;
    startOrbiting(position: BJS.Vector3): void;
    loadModel(player: CharacterSelectEntry, fromCharCreate?: boolean, onLoaded?: () => void): Promise<void>;
}
