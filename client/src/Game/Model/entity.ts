import type { TextRenderer } from '@babylonjs/addons';
import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import {
  charFileRegex,
  clkRegex,
  isPlayerRace,
  MaterialPrefixes,
} from '@game/Constants/constants';
import { RaceEntry } from '@game/Constants/race-data';
import { sleep } from '@game/Constants/util';
import type GameManager from '@game/Manager/game-manager';
import { Spawn } from '@game/Net/internal/api/capnp/common';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import Player from '@game/Player/player';
import {
  InventorySlot,
  InventorySlotTextures,
  NullableItemInstance,
} from '@game/Player/player-constants';
import type { EntityContainer, EntityCache } from './entity-cache';
import { createTargetRingMaterial } from './entity-select-ring';
import { Nameplate } from './nameplate';

const modelYOffset = {
  gnn: 0.5,
};
export class Entity extends BABYLON.TransformNode {
  public spawn: Spawn | PlayerProfile;
  public entityContainer: EntityContainer;
  public entityCache: EntityCache;
  public spawnPosition: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  public spawnScale: number = 1.5; // Default scaling factor for entities
  public hidden: boolean = true;
  public raceDataEntry: RaceEntry | null = null;

  public get cleanName(): string {
    return this.spawn.name.replaceAll('_', ' ');
  }

  private static pickerPrototype: BJS.Mesh;
  private static targetRing: BJS.Mesh;
  private static currentlySelected: Entity | null = null;
  private static targetTexture: BJS.ProceduralTexture | null = null;

  public static disposeStatics() {
    if (Entity.pickerPrototype) {
      Entity.pickerPrototype.dispose(false, true);
      Entity.pickerPrototype = null as unknown as BJS.Mesh;
    }
    if (Entity.targetRing) {
      Entity.targetRing.dispose(false, true);
      Entity.targetRing = null as unknown as BJS.Mesh;
    }
    if (Entity.targetTexture) {
      Entity.targetTexture.dispose();
      Entity.targetTexture = null;
    }
    Entity.currentlySelected = null;
  }

