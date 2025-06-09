import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import type { EntityContainer, EntityCache } from "./entity-cache";
import { charFileRegex } from "@game/Constants/constants";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { Nameplate } from "./nameplate";
import type { TextRenderer } from '@babylonjs/addons';
import { sleep } from "@game/Constants/util";

type BufferCache = {
  [key: number]: BJS.Vector2;
};

const bufferCache: BufferCache = {};


const modelOffset = {
  'rat': 2.5,
  'bat': -7,
  'bet': -2,
  'sne': -1,
};


export class Entity extends BABYLON.TransformNode {
  public spawn: Spawn;
  public entityContainer: EntityContainer;
  public entityCache: EntityCache;
  public spawnPosition: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private scene: BJS.Scene;
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
  constructor(spawn: Spawn, scene: BJS.Scene, entityContainer: EntityContainer, entityCache: EntityCache, parent: BJS.Node) {
    super(`entity_${spawn.name}`, scene);
    this.spawn = spawn;
    this.scene = scene;
    this.setParent(parent);
    this.entityContainer = entityContainer;
    this.entityCache = entityCache;
    this.spawnPosition = new BABYLON.Vector3(-spawn.y, spawn.z + 5, spawn.x);
    // this.debugWireframe = new DebugWireframe(this, scene);
    this.playAnimation(AnimationDefinitions.Idle1);
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
    while(this.isTearingDown) {
      await sleep(100);
    }

    this.isInitializing = true;
    let meshIdx = 0;

    // Get BB for physics capsule height
    const boundingBox = this.entityContainer.boundingBox;
    let capsuleHeight = 5.5;
    if (boundingBox) {
      const min = new BABYLON.Vector3(boundingBox.min[0], boundingBox.min[1], boundingBox.min[2]);
      const max = new BABYLON.Vector3(boundingBox.max[0], boundingBox.max[1], boundingBox.max[2]);

      const extents = max.subtract(min).scale(0.5);
      capsuleHeight = (extents.z * 2) * 1.5; // Scale height by 1.5 to match entity scaling
      console.log(`[Entity] Using bounding box for ${this.spawn.name} with height ${capsuleHeight}`);
    } else {
      //      console.warn(`[Entity] No bounding box found for ${this.spawn.name}, using default height ${height}`);
    }

    // Setup physics body with capsule shape
    const capsuleRadius = 0.5;
    const pointA = new BABYLON.Vector3(0, capsuleHeight / 2 - capsuleRadius, 0);
    const pointB = new BABYLON.Vector3(0, -(capsuleHeight / 2 - capsuleRadius), 0);

    this.capsuleShape = new BABYLON.PhysicsShapeCapsule(
      pointA,
      pointB,
      capsuleRadius,
      this.scene,
    );
    this.capsuleShape.material.friction = 0.0;
    this.capsuleShape.material.restitution = 0.0;
    const node = new BABYLON.TransformNode(`capsuleShape_${this.spawn.name}`, this.scene);
    node.position = this.spawnPosition;
    this.physicsBody = new BABYLON.PhysicsBody(
      node, // Use the TransformNode as the root
      BABYLON.PhysicsMotionType.DYNAMIC,
      false,
      this.scene,
    );
    this.physicsBody.shape = this.capsuleShape;
    this.physicsBody.setMassProperties({
      mass: 500,
      inertia: new BABYLON.Vector3(0, 0, 0),
    });
    //    this.physicsBody.setGravityFactor(0.01);
    const scale = 1.5;
    // Create body instances and assign physics body
    for (const mesh of this.entityContainer.meshes) {
      const bodyInst = mesh.createInstance(`instance_${this.spawn.name}_${this.spawn.spawnId}_${meshIdx++}`);
      bodyInst.setParent(node);
      bodyInst.position = new BABYLON.Vector3(0, scale * (modelOffset[this.entityContainer.model] ?? 0.5), 0); //this.spawnPosition;
      bodyInst.scaling.setAll(scale);
      bodyInst.instancedBuffers.bakedVertexAnimationSettingsInstanced = this.animationBuffer;
      bodyInst.physicsBody = this.physicsBody; // Assign physics body to instance
      const idx = this.getTextureIndex(mesh.name, this.spawn.equipChest);
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(idx, 0);
      }
      bodyInst.instancedBuffers.sliceIndex = vec;
      this.bodyInstances.push(bodyInst);
    }

