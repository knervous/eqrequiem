import * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import {
  humanoidNpcRaces,
  charFileRegex,
  clkRegex,
  isPlayerRace,
  MaterialPrefixes,
} from "@game/Constants/constants";
import { RaceEntry } from "@game/Constants/race-data";
import type GameManager from "@game/Manager/game-manager";
import { PlayerProfile, Spawn } from "@game/Net/messages";
import {
  InventorySlot,
  InventorySlotTextures,
  NullableItemInstance,
} from "@game/Player/player-constants";
import EntityCache, { type EntityContainer } from "./entity-cache";
import { createTargetRingMaterial } from "./entity-select-ring";
import type { RequiemEntityActor } from "./shado-entity-pool";

const modelYOffset = {
  gnn: 0.5,
};

type InstanceContainer = {
  mesh: BJS.Mesh;
  thinInstanceIndex: number;
  actor: RequiemEntityActor;
};

export class Entity extends BABYLON.TransformNode {
  public spawn: Spawn | PlayerProfile;
  public entityContainer: EntityContainer;
  public entityCache: typeof EntityCache;
  public spawnPosition: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  public spawnScale: number = 1.5;
  public hidden: boolean = true;
  public raceDataEntry: RaceEntry | null = null;

  public get cleanName(): string {
    return this.spawn.name.replaceAll("_", " ");
  }

  private static targetRing: BJS.Mesh;
  private static currentlySelected: Entity | null = null;
  private static targetTexture: BJS.ProceduralTexture | null = null;