  public static instantiateStatics(scene: BJS.Scene) {
    if (!Entity.pickerPrototype) {
      // create a unit cube at the world origin
      Entity.pickerPrototype = BABYLON.MeshBuilder.CreateBox(
        'pickerProto',
        { size: 1 },
        scene,
      );
      // one totally transparent material
      const pickMat = new BABYLON.StandardMaterial('pickerMat', scene);
      pickMat.alpha = 0;
      Entity.pickerPrototype.material = pickMat;
      Entity.pickerPrototype.isPickable = false;
      Entity.pickerPrototype.setEnabled(false);
    }

    if (!Entity.targetRing) {
      const targetRing = BABYLON.MeshBuilder.CreateTorus(
        'selectionRing',
        {
          diameter    : 5, // outer diameter = 2 × your desired radius (5 × 2)
          thickness   : 4, // tube thickness — make this as big as you like to “fill” the hole
          tessellation: 64, // smoothness
          updatable   : true, // if you ever want to tweak it at runtime
        },
        scene,
      );
      const positions = targetRing.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      )!;
      const uvs = new Array((positions.length / 3) * 2);
      for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
        const x = positions[i]; // ring’s local X
        const z = positions[i + 2]; // ring’s local Z
        uvs[j] = x / 10 + 0.5; // x∈[-5..+5] → [0..1]
        uvs[j + 1] = z / 10 + 0.5; // z∈[-5..+5] → [0..1]
      }
      targetRing.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, true);
      const [mat, texture] = createTargetRingMaterial(scene);
      Entity.targetTexture = texture;
      targetRing.material = mat;
      targetRing.isPickable = false;
      targetRing.setEnabled(false);
      Entity.targetRing = targetRing;
    }
  }

  private textureBuffers: Record<string, BJS.Vector4> = {};

  private gameManager: GameManager;
  private scene: BJS.Scene;
  private nodeContainer: BJS.TransformNode | null = null;
  private animationBuffer: BJS.Vector4 = new BABYLON.Vector4(0, 1, 0, 60);
  private bodyInstances: BJS.InstancedMesh[] = [];
  private isTearingDown: boolean = false;
  private isInitializing: boolean = false;
  private nameplate: TextRenderer | null = null;
  private nameplateNode: BJS.TransformNode | null = null;
  private capsuleShape: BJS.PhysicsShapeCapsule | null = null;
  private pickInst: BJS.InstancedMesh | null = null;
  private isPlayer = false;

  private get isPlayerRace() {
    return isPlayerRace(this.entityContainer.model);
  }

  private get physicsPlugin(): BJS.HavokPlugin {
    return this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;
  }

  // private debugWireframe: DebugWireframe | null = null;
  constructor(
    gameManager: GameManager,
    spawn: Spawn | PlayerProfile,
    scene: BJS.Scene,
    entityContainer: EntityContainer,
    entityCache: EntityCache,
    parent: BJS.Node,
    raceEntry: RaceEntry,
  ) {
    super(`entity_${spawn.name}`, scene);
    this.isPlayer = !!((spawn as PlayerProfile)?.inventoryItems ?? false);
    this.raceDataEntry = raceEntry;
    this.gameManager = gameManager;
    this.spawn = spawn;
    this.scene = scene;
    this.setParent(parent);
    this.entityContainer = entityContainer;
    this.entityCache = entityCache;
    const height = 6;
    let spawnScale = spawn instanceof Spawn ? spawn.size : 6;
    if (spawnScale === -1) {
      spawnScale = 6;
    }
    const finalScale = spawnScale / height;

    this.spawnScale = finalScale; // Use spawn scale if available, otherwise default to 1.5
    this.spawnPosition = new BABYLON.Vector3(spawn.x, spawn.y, spawn.z);
    // this.debugWireframe = new DebugWireframe(this, scene);
    this.playAnimation(AnimationDefinitions.Idle1);
    Entity.instantiateStatics(scene);
  }

  public get isHumanoid(): boolean {
    return this.spawn.race >= 1 && this.spawn.race <= 12;
  }

  public meshes(): BJS.InstancedMesh[] {
    return this.bodyInstances;
  }

  public getHeading(): number {
    const physicsBody = this.physicsBody;
    if (!physicsBody) {
      return 0;
    }

    const [, outQuat] = this.physicsPlugin._hknp.HP_Body_GetOrientation(
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
  private lastYaw: number = 0;
  public setRotation(yaw: number) {
    this.lastYaw = yaw;
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

  public getClosestSpawns(
    n: number = 1,
    filter: (spawn: Entity) => boolean = () => true,
  ): Entity[] {
    const entities = this.gameManager.ZoneManager?.EntityPool?.entities ?? {};
    const myPos = this.spawnPosition;
    // Create an array of entities with their distances
    return Object.values(entities)
      .filter((entity) => !entity.hidden && entity !== this)
      .map((entity) => ({
        entity,
        dist: Math.sqrt(
          BABYLON.Vector3.DistanceSquared(myPos, entity.spawnPosition),
        ),
      }))
      .filter((entity) => filter(entity.entity))
      .sort((a, b) => a.dist - b.dist) // Sort by distance
      .slice(0, n) // Take the 5 closest
      .map((entry) => entry.entity);
  }

  public setSelected(selected: boolean, color?: BJS.Color4): void {
    const targetRing = Entity.targetRing!;
    if (selected) {
      // deselect any previous entity
      if (Entity.currentlySelected && Entity.currentlySelected !== this) {
        Entity.currentlySelected.setSelected(false);
      }
      Entity.currentlySelected = this;

      // move & show
      targetRing.setParent(this.nodeContainer!);
      const result = new BABYLON.PhysicsRaycastResult();
      const rayOrigin = this.nodeContainer!.position;
      const downEnd = rayOrigin.add(new BABYLON.Vector3(0, -1000, 0)); // 10 units down
      this.physicsPlugin.raycast(rayOrigin, downEnd, result);
      let offset = -3 * this.spawnScale; // Default offset for the ring
      if (result.hasHit) {
        const hitPoint = result.hitPoint;
        offset = hitPoint.y - rayOrigin.y; // Calculate offset based on hit point

        // Then half the width
        offset -= 1.75 * this.spawnScale; // Adjust for the ring's height
      }

      if (color) {
        color.a = 0.5;
        Entity.targetTexture?.setColor4('color', color);
      }
      targetRing.scaling.setAll(this.spawnScale);
      targetRing.position.set(0, offset + 0.1, 0);
      targetRing.setEnabled(true);
    } else {
      // only hide if *this* entity is the one that owns it
      if (Entity.currentlySelected === this) {
        targetRing.setEnabled(false);
        Entity.currentlySelected = null;
      }
    }
  }

  public dispose() {
    // Dispose all instances
    for (const instance of this.bodyInstances) {
      instance.dispose();
    }
    this.bodyInstances = [];

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
    // Dispose pick instance
    if (this.pickInst) {
      this.pickInst.dispose();
      this.pickInst = null;
    }

    // Clear references
    this.nameplate = null;
    this.nameplateNode = null;

    super.dispose();
  }

  public toggleVisibility(visible: boolean): void {
    this.nodeContainer?.setEnabled(visible);
  }

  public async hide(): Promise<void> {
    if (this.isTearingDown || this.hidden) {
      return;
    }
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
    if (this.pickInst) {
      this.pickInst.dispose();
    }

    for (const instance of this.bodyInstances) {
      instance.dispose();
    }
    this.bodyInstances = [];

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

    this.setupPhysics();
    // Create body instances and assign physics body
    this.instantiateMeshes();

    await this.instantiateNameplate([this.spawn.name.replaceAll('_', ' ')]);

    this.updateModelTextures();
    this.checkBelowAndReposition();
    // this.debugWireframe?.createWireframe();
    this.isInitializing = false;
    this.hidden = false;
  }

  private instantiateMeshes() {
    for (const mesh of this.entityContainer.meshes) {
      const name = mesh.metadata.name;
      mesh.isPickable = false;
      const bodyInst = mesh.createInstance(
        `i_${this.spawn.spawnId ?? ''}_${mesh.metadata.gltf.extras.piece}_${mesh.metadata.gltf.extras.variation}_${mesh.metadata.gltf.extras.texNum}`,
      );
      bodyInst.setParent(this.nodeContainer);
      bodyInst.position = new BABYLON.Vector3(0, this.spawnScale * 0.5, 0); // this.spawnPosition;
      bodyInst.scaling.setAll(this.spawnScale);
      bodyInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
        this.animationBuffer;
      bodyInst.physicsBody = this.physicsBody;
      bodyInst.metadata = mesh.metadata || {};
      const vec = this.textureBuffers[name] || new BABYLON.Vector4(0, 1, 1, 1);
      this.textureBuffers[name] = vec;
      bodyInst.instancedBuffers.textureAttributes = vec;
      this.bodyInstances.push(bodyInst);
    }
  }

  private isNpc(): boolean {
    return !!(this.spawn as Spawn).isNpc;
  }

  private isPc(): boolean {
    return !this.isPlayer && !this.isNpc();
  }
  private headModel(): string {
    let variation = '';
    if (this.isNpc()) {
      variation = (this.spawn as any as Spawn).helm.toString().padStart(2, '0');
    } else if (this.isPc()) {
      variation =
        (this.spawn as any as Spawn)?.equipment?.head
          ?.toString()
          ?.padStart(2, '0') ?? '00';
    } else if (this.isPlayer) {
      const headItem =
        Player.instance?.playerInventory.get(InventorySlot.Head, -1) ??
        Player.instance?.playerInventory.get(InventorySlot.Head, 0) ??
        null;
      if (headItem) {
        variation = headItem.material.toString().padStart(2, '0');
      } else {
        variation = '00'; // Default to 00 if no head item found
      }
    }
    return variation;
  }

  private robeModel(): string {
    let variation = '';
    if ('equipChest' in this.spawn && this.spawn.equipChest >= 10) {
      variation = this.spawn.equipChest.toString().padStart(2, '0');
    } else if ((this.spawn as any as Spawn)?.equipment?.chest >= 10) {
      variation = (this.spawn as any as Spawn).equipment.chest
        .toString()
        .padStart(2, '0');
    } else if (this.isPlayer) {
      const playerChestItem =
        Player.instance?.playerInventory.get(InventorySlot.Chest, -1) ??
        Player.instance?.playerInventory.get(InventorySlot.Chest, 0) ??
        null;
      if (playerChestItem?.material && playerChestItem.material >= 10) {
        variation = playerChestItem.material.toString().padStart(2, '0');
      }
    }
    return variation;
  }
  private primaryMeshes: BJS.InstancedMesh[] = [];
  private secondaryMeshes: BJS.InstancedMesh[] = [];

  private async updatePrimary() {
    let item = '';
    for (const mesh of this.primaryMeshes) {
      console.log('Disposing primary mesh', mesh.name);
      mesh.dispose();
    }
    this.primaryMeshes = [];
    if (this.isPlayer) {
      item =
        Player.instance?.playerInventory.get(InventorySlot.Primary, -1)
          ?.idfile ??
        Player.instance?.playerInventory.get(InventorySlot.Primary, 0)
          ?.idfile ??
        '';
    } else {
      const primary = (this.spawn as Spawn).equipment.primary;
      if (primary) {
        item = `IT${primary}`;
      }
    }
    if (item.length === 0) {
      return;
    }
    console.log('[Entity] Updating primary weapon model', item);
    const itemContainer = await this.entityContainer?.getItem?.(item);
    if (itemContainer) {
      for (const mesh of itemContainer.meshes) {
        const itemInst = mesh.createInstance(`i_primary_${item}`);
        itemInst.rotation = this.rotation;
        itemInst.setParent(this.nodeContainer);
        itemInst.position = new BABYLON.Vector3(0, this.spawnScale * 0.5, 0); // this.spawnPosition;
        itemInst.scaling.setAll(this.spawnScale);
        const totalCount = itemInst.getTotalVertices();
        const weaponMI: number[] = [];
        const weaponMW: number[] = [];
        const { skeleton } = this.entityContainer;
        const primaryBone = skeleton?.bones.find((b) => b.name === 'r_point');
        if (skeleton && primaryBone) {
          itemInst.bakedVertexAnimationManager = this.entityContainer.manager!;
          itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            this.animationBuffer;
          itemInst.scaling.setAll(this.spawnScale);
          for (let i = 0; i < totalCount; i++) {
            weaponMI.push(primaryBone.getIndex(), 0, 0, 0);
            weaponMW.push(1, 0, 0, 0);
          }
          itemInst.setVerticesData(
            BABYLON.VertexBuffer.MatricesIndicesKind,
            weaponMI,
            false,
          );
          itemInst.setVerticesData(
            BABYLON.VertexBuffer.MatricesWeightsKind,
            weaponMW,
            false,
          );
          this.primaryMeshes.push(itemInst);
        } else {
          itemInst.dispose();
        }
      }
    } else {
      console.warn(
        `[Entity] No item container found for primary weapon ${item}`,
      );
    }
    // Particle system to be implemented later. For now leave as boilerplate.
    // Reference for future code https://playground.babylonjs.com/?BabylonToolkit#T3QKRV#32
    if (false && this.primaryMeshes.length > 0) {
      const { Vector3, GPUParticleSystem, Texture } = BABYLON;
      const particleSystem = new GPUParticleSystem(
        'vatParticle',
        { capacity: 250 },
        this.scene,
      );

      let textureBuffer =
        this.entityContainer?.manager?.texture?.getInternalTexture()
          ?._bufferView;
      if (!textureBuffer) {
        console.warn(
          '[Entity] No texture buffer found for VAT particle system',
        );
        return;
      }
      const isHalfFloat = textureBuffer instanceof Uint16Array;
      if (isHalfFloat) {
        textureBuffer = textureBuffer as Uint16Array;
      } else {
        textureBuffer = textureBuffer as Float32Array;
      }

      const { skeleton } = this.entityContainer;
      const numBones = skeleton?.bones.length ?? 0;
      const floatsPerBone = 16;
      const manager = this.entityContainer.manager!;
      const position = new Vector3(0, 0, 0);
      const boneQuaternion = new BABYLON.Quaternion();
      const floatsPerFrame = (numBones + 1) * floatsPerBone;
      const boneAnchors = skeleton?.bones
        .filter((b) => ['r_point'].includes(b.name))
        .map((b) => b.getIndex() * floatsPerBone) ?? [];

      const startOffsetLocal = new BABYLON.Vector3(-2.5, 0.4, 0);
      const qAlign = BABYLON.Quaternion.RotationAxis(
        new BABYLON.Vector3(0, 0, 1), // Z‑axis
        -Math.PI / 2, // –90 degrees
      );
      this.scene.onBeforeRenderObservable.add(() => {
        const fromFrame = this.animationBuffer.x;
        const toFrame = this.animationBuffer.y;
        const total = toFrame - fromFrame + 1;
        const t = manager.time * this.animationBuffer.w;
        const anchorIdx = (t % boneAnchors.length) | 0;
        const offsetBase = boneAnchors[anchorIdx];
        const off =
          (fromFrame + Math.floor(t % total)) * floatsPerFrame + offsetBase;

        const mat = BABYLON.Matrix.FromArray(textureBuffer as any, off);
        if (isHalfFloat) {
          for (let i = 0; i < 16; i++) {
            (mat.m as any)[i] = BABYLON.FromHalfFloat(textureBuffer[off + i]);
          }
        }
        mat.decompose(undefined, boneQuaternion, position);
        boneQuaternion.multiplyInPlace(qAlign);
        const rotationMatrix = mat.getRotationMatrix();
        const rotatedUp = BABYLON.Vector3.TransformNormal(startOffsetLocal, rotationMatrix);
        position.addInPlace(rotatedUp);

      });
      particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;

      particleSystem.particleTexture = new Texture(
        'https://eqrequiem.blob.core.windows.net/requiem/spelleffects/firec.webp',
        this.scene,
      );
      particleSystem.particleTexture.hasAlpha = true;
      particleSystem.particleTexture.getAlphaFromRGB = false;
      const particleMesh = new BABYLON.Mesh(
        'particleMesh',
        this.scene,
      );
      particleMesh.setParent(this.nodeContainer);
      particleMesh.isPickable = false;
      particleMesh.position = position;
      particleMesh.rotationQuaternion = boneQuaternion;
      particleSystem.emitter = particleMesh;

      particleSystem.isAnimationSheetEnabled = true;
      particleSystem.spriteCellChangeSpeed = 1; // Speed of animation
      particleSystem.startSpriteCellID = 0;
      particleSystem.endSpriteCellID = 15; // depends on your sheet layout
      particleSystem.spriteCellWidth = 64; // pixel width of a single sprite frame
      particleSystem.spriteCellHeight = 64; // pixel height of a single sprite frame
      particleSystem.spriteCellLoop = true; // optionally loop

      // maybe use this instead to spawn particles in a box
      const boxEmitter = particleSystem.createCylinderEmitter(
        0.2, 3, 1, 0.5, 
      );
      particleSystem.particleEmitterType = boxEmitter;
      particleSystem.minSize = 0.25;
      particleSystem.maxSize = 0.75;
      particleSystem.minLifeTime = 0.2;
      particleSystem.maxLifeTime = 1.5;
      particleSystem.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_ALL;
      particleSystem.emitRate = 55;
      particleSystem.maxAngularSpeed = Math.PI / 2;
      particleSystem.minEmitPower = 0.01;
      particleSystem.maxEmitPower = 0.1;
      particleSystem.updateSpeed = 0.02;

      particleSystem.start();
    }
  }

  private async createParticleEffects() {}

  private async updateSecondary() {
    let item = '';
    for (const mesh of this.secondaryMeshes) {
      mesh.dispose();
    }
    this.secondaryMeshes = [];
    let defaultPoint = 'shield_point';

    if (this.isPlayer) {
      const playerItem =
        Player.instance?.playerInventory.get(InventorySlot.Secondary, -1) ??
        Player.instance?.playerInventory.get(InventorySlot.Secondary, 0);
      if (playerItem && playerItem.itemtype !== 8) {
        defaultPoint = 'l_point';
      }
      item = playerItem?.idfile ?? '';
    } else {
      const primary = (this.spawn as Spawn).equipment.secondary;
      if (primary) {
        item = `IT${primary}`;
      }
    }
    if (item.length) {
      console.log('[Entity] Updating secondary weapon model', item);
      const itemContainer = await this.entityContainer?.getItem?.(
        item,
        defaultPoint === 'l_point',
      );
      if (itemContainer) {
        for (const mesh of itemContainer.meshes) {
          const itemInst = mesh.createInstance(`i_secondary_${item}`);

          itemInst.setParent(this.nodeContainer);
          itemInst.position = new BABYLON.Vector3(0, this.spawnScale * 0.5, 0); // this.spawnPosition;
          itemInst.rotation = this.rotation;
          itemInst.scaling.setAll(this.spawnScale);

          const totalCount = itemInst.getTotalVertices();
          const weaponMI: number[] = [];
          const weaponMW: number[] = [];
          const { skeleton } = this.entityContainer;
          const secondaryBone = skeleton?.bones.find(
            (b) => b.name === defaultPoint,
          );
          if (skeleton && secondaryBone) {
            itemInst.bakedVertexAnimationManager =
              this.entityContainer.manager!;
            itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
              this.animationBuffer;
            itemInst.scaling.setAll(this.spawnScale);
            for (let i = 0; i < totalCount; i++) {
              weaponMI.push(secondaryBone.getIndex(), 0, 0, 0);
              weaponMW.push(1, 0, 0, 0);
            }
            itemInst.setVerticesData(
              BABYLON.VertexBuffer.MatricesIndicesKind,
              weaponMI,
              false,
            );
            itemInst.setVerticesData(
              BABYLON.VertexBuffer.MatricesWeightsKind,
              weaponMW,
              false,
            );
            this.secondaryMeshes.push(itemInst);
          } else {
            itemInst.dispose();
          }
        }
      } else {
        console.warn(
          `[Entity] No item container found for secondary item ${item}`,
        );
      }
    }
  }

  public async updateModelTextures() {
    for (const mesh of this.bodyInstances) {
      const name = mesh.metadata.name;
      const headModel = this.headModel();
      const hasRobe = this.robeModel() !== '';
      const isRobeMesh = mesh.metadata.isRobe;
      const textureAtlas = mesh.metadata.atlasArray;
      const { texNum, variation } = mesh.metadata.gltf.extras as any;
      const piece = mesh.metadata.gltf.extras.piece.toLowerCase();

      if (hasRobe) {
        if (
          [
            MaterialPrefixes.Arms,
            MaterialPrefixes.Chest,
            MaterialPrefixes.Legs,
            MaterialPrefixes.Wrists,
          ].includes(piece) ||
          (MaterialPrefixes.Feet === piece && texNum === '01')
        ) {
          mesh.setEnabled(false);
        } else {
          mesh.setEnabled(true);
        }
      } else {
        mesh.setEnabled(true);
      }
      if (piece === MaterialPrefixes.Face) {
        mesh.setEnabled(variation === headModel);
      }

      if (isRobeMesh) {
        mesh.setEnabled(hasRobe);
      }

      if (!mesh.isEnabled()) {
        continue;
      }

      let idx = this.getTextureIndex(
        name,
        !this.isPlayer ? (this.spawn as Spawn).equipChest : 0,
        textureAtlas,
      );
      let idxSet = false;
      let r: number = 1,
        g: number = 1,
        b: number = 1;

      let associatedItem: NullableItemInstance = null;

      const matchingInventorySlot = InventorySlotTextures[piece as string];
      if (this.isPlayer) {
        associatedItem =
          Player.instance?.playerInventory.get(matchingInventorySlot, -1) ??
          Player.instance?.playerInventory.get(matchingInventorySlot, 0) ??
          null;
      }
      if (
        matchingInventorySlot &&
        this.isHumanoid &&
        !(this.spawn as Spawn).isNpc
      ) {
        if (this.isPlayer) {
          // TODO handle partial texture mapping with face/helmet later
          if (associatedItem) {
            const color = associatedItem.color;
            r = ((color >> 16) & 0xff) / 255;
            g = ((color >> 8) & 0xff) / 255;
            b = (color & 0xff) / 255;
            if (r === 0) {
              r = 1;
            }
            if (g === 0) {
              g = 1;
            }
            if (b === 0) {
              b = 1;
            }
            idx = this.getTextureIndex(
              name,
              associatedItem.material,
              textureAtlas,
            );
            idxSet = true;
          }
        } else {
          // TODO get equipmentTint mapped out
          // const spawn = this.spawn as Spawn;
          // idx = this.getTextureIndex(name, spawn.equipment[TextureProfileMap[piece]] ?? 0);
        }
      }

      // Drive texture from equipment for PC humanoids
      if (piece === MaterialPrefixes.Face && this.isHumanoid) {
        idx = this.getTextureIndex(name, this.spawn.face, textureAtlas);
        r = 1;
        g = 1;
        b = 1;
        idxSet = true;
      }
      if (mesh.metadata.isRobe) {
        if (this.isPlayer) {
          associatedItem =
            Player.instance?.playerInventory.get(InventorySlot.Chest, -1) ??
            Player.instance?.playerInventory.get(InventorySlot.Chest, 0) ??
            null;
        }
      } else if (mesh.metadata.isHelm) {
        if (this.isPlayer) {
          associatedItem =
            Player.instance?.playerInventory.get(InventorySlot.Head, -1) ??
            Player.instance?.playerInventory.get(InventorySlot.Head, 0) ??
            null;
        }
      }

      if (this.textureBuffers[name] && !idxSet) {
        const defaultMaterial = isRobeMesh ? 10 : 0;
        let material = defaultMaterial;
        if (!this.isPlayer) {
          const spawn = this.spawn as Spawn;
          material =
            hasRobe && !isRobeMesh
              ? 0
              : spawn.isNpc
                ? spawn.equipChest
                : spawn.equipment.chest;
        } else {
          material = associatedItem?.material ?? defaultMaterial;
        }

        idx = this.getTextureIndex(name, material, textureAtlas);
      } else if (!idxSet) {
        idx = this.getTextureIndex(name, 1, textureAtlas);
      }
      this.textureBuffers[name].x = idx;
      this.textureBuffers[name].y = r;
      this.textureBuffers[name].z = g;
      this.textureBuffers[name].w = b;
      // console.log('RGB', r, g, b);
    }
    await this.updatePrimary();
    await this.updateSecondary();
    this.setRotation(this.lastYaw + 0.0001); // Reapply last yaw to ensure correct orientation after texture update
  }

  private setupPhysics() {
    // Get BB for physics capsule height
    const boundingBox = this.entityContainer.boundingBox;
    const yOffset = 0; // this.entityContainer.boundingBox?.yOffset ?? 0;
    let capsuleHeight = this.raceDataEntry?.height ?? 6;
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
      capsuleHeight = extents.y * 2 * this.spawnScale;

      // For entities other than self create a pick instance here.. maybe later just
      // disable pick when in first person, it gets annoying.
      if (!this.isPlayer) {
        const pickInst = Entity.pickerPrototype.createInstance(
          `pickBox_${this.spawn.name}_${this.spawn.spawnId ?? ''}`,
        );
        this.pickInst = pickInst;
        pickInst.setParent(this);
        pickInst.position = this.spawnPosition;
        pickInst.scaling.set(extents.x * 4, extents.y * 4, extents.z * 4);
        pickInst.isPickable = true;
        pickInst.showBoundingBox = false;
        pickInst.metadata = { entity: this };
      }
    } else {
      console.warn(
        `[Entity] No bounding box found for ${this.entityContainer.model}, using default capsule height`,
      );
    }

    // Setup physics body with capsule shape
    const capsuleRadius = 2.0 * this.spawnScale; // Adjust radius based on scale
    const pointA = new BABYLON.Vector3(0, capsuleHeight / 2 - capsuleRadius, 0);
    const pointB = new BABYLON.Vector3(
      0,
      -(capsuleHeight / 2 - capsuleRadius),
      0,
    );
    pointA.y += yOffset / 2;
    pointB.y += yOffset / 2;
    // Slight adjustment to ensure the capsule is centered
    // pointA.y -= 0.5;
    // pointB.y -= 0.3;

    if (modelYOffset[this.entityContainer.model]) {
      pointB.y += modelYOffset[this.entityContainer.model];
    }

    this.capsuleShape = new BABYLON.PhysicsShapeCapsule(
      pointA,
      pointB,
      capsuleRadius,
      this.scene,
    );
    this.capsuleShape.material.friction = 1.0;
    this.capsuleShape.material.restitution = 0;
    this.nodeContainer = new BABYLON.TransformNode(
      `${this.spawn.name}`,
      this.scene,
    );
    if (!this.isPlayer) {
      this.nodeContainer.parent = this;
    }
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
    this.physicsBody.setLinearDamping(0.9);

    this.physicsBody.shape = this.capsuleShape;
    this.physicsBody.setMassProperties({
      mass   : 5,
      inertia: new BABYLON.Vector3(0, 0, 0),
    });
  }

  public async instantiateNameplate(textLines: string[]): Promise<void> {
    Nameplate.removeNameplate(this.nameplate!);
    this.nameplateNode?.dispose();
    this.nameplate = await Nameplate.createNameplate(this.scene);
    if (!this.nameplate) {
      console.warn(
        `[Entity] Failed to create nameplate for ${textLines.join(', ')}`,
      );
      return;
    }
    for (const line of textLines) {
      this.nameplate.addParagraph(line);
    }
    this.nameplate.color = BABYLON.Color4.FromHexString('#00ffff');
    this.nameplateNode = new BABYLON.TransformNode(
      `nameplate_${this.spawn.name}`,
      this.scene,
    );
    if (this.bodyInstances.length === 0) {
      return;
    }
    this.nameplateNode.parent = this.bodyInstances[0].parent;
    this.nameplateNode.position = new BABYLON.Vector3(
      0,
      4 + textLines.length * 1.5 * this.spawnScale,
      0,
    );
    this.nameplate.parent = this.nameplateNode;
  }

  public checkBelowAndReposition() {
    const plugin = this.physicsPlugin;
    const position = this.spawnPosition;
    if (!position) {
      return;
    }
    const rayOrigin = new BABYLON.Vector3(position.x, position.y, position.z);
    const result = new BABYLON.PhysicsRaycastResult();

    // Downward raycast
    const downEnd = rayOrigin.add(new BABYLON.Vector3(0, -1000, 0)); // 10 units down
    plugin.raycast(rayOrigin, downEnd, result);

    if (!result.hasHit) {
      // No static body below, cast upward
      const upEnd = rayOrigin.add(new BABYLON.Vector3(0, 10000, 0)); // 100 units up
      result.reset();
      plugin.raycast(rayOrigin, upEnd, result);

      if (
        result.hasHit &&
        result.body?.motionType === BABYLON.PhysicsMotionType.STATIC
      ) {
        // Reposition player just below the hit point
        const hitPoint = result.hitPoint;
        const newPosition = new BABYLON.Vector3(
          hitPoint.x,
          hitPoint.y - 0.1,
          hitPoint.z,
        );
        this.setPosition(newPosition.x, newPosition.y + 5, newPosition.z);
        if (this.isPlayer) {
          console.log(
            `[Entity] Repositioned to ${newPosition.toString()} due to no ground below`,
          );
        }
      } else if (this.isPlayer) {
        console.log(
          '[Entity] Repositioned to Safe Point due to no ground below',
        );
        this.setPosition(5, 5, 5);
      }
    }
  }

  public currentAnimation: string | null = null;

  public setFace(variation: number): void {
    if (!this.isHumanoid) {
      return;
    }
    this.spawn.face = variation;
    this.updateModelTextures();
  }

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
    }
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
  private getTextureIndex(
    originalName: string,
    variation: number = 0,
    textureAtlas: string[] = this.entityContainer.textureAtlas,
  ): number {
    let retValue = this.getTextureIndexImpl(
      originalName,
      variation,
      textureAtlas,
    );
    const maxVariation = 10;
    while (retValue < 0 && variation < maxVariation) {
      retValue = this.getTextureIndexImpl(
        originalName,
        variation++,
        textureAtlas,
      );
    }
    return retValue;
  }
  private getTextureIndexImpl(
    originalName: string,
    variation: number,
    textureAtlas: string[] = this.entityContainer.textureAtlas,
  ): number {
    originalName = originalName.toLowerCase();
    let model, texIdx;
    const match = originalName.match(charFileRegex);
    if (!match) {
      const clkMatch = originalName.match(clkRegex);
      if (clkMatch) {
        model = 'clk';
        texIdx = clkMatch[2];
        return (
          textureAtlas.indexOf(
            `${model}${(variation - 6).toString().padStart(2, '0')}${texIdx}`,
          ) ?? -1
        );
      }
      if (originalName.startsWith('helm')) {
        return textureAtlas.indexOf(originalName) ?? -1;
      }
      return -1;
    }
    model = match[1];
    texIdx = match[4];
    const piece = match[2];

    if (piece === MaterialPrefixes.Face && this.isHumanoid) {
      // For humanoids, use the face texture variation
      variation = this.spawn.face;
      const pieceNumber = texIdx[1];
      const baseIndex = textureAtlas.indexOf(
        `${model}${piece}00${variation}${pieceNumber}`,
      );
      if (baseIndex !== undefined && baseIndex >= 0) {
        return baseIndex; // Adjust index based on variation
      }
      return (
        textureAtlas.indexOf(
          `${model}${piece}00${+variation + 1}${pieceNumber}`,
        ) ?? -1
      );
    }
    let retValue =
      textureAtlas.indexOf(
        `${model}${piece}${variation.toString().padStart(2, '0')}${texIdx}`,
      ) ?? -1;
    while (retValue < 0 && +texIdx > 0) {
      retValue =
        textureAtlas.indexOf(
          `${model}${piece}${(variation++).toString().padStart(2, '0')}${(texIdx--).toString().padStart(2, '0')}`,
        ) ?? -1;
    }
    return retValue;
  }
}
