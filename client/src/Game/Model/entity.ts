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

const bufferCache: BufferCache = {

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
  private currentSecondaryVariation: string = '';

  constructor(spawn: Spawn, scene: BJS.Scene, entityContainer: EntityContainer, entityCache: EntityCache, parent: BJS.Node) {
    super(`entity_${spawn.name}`, scene);
    this.spawn = spawn;
    this.scene = scene;
    this.setParent(parent);
    this.entityContainer = entityContainer;
    this.entityCache = entityCache;
    this.spawnPosition = new BABYLON.Vector3(-spawn.y, spawn.z, spawn.x);
    
    this.playAnimation(AnimationDefinitions.Idle1);
  }

  public async hide(): Promise<void> {
    if (this.isTearingDown || this.hidden) return;
    this.isTearingDown = true;
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

    for (const mesh of this.entityContainer.meshes) {
      const bodyInst = mesh.createInstance(`instance_${this.spawn.name}_${this.spawn.spawnId}_${meshIdx++}`);
      bodyInst.setParent(this);
      bodyInst.position = this.spawnPosition;;
      bodyInst.scaling.setAll(1.5);
      bodyInst.instancedBuffers.bakedVertexAnimationSettingsInstanced = this.animationBuffer;
      const idx = this.getTextureIndex(mesh.name, this.spawn.equipChest);
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(
          idx, 0,
        );
      }
      bodyInst.instancedBuffers.sliceIndex = vec;
      this.bodyInstances.push(bodyInst);
    }
    await this.instantiateSecondaryMesh();
    await this.instantiateNameplate();
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
    // a nice turquoise color for the nameplate
    this.nameplate.color = BABYLON.Color4.FromHexString("#00ffff");
    this.nameplateNode = new BABYLON.TransformNode(`nameplate_${this.spawn.name}`, this.scene);
    this.nameplateNode.parent = this.bodyInstances[0];
    this.nameplateNode.position = new BABYLON.Vector3(0, 4, 0); // Adjust position as needed
    this.nameplate.parent = this.nameplateNode;
  }

  private async instantiateSecondaryMesh(): Promise<void> {
    if (this.entityContainer.secondaryMeshes <= 0) return;
    const variation = this.spawn.helm.toString().padStart(2, '0');
    this.currentSecondaryVariation = variation;

    const secondaryModel = `${this.entityContainer.model}he${variation}`;
    const secondaryMeshContainer = await this.entityCache.getContainer(secondaryModel, this.scene, this.entityContainer.model);
    if (!secondaryMeshContainer) {
      console.warn(`[Entity] Failed to load secondary mesh for ${this.entityContainer.model}${variation}`);
      return;
    }
    let i = 0;
    for (const mesh of secondaryMeshContainer.meshes) {
      const secondaryInstance = mesh.createInstance(`instance_sec_${i++}`);
      secondaryInstance.setParent(this);
      secondaryInstance.position = this.spawnPosition;
      secondaryInstance.scaling.setAll(1.5);
      secondaryInstance.instancedBuffers.bakedVertexAnimationSettingsInstanced = this.animationBuffer;
      const idx = this.getTextureIndex(mesh.name, this.spawn.equipChest);
      let vec;
      if (bufferCache[idx]) {
        vec = bufferCache[idx];
      } else {
        vec = bufferCache[idx] = new BABYLON.Vector2(
          idx, 0,
        );
      }
      mesh.instancedBuffers.sliceIndex = vec;
      this.secondaryInstances.push(secondaryInstance);
    }

  }
  public playAnimation(name: string): void {
    const match = this.entityContainer.animations.find((a) => a.name === name);
    if (!match) return;
    this.animationBuffer.set(match.from, match.to, 0, 60);
  }

  private getTextureIndex(originalName, variation) : number {
    const match = originalName.match(charFileRegex);
    if (!match) {
      console.log(`[SwapTexture] Sub-material name ${originalName} does not match expected format`);
      return -1;
    }
    const [, model, piece, , texIdx] = match;
    return this.entityContainer?.textureAtlas.indexOf(`${model}${piece}${variation.toString().padStart(2, '0')}${texIdx}`) ?? -1;
  }

}