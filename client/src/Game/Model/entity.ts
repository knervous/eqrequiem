import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import type { EntityContainer, EntityCache } from "./entity-cache";
import { charFileRegex } from "@game/Constants/constants";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { Nameplate } from "./nameplate";
import type { TextRenderer } from "@babylonjs/addons";
import { sleep } from "@game/Constants/util";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import type GameManager from "@game/Manager/game-manager";

type BufferCache = {
  [key: number]: BJS.Vector2;
};

const bufferCache: BufferCache = {};

const modelOffset = {
  rat: 2.5,
  bat: -7,
  bet: -2,
  sne: -1,
};
export class Entity extends BABYLON.TransformNode {
  public spawn: Spawn | PlayerProfile;
  public entityContainer: EntityContainer;
  public entityCache: EntityCache;
  public spawnPosition: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  public spawnScale: number = 1.5; // Default scaling factor for entities

  private gameManager: GameManager;
  private scene: BJS.Scene;
  private nodeContainer: BJS.TransformNode | null = null;
  private animationBuffer: BJS.Vector4 = new BABYLON.Vector4(0, 1, 0, 60);
  private bodyInstances: BJS.InstancedMesh[] = [];
  private secondaryInstances: BJS.InstancedMesh[] = [];
  private isTearingDown: boolean = false;
  private isInitializing: boolean = false;
  private nameplate: TextRenderer | null = null;
  private nameplateNode: BJS.TransformNode | null = null;
  private hidden: boolean = true;
  private capsuleShape: BJS.PhysicsShapeCapsule | null = null;
  // private debugWireframe: DebugWireframe | null = null;
  constructor(
    gameManager: GameManager,
    spawn: Spawn | PlayerProfile,
    scene: BJS.Scene,
    entityContainer: EntityContainer,
    entityCache: EntityCache,
    parent: BJS.Node,
  ) {
    super(`entity_${spawn.name}`, scene);
    this.gameManager = gameManager;
    this.spawn = spawn;
    this.scene = scene;
    this.setParent(parent);
    this.entityContainer = entityContainer;
    this.entityCache = entityCache;
    this.spawnScale = spawn.scale || 1.5; // Use spawn scale if available, otherwise default to 1.5
    this.spawnPosition = new BABYLON.Vector3(spawn.x, spawn.y + 5, spawn.z);
    // this.debugWireframe = new DebugWireframe(this, scene);
    this.playAnimation(AnimationDefinitions.Idle1);
  }

  public meshes(): BJS.InstancedMesh[] {
    return this.bodyInstances.concat(this.secondaryInstances);
  }

  public getHeading() : number {
    const physicsBody = this.physicsBody;
    if (!physicsBody) {
      return 0;
    }

    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;


    const [,outQuat] = plugin._hknp.HP_Body_GetOrientation(
      physicsBody._pluginData.hpBodyId,
    );
    const eulers = BABYLON.Quaternion.FromArray(outQuat).toEulerAngles();

    return eulers.y;
  }

  public setVelocity(x: number, y: number, z: number) {
    const physicsBody = this.physicsBody;
    if (!physicsBody) {
      return;
    }
    physicsBody.setLinearVelocity(new BABYLON.Vector3(x, y, z));
  }

  public setRotation(yaw: number) {
    const physicsBody = this.physicsBody;
    if (!physicsBody) {
      return;
    }
    const normalized = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const q = BABYLON.Quaternion.RotationYawPitchRoll(normalized, 0, 0);

    this.rotationQuaternion = q;
    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;

    plugin._hknp.HP_Body_SetOrientation(
      physicsBody._pluginData.hpBodyId,
      q.asArray(),
    );

  }

  public setPosition(x: number, y: number, z: number) {
    const physicsBody = this.physicsBody;
    if (!physicsBody) {
      return;
    } 
    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;

    plugin._hknp.HP_Body_SetPosition(physicsBody._pluginData.hpBodyId, [
      x,
      y,
      z,
    ]);
  }

  public dispose() {
    if (this.isTearingDown || this.hidden) return;
    this.isTearingDown = true;

    // Dispose all instances
    for (const instance of this.bodyInstances) {
      instance.dispose();
    }
    this.bodyInstances = [];
    for (const instance of this.secondaryInstances) {
      instance.dispose();
    }
    this.secondaryInstances = [];

    // Dispose nameplate and its node
    Nameplate.removeNameplate(this.nameplate!);
    this.nameplate?.dispose();
    this.nameplateNode?.dispose();

    // Dispose node container
    if (this.nodeContainer) {
      this.nodeContainer.dispose();
      this.nodeContainer = null;
    }

    // Dispose physics body and shape
    if (this.physicsBody) {
      this.physicsBody.dispose();
      this.physicsBody = null;
    }
    if (this.capsuleShape) {
      this.capsuleShape.dispose();
      this.capsuleShape = null;
    }

    // Clear references
    this.nameplate = null;
    this.nameplateNode = null;

    // Set flags
    this.isTearingDown = false;
    this.hidden = true;
    super.dispose();
  }