    await this.instantiateSecondaryMesh(node);
    await this.instantiateNameplate();
    // this.debugWireframe?.createWireframe();
    this.isInitializing = false;
    this.hidden = false;
  }

  private async instantiateNameplate(): Promise<void> {
    this.nameplate = await Nameplate.createNameplate(this.scene);
    if (!this.nameplate) {
      console.warn(`[Entity] Failed to create nameplate for ${this.spawn.name}`); 
      return; 
    }
    this.nameplate.addParagraph(this.spawn.name.replaceAll('_', ' '), {
      lineHeight: 15,
    });
    this.nameplate.color = BABYLON.Color4.FromHexString("#00ffff");
    this.nameplateNode = new BABYLON.TransformNode(`nameplate_${this.spawn.name}`, this.scene);
    this.nameplateNode.parent = this.bodyInstances[0];
    this.nameplateNode.position = new BABYLON.Vector3(0, 4, 0);
    this.nameplate.parent = this.nameplateNode;
  }

  private async instantiateSecondaryMesh(node: BJS.TransformNode): Promise<void> {
    if (this.entityContainer.secondaryMeshes <= 0) return;
    const variation = this.spawn.helm.toString().padStart(2, '0');
    const secondaryModel = `${this.entityContainer.model}he${variation}`;
    const secondaryMeshContainer = await this.entityCache.getContainer(secondaryModel, this.scene, this.entityContainer.model);
    if (!secondaryMeshContainer) {
      console.warn(`[Entity] Failed to load secondary mesh for ${this.entityContainer.model}${variation}`);
      return;
    }
    const scale = 1.5;
    for (const mesh of secondaryMeshContainer.meshes) {
      const secondaryInstance = mesh.createInstance(mesh.name);
      secondaryInstance.setParent(node);
      secondaryInstance.position = new BABYLON.Vector3(0, scale * (modelOffset[this.entityContainer.model] ?? 0.5), 0); //this.spawnPosition;
      secondaryInstance.scaling.setAll(scale);
      secondaryInstance.instancedBuffers.bakedVertexAnimationSettingsInstanced = this.animationBuffer;
      secondaryInstance.physicsBody = this.physicsBody; // Assign physics body to instance
      const idx = this.getTextureIndex(mesh.name, this.spawn.equipChest);
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(idx, 0);
      }
      mesh.instancedBuffers.sliceIndex = vec;
      secondaryInstance.instancedBuffers.sliceIndex = vec;
      this.secondaryInstances.push(secondaryInstance);
    }
  }

  public playAnimation(name: string): void {
    const match = this.entityContainer.animations.find((a) => a.name === name);
    if (!match) return;
    this.animationBuffer.set(match.from, match.to, 0, 60);
  }

  private getTextureIndex(originalName: string, variation: number): number {
    const match = originalName.match(charFileRegex);
    if (!match) {
      console.log(`[SwapTexture] Sub-material name ${originalName} does not match expected format`);
      return -1;
    }
    const [, model, piece, , texIdx] = match;
    return this.entityContainer?.textureAtlas.indexOf(`${model}${piece}${variation.toString().padStart(2, '0')}${texIdx}`) ?? -1;
  }
}


export class DebugWireframe {
  private wireframeMesh: BJS.Mesh | null = null;
  private scene: BJS.Scene;
  private entity: Entity;
  private static enabled: boolean = true;

  constructor(entity: Entity, scene: BJS.Scene) {
    this.entity = entity;
    this.scene = scene;
  }

  public static toggleDebugWireframes(): void {
    DebugWireframe.enabled = !DebugWireframe.enabled;
    console.log(`[DebugWireframe] Wireframes ${DebugWireframe.enabled ? 'enabled' : 'disabled'}`);
  }

  public createWireframe(): void {
    if (!DebugWireframe.enabled || this.wireframeMesh || !this.entity.entityContainer.boundingBox) {
      return;
    }

    const boundingBox = this.entity.entityContainer.boundingBox;
    const min = new BABYLON.Vector3(boundingBox.min[0], boundingBox.min[1], boundingBox.min[2]);
    const max = new BABYLON.Vector3(boundingBox.max[0], boundingBox.max[1], boundingBox.max[2]);

    // Calculate center and extents
    const center = BABYLON.Vector3.Center(min, max);
    const extents = max.subtract(min).scale(0.5);

    // Create wireframe box
    this.wireframeMesh = BABYLON.MeshBuilder.CreateBox(
      `wireframe_${this.entity.spawn.name}_${this.entity.spawn.spawnId}`,
      {
        width: extents.x * 2,
        height: extents.z * 2,
        depth: extents.y,
      },
      this.scene,
    );

    // Set wireframe material
    const material = new BABYLON.StandardMaterial(`wireframe_mat_${this.entity.spawn.name}`, this.scene);
    material.wireframe = true;
    material.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green wireframe
    this.wireframeMesh.material = material;

    // Parent to the physics node's transform and position at the center
    this.wireframeMesh.parent = this.entity.physicsBody?.transformNode || null;
    this.wireframeMesh.position = center;
    //this.wireframeMesh.position.y += 5; // Adjust height to match entity's position
    // Apply scaling to match entity
    this.wireframeMesh.scaling.setAll(1.5); // Match the entity's scaling
  }

  public dispose(): void {
    if (this.wireframeMesh) {
      this.wireframeMesh.dispose();
      this.wireframeMesh = null;
    }
  }
}