  public static disposeStatics() {
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
    if (!Entity.targetRing) {
      const targetRing = BABYLON.MeshBuilder.CreateTorus(
        "selectionRing",
        {
          diameter: 5, // outer diameter = 2 × your desired radius (5 × 2)
          thickness: 4, // tube thickness — make this as big as you like to “fill” the hole
          tessellation: 64, // smoothness
          updatable: true, // if you ever want to tweak it at runtime
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

  private gameManager: GameManager;
  private scene: BJS.Scene;
  private animationBuffer: BJS.Vector4 = new BABYLON.Vector4(0, 1, 0, 60);
  public meshInstance: InstanceContainer | null = null;
  public nameplateLines: string[] = [];
  private capsuleShape: BJS.PhysicsShapeCapsule | null = null;
  private pickInst: BJS.InstancedMesh | null = null;
  private isPlayer = false;
  private disposed = false;
  private appearanceGeneration = 0;
  private visibilityOverride: boolean | null = null;
  private readonly itemResolver?: (slot: number) => NullableItemInstance;
  public readonly ready: Promise<void>;

  public get lifecycleDisposed(): boolean {
    return this.disposed;
  }

  public get isPlayerRace() {
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
    entityCache: typeof EntityCache,
    parent: BJS.Node,
    raceEntry: RaceEntry,
    itemResolver?: (slot: number) => NullableItemInstance,
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
    this.itemResolver = itemResolver;
    const height = 6;
    let spawnScale = typeof spawn.size === "number" ? spawn.size : 6;
    if (spawnScale === -1) {
      spawnScale = 6;
    }
    const finalScale = spawnScale / height;

    this.spawnScale = finalScale; // Use spawn scale if available, otherwise default to 1.5
    this.scaling.setAll(this.spawnScale);
    this.spawnPosition = new BABYLON.Vector3(spawn.x, spawn.y, spawn.z);
    this.playAnimation(AnimationDefinitions.Idle1);
    Entity.instantiateStatics(scene);
    this.ready = this.setup();
    // this.debugWireframe?.createWireframe();
  }

  private async setup() {
    this.setupPhysics();
    // Spawn headings from EQ content use the canonical 0..512 turn scale.
    this.setRotation((Number(this.spawn.heading ?? 0) * Math.PI) / 256);
    // Create body instances and assign physics body
    this.instantiateMeshes();
    await this.instantiateNameplate([this.spawn.name.replaceAll("_", " ")]);
    if (this.disposed) return;
    await this.updateModelTextures();
    if (this.disposed) return;
    this.checkBelowAndReposition();
  }

  public get isHumanoid(): boolean {
    return (
      (this.spawn.race >= 1 && this.spawn.race <= 12) ||
      humanoidNpcRaces.has(this.spawn.race)
    );
  }

  /** Playable races select facial variants by the profile face field. Classic
   * city NPC models are humanoid for armor, but encode heads as materials. */
  private get usesPlayerFaceTextures(): boolean {
    return this.spawn.race >= 1 && this.spawn.race <= 12;
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
    this.spawnPosition.set(x, y, z);
    if (Entity.currentlySelected === this && Entity.targetRing) {
      Entity.targetRing.position.x = x;
      Entity.targetRing.position.z = z;
    }
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
    if (this.meshInstance) {
      this.entityContainer.shadoPool.setSelected(
        this.meshInstance.actor,
        selected,
      );
    }
    const targetRing = Entity.targetRing!;
    if (selected) {
      // deselect any previous entity
      if (Entity.currentlySelected && Entity.currentlySelected !== this) {
        Entity.currentlySelected.setSelected(false);
      }
      Entity.currentlySelected = this;

      // Shado actors keep their world transform in the shared actor buffer; the
      // Babylon TransformNode intentionally remains at the origin. Keep the one
      // shared ring in world space so it follows the same source of truth.
      targetRing.setParent(null);
      const result = new BABYLON.PhysicsRaycastResult();
      const rayOrigin = this.spawnPosition.add(
        new BABYLON.Vector3(0, 5 * this.spawnScale, 0),
      );
      const downEnd = rayOrigin.add(new BABYLON.Vector3(0, -1000, 0));
      this.physicsPlugin.raycast(rayOrigin, downEnd, result);
      const groundY = result.hasHit ? result.hitPoint.y : this.spawnPosition.y;

      if (color) {
        Entity.targetTexture?.setColor4(
          "color",
          new BABYLON.Color4(color.r, color.g, color.b, 0.5),
        );
      }
      targetRing.scaling.setAll(this.spawnScale);
      targetRing.position.set(this.spawnPosition.x, groundY + 0.1, this.spawnPosition.z);
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
    if (this.disposed) return;
    this.disposed = true;
    this.appearanceGeneration++;
    EntityCache.unregister(this);
    if (this.meshInstance) {
      this.entityContainer.removeThinInstance(
        this.meshInstance.thinInstanceIndex,
      );
    }
    this.meshInstance = null;

    this.nameplateLines = [];

    for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
      if (!mesh.isDisposed()) mesh.dispose();
    }
    this.primaryMeshes = [];
    this.secondaryMeshes = [];
    if (this.animationTimeout && typeof this.animationTimeout !== "boolean") {
      clearTimeout(this.animationTimeout);
    }
    this.animationTimeout = false;

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

    super.dispose();
  }

  public toggleVisibility(visible: boolean): void {
    if (this.disposed) return;
    this.visibilityOverride = visible ? null : false;
    this.hidden = !visible;
    if (this.meshInstance) {
      this.entityContainer.shadoPool.setVisible(
        this.meshInstance.actor,
        visible,
      );
    }
    for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
      mesh.setEnabled(visible);
    }
  }

  public async hide(): Promise<void> {
    if (this.disposed) return;
    this.visibilityOverride = false;
    this.hidden = true;
    if (this.meshInstance) {
      this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, false);
    }
    for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
      mesh.setEnabled(false);
    }
  }

  public async initialize() {
    if (this.disposed) return;
    this.visibilityOverride = null;
    this.hidden = false;
    if (this.meshInstance) {
      this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, true);
    }
    for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
      mesh.setEnabled(true);
    }
  }

  public applyReducedVisibility(): void {
    if (this.disposed || !this.meshInstance) return;
    if (this.visibilityOverride === false) {
      this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, false);
    }
    const visible = Boolean(this.meshInstance.actor.visibleFlag);
    this.hidden = !visible;
    for (const mesh of this.primaryMeshes) mesh.setEnabled(visible);
    for (const mesh of this.secondaryMeshes) mesh.setEnabled(visible);
  }

  private updateMaterialBuffers() {
    if (this.meshInstance) {
      this.entityContainer.shadoPool.setAnimation(
        this.meshInstance.actor,
        this.animationBuffer,
      );
    }
  }

  private instantiateMeshes() {
    const worldMat = BABYLON.Matrix.Scaling(
      this.spawnScale,
      this.spawnScale,
      this.spawnScale,
    )
      .multiply(BABYLON.Matrix.RotationYawPitchRoll(0, 0, 0))
      .multiply(
        BABYLON.Matrix.Translation(
          this.spawnPosition.x,
          this.spawnPosition.y,
          this.spawnPosition.z,
        ),
      );
    const { mesh, addThinInstance } = this.entityContainer;
    const entityId = Number((this.spawn as Spawn).spawnId ?? 0);
    const thinInstanceIndex = addThinInstance(worldMat, entityId);
    this.meshInstance = {
      mesh: mesh as BJS.Mesh,
      thinInstanceIndex,
      actor: this.entityContainer.shadoPool.shado.children[thinInstanceIndex],
    };
    this.entityContainer.shadoPool.setTransform(
      this.meshInstance.actor,
      this.spawnPosition,
      this.rotationQuaternion ?? BABYLON.Quaternion.Identity(),
      this.spawnScale,
    );
    this.entityContainer.shadoPool.setAnimation(
      this.meshInstance.actor,
      this.animationBuffer,
    );
  }

  private isNpc(): boolean {
    return !!(this.spawn as Spawn).isNpc;
  }

  private isPc(): boolean {
    return !this.isPlayer && !this.isNpc();
  }
  private headModel(): string {
    let variation = "";
    if (this.isNpc()) {
      variation = (this.spawn as any as Spawn).helm.toString().padStart(2, "0");
    } else if (this.isPc()) {
      variation =
        (this.spawn as any as Spawn)?.equipment?.head
          ?.toString()
          ?.padStart(2, "0") ?? "00";
    } else if (this.isPlayer) {
      const headItem = this.equippedItem(InventorySlot.Head);
      if (headItem) {
        variation = headItem.material.toString().padStart(2, "0");
      } else {
        variation = "00"; // Default to 00 if no head item found
      }
    }
    return variation;
  }

  private robeModel(): string {
    let variation = "";
    const spawnChest = (this.spawn as Spawn).equipment?.chest;
    if ("equipChest" in this.spawn && this.spawn.equipChest >= 10) {
      variation = this.spawn.equipChest.toString().padStart(2, "0");
    } else if (spawnChest !== undefined && spawnChest >= 10) {
      variation = spawnChest.toString().padStart(2, "0");
    } else if (this.isPlayer) {
      const playerChestItem = this.equippedItem(InventorySlot.Chest);
      if (playerChestItem?.material && playerChestItem.material >= 10) {
        variation = playerChestItem.material.toString().padStart(2, "0");
      }
    }
    return variation;
  }
  private primaryMeshes: BJS.InstancedMesh[] = [];
  private secondaryMeshes: BJS.InstancedMesh[] = [];
  private appearanceUpdate = Promise.resolve();

  private async updatePrimary() {
    const generation = this.appearanceGeneration;
    let item = "";
    for (const mesh of this.primaryMeshes) {
      console.log("Disposing primary mesh", mesh.name);
      mesh.dispose();
    }
    this.primaryMeshes = [];
    if (this.isPlayer) {
      item = this.equippedItem(InventorySlot.Primary)?.idfile ?? "";
    } else {
      const primary = (this.spawn as Spawn).equipment?.primary ?? 0;
      if (primary) {
        item = `IT${primary}`;
      }
    }
    if (item.length === 0) {
      return;
    }
    console.log("[Entity] Updating primary weapon model", item);
    const itemContainer = await this.entityContainer?.getItem?.(item);
    if (this.disposed || generation !== this.appearanceGeneration) return;
    if (itemContainer) {
      for (const mesh of itemContainer.meshes) {
        const itemInst = mesh.createInstance(`i_primary_${item}`);
        itemInst.rotation = this.rotation;
        itemInst.setParent(this);
        itemInst.position = new BABYLON.Vector3(0, this.spawnScale * 0.5, 0); // this.spawnPosition;
        itemInst.scaling.setAll(this.spawnScale);
        const totalCount = itemInst.getTotalVertices();
        const weaponMI: number[] = [];
        const weaponMW: number[] = [];
        const primaryBoneIndex =
          this.entityContainer.attachmentBoneIndices.r_point;
        if (primaryBoneIndex !== undefined) {
          itemInst.bakedVertexAnimationManager = this.entityContainer.manager!;
          itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            this.animationBuffer;
          itemInst.scaling.setAll(this.spawnScale);
          itemInst.setEnabled(!this.hidden && this.isEnabled());
          for (let i = 0; i < totalCount; i++) {
            weaponMI.push(primaryBoneIndex, 0, 0, 0);
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
        "vatParticle",
        { capacity: 250 },
        this.scene,
      );

      let textureBuffer =
        this.entityContainer?.manager?.texture?.getInternalTexture()
          ?._bufferView;
      if (!textureBuffer) {
        console.warn(
          "[Entity] No texture buffer found for VAT particle system",
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
      const boneAnchors =
        skeleton?.bones
          .filter((b) => ["r_point"].includes(b.name))
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
        const anchorIdx = t % boneAnchors.length | 0;
        const offsetBase = boneAnchors[anchorIdx];
        const off =
          (fromFrame + Math.floor(t % total)) * floatsPerFrame + offsetBase;

        const mat = BABYLON.Matrix.FromArray(textureBuffer as any, off);
        if (isHalfFloat) {
          for (let i = 0; i < 16; i++) {
            (mat.m as any)[i] = BABYLON.FromHalfFloat(textureBuffer![off + i]);
          }
        }
        mat.decompose(undefined, boneQuaternion, position);
        boneQuaternion.multiplyInPlace(qAlign);
        const rotationMatrix = mat.getRotationMatrix();
        const rotatedUp = BABYLON.Vector3.TransformNormal(
          startOffsetLocal,
          rotationMatrix,
        );
        position.addInPlace(rotatedUp);
      });
      particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;

      particleSystem.particleTexture = new Texture(
        "https://eqrequiem.blob.core.windows.net/requiem/spelleffects/firec.webp",
        this.scene,
      );
      particleSystem.particleTexture!.hasAlpha = true;
      particleSystem.particleTexture!.getAlphaFromRGB = false;
      const particleMesh = new BABYLON.Mesh("particleMesh", this.scene);
      particleMesh.setParent(this);
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
      const boxEmitter = particleSystem.createCylinderEmitter(0.2, 3, 1, 0.5);
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
    const generation = this.appearanceGeneration;
    let item = "";
    for (const mesh of this.secondaryMeshes) {
      mesh.dispose();
    }
    this.secondaryMeshes = [];
    let defaultPoint = "shield_point";

    if (this.isPlayer) {
      const playerItem = this.equippedItem(InventorySlot.Secondary);
      if (playerItem && playerItem.itemtype !== 8) {
        defaultPoint = "l_point";
      }
      item = playerItem?.idfile ?? "";
    } else {
      const secondary = (this.spawn as Spawn).equipment?.secondary ?? 0;
      if (secondary) {
        item = `IT${secondary}`;
      }
    }
    if (item.length) {
      console.log("[Entity] Updating secondary weapon model", item);
      const itemContainer = await this.entityContainer?.getItem?.(
        item,
        defaultPoint === "l_point",
      );
      if (this.disposed || generation !== this.appearanceGeneration) return;
      if (itemContainer) {
        for (const mesh of itemContainer.meshes) {
          const itemInst = mesh.createInstance(`i_secondary_${item}`);

          itemInst.setParent(this);
          itemInst.position = new BABYLON.Vector3(0, this.spawnScale * 0.5, 0); // this.spawnPosition;
          itemInst.rotation = this.rotation;
          itemInst.scaling.setAll(this.spawnScale);

          const totalCount = itemInst.getTotalVertices();
          const weaponMI: number[] = [];
          const weaponMW: number[] = [];
          const secondaryBoneIndex =
            this.entityContainer.attachmentBoneIndices[defaultPoint];
          if (secondaryBoneIndex !== undefined) {
            itemInst.bakedVertexAnimationManager =
              this.entityContainer.manager!;
            itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
              this.animationBuffer;
            itemInst.scaling.setAll(this.spawnScale);
            itemInst.setEnabled(!this.hidden && this.isEnabled());
            for (let i = 0; i < totalCount; i++) {
              weaponMI.push(secondaryBoneIndex, 0, 0, 0);
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

  public updateModelTextures(): Promise<void> {
    this.appearanceUpdate = this.appearanceUpdate
      .catch((error) => {
        console.warn("[Entity] Previous appearance update failed", error);
      })
      .then(() => this.updateModelTexturesNow());
    return this.appearanceUpdate;
  }

  private async updateModelTexturesNow() {
    if (this.disposed || !this.meshInstance) {
      console.warn("[Entity] No mesh instance found for texture update");
      return;
    }
    const { thinInstanceIndex } = this.meshInstance;
    const headModel = this.headModel();
    const hasRobe = this.robeModel() !== "";
    for (const [
      submeshIndex,
      range,
    ] of this.entityContainer.submeshRanges.entries()) {
      const {
        name,
        isRobe,
        isHelm,
        atlasArray,
        metadata: { texNum, variation, piece },
      } = range;

      let idx = this.getTextureIndex(
        name,
        !this.isPlayer ? (this.spawn as Spawn).equipChest : 0,
        atlasArray,
      );
      let idxSet = false;
      let r: number = 1,
        g: number = 1,
        b: number = 1;

      if (hasRobe) {
        if (
          [
            MaterialPrefixes.Arms,
            MaterialPrefixes.Chest,
            MaterialPrefixes.Legs,
            MaterialPrefixes.Wrists,
          ].includes(piece) ||
          (MaterialPrefixes.Feet === piece && texNum === "01")
        ) {
          idx = -1;
          idxSet = true;
        }
      }
      if (piece === MaterialPrefixes.Face) {
        if (variation !== headModel) {
          idx = -1;
          idxSet = true;
        }
      }

      if (isRobe && !hasRobe) {
        idx = -1;
        idxSet = true;
      }

      let associatedItem: NullableItemInstance = null;

      const matchingInventorySlot = InventorySlotTextures[piece as string];
      if (this.isPlayer && matchingInventorySlot !== undefined) {
        associatedItem = this.equippedItem(matchingInventorySlot);
      }
      if (
        matchingInventorySlot &&
        !idxSet &&
        this.isHumanoid &&
        !(this.spawn as Spawn).isNpc
      ) {
        if (this.isPlayer) {
          // TODO handle partial texture mapping with face/helmet later
          if (associatedItem) {
            const color = associatedItem.color >>> 0;
            const rgb = color & 0xffffff;
            if (rgb !== 0) {
              r = ((rgb >>> 16) & 0xff) / 255;
              g = ((rgb >>> 8) & 0xff) / 255;
              b = (rgb & 0xff) / 255;
            }
            idx = this.getTextureIndex(
              name,
              associatedItem.material,
              atlasArray,
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
      if (
        !idxSet &&
        piece === MaterialPrefixes.Face &&
        this.usesPlayerFaceTextures
      ) {
        idx = this.getTextureIndex(name, this.spawn.face, atlasArray);
        r = 1;
        g = 1;
        b = 1;
        idxSet = true;
      }
      if (isRobe) {
        if (this.isPlayer) {
          associatedItem = this.equippedItem(InventorySlot.Chest);
        }
      } else if (isHelm) {
        if (this.isPlayer) {
          associatedItem = this.equippedItem(InventorySlot.Head);
        }
      }

      if (!idxSet) {
        const defaultMaterial = isRobe ? 10 : 0;
        let material = defaultMaterial;
        if (!this.isPlayer) {
          const spawn = this.spawn as Spawn;
          material =
            hasRobe && !isRobe
              ? 0
              : spawn.isNpc
                ? spawn.equipChest
                : (spawn.equipment?.chest ?? spawn.equipChest ?? 0);
        } else {
          material = associatedItem?.material ?? defaultMaterial;
        }

        idx = this.getTextureIndex(name, material, atlasArray);
      } else if (!idxSet) {
        idx = this.getTextureIndex(name, 1, atlasArray);
      }

      const x = submeshIndex;
      const y = thinInstanceIndex;

      this.entityContainer.shadoPool.setAppearance(
        y,
        x,
        this.entityContainer.submeshRanges.size,
        idx,
        r,
        g,
        b,
      );
    }
    this.updateMaterialBuffers();
    this.setRotation(this.lastYaw + 0.0001); // Reapply last yaw to ensure correct orientation after texture update
    await Promise.all([this.updatePrimary(), this.updateSecondary()]);
  }

  private equippedItem(slot: InventorySlot): NullableItemInstance {
    if (this.itemResolver) return this.itemResolver(slot);
    const items = (this.spawn as PlayerProfile).inventoryItems ?? [];
    return (
      items.find((item) => item.slot === slot && item.bagSlot === -1) ??
      items.find((item) => item.slot === slot && item.bagSlot === 0) ??
      null
    );
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
    // this.nodeContainer = new BABYLON.TransformNode(
    //   `${this.spawn.name}`,
    //   this.scene,
    // );
    // if (!this.isPlayer) {
    //   this.nodeContainer.parent = this;
    // } else {
    //   this.nodeContainer.parent = this.parent;
    // }
    this.position = this.spawnPosition;
    this.physicsBody = new BABYLON.PhysicsBody(
      this, // Use the TransformNode as the root
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
      mass: 5,
      inertia: new BABYLON.Vector3(0, 0, 0),
    });
  }
  public async instantiateNameplate(textLines: string[]): Promise<void> {
    if (this.disposed) return;
    this.nameplateLines = [...textLines];
  }
  private lastPosition: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private lastRotationQuaternion: BJS.Quaternion = new BABYLON.Quaternion(
    0,
    0,
    0,
    1,
  );
  public syncMatrix(): void {
    if (!this.spawnPosition || !this.rotationQuaternion || !this.meshInstance) {
      return;
    }
    if (
      this.lastPosition.equals(this.spawnPosition) &&
      this.lastRotationQuaternion.equals(this.rotationQuaternion)
    ) {
      return;
    }
    this.lastPosition.copyFrom(this.spawnPosition);
    this.lastRotationQuaternion.copyFrom(this.rotationQuaternion!);
    this.entityContainer.shadoPool.setTransform(
      this.meshInstance.actor,
      this.spawnPosition,
      this.rotationQuaternion,
      this.spawnScale,
    );
    // The render transform is now read directly from the Shado arena by the
    // entity shader. No Babylon matrix-buffer copy is required here.
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
          "[Entity] Repositioned to Safe Point due to no ground below",
        );
        this.setPosition(5, 5, 5);
      }
    }
  }

  public setFace(variation: number): void {
    if (!this.usesPlayerFaceTextures) {
      return;
    }
    this.spawn.face = variation;
    this.updateModelTextures();
  }

  public currentAnimation: string | null = null;
  public animationTimeout: NodeJS.Timeout | boolean = false;
  public queuedAnimation: string | null = null;

  private computeOffset(
    fromFrame: number,
    toFrame: number,
    time: number,
    fps: number = 60,
  ): number {
    const totalFrames = toFrame - fromFrame + 1;
    const t = (time * fps) / totalFrames;
    const frame = Math.floor((t - Math.floor(t)) * totalFrames);
    return totalFrames - frame;
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
    if (this.animationTimeout) {
      this.queuedAnimation = name;
      return;
    }
    this.currentAnimation = name;
    const offset = this.computeOffset(match.from, match.to, manager.time, 60);
    this.animationBuffer.set(match.from, match.to, offset, 60);
    for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
      mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
        this.animationBuffer;
    }
    this.updateMaterialBuffers();

    if (playThrough) {
      this.animationTimeout = setTimeout(
        () => {
          this.animationTimeout = false;
          this.queuedAnimation = null;
          this.playAnimation(this.queuedAnimation ?? "p02");
        },
        (match.to - match.from) * (1000 / 60),
      ); // Convert frames to milliseconds
    }
  }
  private getTextureIndex(
    originalName: string,
    variation: number = 0,
    textureAtlas: string[],
  ): number {
    const requested = this.getTextureIndexImpl(
      originalName,
      variation,
      textureAtlas,
    );
    if (requested >= 0 || variation === 0) return requested;
    // Missing armor variants fall back to that model piece's base material.
    // Walking upward through unrelated material ids caused guards to sample a
    // valid but incorrect atlas layer, which presented as texture bleeding.
    return this.getTextureIndexImpl(originalName, 0, textureAtlas);
  }
  private getTextureIndexImpl(
    originalName: string,
    variation: number,
    textureAtlas: string[],
  ): number {
    if (!originalName || originalName.length === 0) {
      console.warn(
        `[Entity] getTextureIndex called with empty originalName for ${this.spawn.name}`,
      );
      return 0; // debug really
    }
    originalName = originalName.toLowerCase();
    let model, texIdx;
    const match = originalName.match(charFileRegex);
    if (!match) {
      const clkMatch = originalName.match(clkRegex);
      if (clkMatch) {
        model = "clk";
        texIdx = clkMatch[2];
        return (
          textureAtlas.indexOf(
            `${model}${(variation - 6).toString().padStart(2, "0")}${texIdx}`,
          ) ?? -1
        );
      }
      if (originalName.startsWith("helm")) {
        return textureAtlas.indexOf(originalName) ?? -1;
      }
      return -1;
    }
    model = match[1];
    texIdx = match[4];
    const piece = match[2];

    if (piece === MaterialPrefixes.Face && this.usesPlayerFaceTextures) {
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
    const material = variation.toString().padStart(2, "0");
    let textureNumber = Number(texIdx);
    while (textureNumber >= 0) {
      const retValue = textureAtlas.indexOf(
        `${model}${piece}${material}${textureNumber.toString().padStart(2, "0")}`,
      );
      if (retValue >= 0) return retValue;
      textureNumber--;
    }
    return -1;
  }
}