  public toggleVisibility(visible: boolean): void {
    this.nodeContainer?.setEnabled(visible);
  }

  public async hide(): Promise<void> {
    if (this.isTearingDown || this.hidden) return;
    this.isTearingDown = true;

    // Dispose physics body and shape
    if (this.physicsBody) {
      this.physicsBody.dispose();
      this.physicsBody = null;
    }
    if (this.capsuleShape) {
      this.capsuleShape.dispose();
      this.capsuleShape = null;
    }

    for (const instance of this.bodyInstances) {
      instance.dispose();
    }
    this.bodyInstances = [];
    for (const instance of this.secondaryInstances) {
      instance.dispose();
    }
    this.secondaryInstances = [];
    Nameplate.removeNameplate(this.nameplate!);
    if (this.nodeContainer) {
      this.nodeContainer.dispose();
      this.nodeContainer = null;
    }
    this.nameplate = null;
    this.nameplateNode?.dispose();
    this.nameplateNode = null;
    this.isTearingDown = false;
    this.hidden = true;
  }

  public async initialize() {
    if (!this.hidden) {
      return;
    }
    if (this.isInitializing) {
      return;
    }
    while (this.isTearingDown) {
      await sleep(100);
    }

    this.isInitializing = true;
    let meshIdx = 0;

    // Get BB for physics capsule height
    const boundingBox = this.entityContainer.boundingBox;
    let capsuleHeight = 5.5;
    if (boundingBox) {
      const min = new BABYLON.Vector3(
        boundingBox.min[0],
        boundingBox.min[1],
        boundingBox.min[2],
      );
      const max = new BABYLON.Vector3(
        boundingBox.max[0],
        boundingBox.max[1],
        boundingBox.max[2],
      );

      const extents = max.subtract(min).scale(0.5);
      capsuleHeight = extents.z * 2 * this.spawnScale; // Scale height by spawnScale
    } else {
    }

    // Setup physics body with capsule shape
    const capsuleRadius = 2.0;
    const pointA = new BABYLON.Vector3(0, capsuleHeight / 2 - capsuleRadius, 0);
    const pointB = new BABYLON.Vector3(
      0,
      -(capsuleHeight / 2 - capsuleRadius),
      0,
    );

    this.capsuleShape = new BABYLON.PhysicsShapeCapsule(
      pointA,
      pointB,
      capsuleRadius,
      this.scene,
    );
    this.capsuleShape.material.friction = 0.0;
    this.capsuleShape.material.restitution = 0.0;
    this.nodeContainer = new BABYLON.TransformNode(
      `${this.spawn.name}`,
      this.scene,
    );
    this.nodeContainer.position = this.spawnPosition;
    this.physicsBody = new BABYLON.PhysicsBody(
      this.nodeContainer, // Use the TransformNode as the root
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene,
    );
    // Lock angular motion to prevent physics-induced rotation
    this.physicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
    this.physicsBody.setAngularDamping(1.0); // High damping to resist rotation
    this.physicsBody.setLinearDamping(0);

    this.physicsBody.shape = this.capsuleShape;
    this.physicsBody.setMassProperties({
      mass: 500,
      inertia: new BABYLON.Vector3(0, 0, 0),
    });
    // Create body instances and assign physics body
    for (const mesh of this.entityContainer.meshes) {
      const bodyInst = mesh.createInstance(
        `instance_${this.spawn.name}_${this.spawn.spawnId ?? ''}_${meshIdx++}`,
      );
      bodyInst.setParent(this.nodeContainer);
      bodyInst.position = new BABYLON.Vector3(
        0,
        this.spawnScale * (modelOffset[this.entityContainer.model] ?? 0.5),
        0,
      ); //this.spawnPosition;
      bodyInst.scaling.setAll(this.spawnScale);
      bodyInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
        this.animationBuffer;
      bodyInst.physicsBody = this.physicsBody; // Assign physics body to instance
      const idx = this.getTextureIndex(
        mesh.name,
        "equipChest" in this.spawn ? this.spawn?.equipChest : 3,
      );
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(idx, 0);
      }
      bodyInst.instancedBuffers.textureAttributes = vec;
      this.bodyInstances.push(bodyInst);
    }
    if ("equipChest" in this.spawn) {
      const variation = this.spawn.helm.toString().padStart(2, "0");
      await this.instantiateSecondaryMesh(variation, this.spawn.equipChest);
    }
    await this.instantiateNameplate([this.spawn.name.replaceAll("_", " ")]);
    // this.debugWireframe?.createWireframe();
    this.isInitializing = false;
    this.hidden = false;
  }

  public async instantiateNameplate(textLines: string[]): Promise<void> {
    this.nameplate?.dispose();
    this.nameplateNode?.dispose();
    this.nameplate = await Nameplate.createNameplate(this.scene);
    if (!this.nameplate) {
      console.warn(
        `[Entity] Failed to create nameplate for ${textLines.join(", ")}`,
      );
      return;
    }
    for (const line of textLines) {
      this.nameplate.addParagraph(line);
    }
    this.nameplate.color = BABYLON.Color4.FromHexString("#00ffff");
    this.nameplateNode = new BABYLON.TransformNode(
      `nameplate_${this.spawn.name}`,
      this.scene,
    );
    this.nameplateNode.parent = this.bodyInstances[0].parent;
    this.nameplateNode.position = new BABYLON.Vector3(0, 4 + (textLines.length * 1.5 * this.spawnScale), 0);
    this.nameplate.parent = this.nameplateNode;
  }

  public async instantiateSecondaryMesh(
    variation: string,
    textureVariation: number,
  ): Promise<void> {
    if (this.entityContainer.secondaryMeshes <= 0) return;
    for (const instance of this.secondaryInstances) {
      instance.dispose();
    }
    this.secondaryInstances = [];
    const secondaryModel = `${this.entityContainer.model.slice(0, 3)}he${variation}`;
    const secondaryMeshContainer = await this.entityCache.getContainer(
      secondaryModel,
      this.scene,
      this.entityContainer.model,
    );
    if (!secondaryMeshContainer) {
      console.warn(
        `[Entity] Failed to load secondary mesh for ${this.entityContainer.model}${variation}`,
      );
      return;
    }

    for (const mesh of secondaryMeshContainer.meshes) {
      const secondaryInstance = mesh.createInstance(mesh.name);
      secondaryInstance.setParent(this.nodeContainer);
      secondaryInstance.position = new BABYLON.Vector3(
        0,
        this.spawnScale * (modelOffset[this.entityContainer.model] ?? 0.5),
        0,
      ); //this.spawnPosition;
      secondaryInstance.scaling.setAll(this.spawnScale);
      secondaryInstance.instancedBuffers.bakedVertexAnimationSettingsInstanced =
        this.animationBuffer;
      secondaryInstance.physicsBody = this.physicsBody; // Assign physics body to instance
      const idx = this.getTextureIndex(mesh.name, textureVariation);
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(idx, 0);
      }
      mesh.instancedBuffers.textureAttributes = vec;
      secondaryInstance.instancedBuffers.textureAttributes = vec;
      this.secondaryInstances.push(secondaryInstance);
    }
  }

  public currentAnimation: string | null = null;

  public playAnimation(name: string, playThrough: boolean = false): void {
    const match = this.entityContainer.animations.find((a) => a.name === name);
    if (!match) {
      // console.warn(
      //   `[Entity] Animation ${name} not found in ${this.entityContainer.model}`,
      // );
      if (name === AnimationDefinitions.Walking) {
        this.playAnimation(AnimationDefinitions.Running, playThrough);
      }
      return;
    };
    const manager = this.entityContainer.manager;
    if (!manager) {
      console.warn(
        `[Entity] No animation manager found for ${this.entityContainer.model}`,
      );
      return;
    }
    if (this.currentAnimation === name && !playThrough) {
      return;
    }
    this.currentAnimation = name;
    this.animationBuffer.set(match.from, match.to, 0, 60);
  }

  private getTextureIndex(originalName: string, variation: number = 1): number {
    const match = originalName.match(charFileRegex);
    if (!match) {
      console.warn(
        `[SwapTexture] Sub-material name ${originalName} does not match expected format`,
      );
      return -1;
    }
    const [, model, piece, , texIdx] = match;
    return (
      this.entityContainer?.textureAtlas.indexOf(
        `${model}${piece}${variation.toString().padStart(2, "0")}${texIdx}`,
      ) ?? -1
    );
  }
}
