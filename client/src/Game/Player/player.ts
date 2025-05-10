import Actor from "../Actor/actor";
import {
  Vector3,
  Camera3D,
  CharacterBody3D,
  Node3D,
  MeshInstance3D,
  CollisionShape3D,
  is_instance_valid,
} from "godot";
import RACE_DATA from "../Constants/race-data";
import { LoaderOptions } from "@game/GLTF/base";
import { PlayerMovement } from "./player-movement";
import { PlayerCamera } from "./player-cam";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import { Spawn } from "@game/Net/internal/api/capnp/common";

export default class Player extends Actor {
  public playerMovement: PlayerMovement;
  public playerCamera: PlayerCamera;
  public player: PlayerProfile | null = null;
  public isPlayerMoving: boolean = false;
  public  get Target() {
    return this.target;
  }
  public set Target(target: Spawn | null) {
    this.target = target;
    if (target) {
      this.observers["target"].forEach((obs) => obs(target));
    }
  }
  private target: Spawn | null = null;

  static instance: Player | null = null;

  static playerOptions: Partial<LoaderOptions> = {
    flipTextureY: true,
    shadow: false, 
    useCapsulePhysics: true,
  };

  constructor(player: PlayerProfile, camera: Camera3D) {
    const race = player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[player?.gender ?? 0] || raceDataEntry[2];
    console.log('Loading player model:', model);
    super("models", model, Player.playerOptions);
    this.player = player;
    this.playerMovement = new PlayerMovement(this);
    this.playerCamera = new PlayerCamera(this, camera);
    Player.instance = this;
  }

  private observers: Record<string, ((any) => void)[]> = {};

  public addObserver(name: string, observer: (any) => void) {
    if (!this.observers[name]) {
      this.observers[name] = [];
    }
    this.observers[name].push(observer);
  }

  public removeObserver(name: string, observer: (any) => void) {
    if (this.observers[name]) {
      this.observers[name] = this.observers[name].filter((obs) => obs !== observer);
    }
  }

  public dispose() {
    console.log('Call player dispose');
    super.dispose();
  }

  public getPlayerRotation() {
    return this.getNode()?.rotation;
  }

  public getPlayerPosition() {
    return is_instance_valid(this.getNode()) ? this.getNode()?.global_position : null;
  }

  public input(buttonIndex: number) {
    this.playerCamera.mouseInputButton(buttonIndex);
  }

  public inputMouseMotion(x: number, y: number) {
    this.playerCamera.inputMouseMotion(x, y);
  }

  public tick(delta: number) {
    this.playerMovement.movementTick(delta);
  }

  public input_pan(delta: number) {
    this.playerCamera.adjustCameraDistance(delta < 0 ? -1 : 1);
  }

  public setUseCollision(val: boolean) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
  
    const collisionShape = node.getNodesOfType(CollisionShape3D);
    if (collisionShape.length) {
      collisionShape.forEach((a) => a.disabled = !val); // Disable if val is false, enable if val is true
    } else {
      console.warn("No CollisionShape3D found!");
    }
  }

  public async Load(name: string) {
    await super.Load(name);
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
    node.set_process(true);
    node.set_physics_process(true);
    node.set_process_input(true);
    const setMeshLayers = (currentNode: Node3D) => {
      if (currentNode instanceof MeshInstance3D) {
        currentNode.layers = 1 << 1;
      }
      for (const child of currentNode.get_children()) {
        setMeshLayers(child as Node3D);
      }
    };
    setMeshLayers(node);
    node.scale = new Vector3(1.5, 1.5, 1.5);
    node.position = new Vector3(0, 5, 0);
    this.playerCamera.updateCameraPosition(node);
    this.setNameplate(this.player?.name || "Player");
  }
}
