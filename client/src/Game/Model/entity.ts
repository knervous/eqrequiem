import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import type { EntityContainer, EntityCache } from "./entity-cache";
import { charFileRegex, MaterialPrefixes } from "@game/Constants/constants";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { Nameplate } from "./nameplate";
import type { TextRenderer } from "@babylonjs/addons";
import { sleep } from "@game/Constants/util";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import type GameManager from "@game/Manager/game-manager";
import { createTargetRingMaterial } from "./entity-select-ring";

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
  public hidden: boolean = true;

  private static pickerPrototype: BJS.Mesh;
  private static targetRing: BJS.Mesh;
  private static currentlySelected: Entity | null = null;
  private static targetTexture: BJS.ProceduralTexture | null = null;

  private textureBuffers: Record<string, BJS.Vector2> = {};

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
  private capsuleShape: BJS.PhysicsShapeCapsule | null = null;
  private pickInst: BJS.InstancedMesh | null = null;
  private isPlayer = false;

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
  ) {
    super(`entity_${spawn.name}`, scene);
    this.isPlayer = spawn instanceof PlayerProfile;
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

    if (!Entity.pickerPrototype) {
      // create a unit cube at the world origin
      Entity.pickerPrototype = BABYLON.MeshBuilder.CreateBox(
        "pickerProto",
        { size: 1 },
        this.scene,
      );
      // one totally transparent material
      const pickMat = new BABYLON.StandardMaterial("pickerMat", this.scene);
      pickMat.alpha = 0;
      Entity.pickerPrototype.material = pickMat;
      Entity.pickerPrototype.isPickable = false;
      Entity.pickerPrototype.setEnabled(false);
    }

    if (!Entity.targetRing) {
      const targetRing = BABYLON.MeshBuilder.CreateGround(
        "selectionRing",
        {
          width: 10,
          height: 10,
        },
        this.scene,
      );
      const [mat, texture] = createTargetRingMaterial(this.scene);
      Entity.targetTexture = texture;
      targetRing.material = mat;
      targetRing.isPickable = false;
      targetRing.setEnabled(false);
      Entity.targetRing = targetRing;
    }
  }

  public get isHumanoid(): boolean {
    return this.spawn.race >= 1 && this.spawn.race <= 12;
  }

  public meshes(): BJS.InstancedMesh[] {
    return this.bodyInstances.concat(this.secondaryInstances);
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
      let offset = -3;
      if (result.hasHit) {
        const hitPoint = result.hitPoint;
        offset = hitPoint.y - rayOrigin.y; // Calculate offset based on hit point
      }

      if (color) {
        Entity.targetTexture?.setColor4("color", color);
      }
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
    // Dispose pick instance
    if (this.pickInst) {
      this.pickInst.dispose();
      this.pickInst = null;
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
    if (this.pickInst) {
      this.pickInst.dispose();
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

    this.setupPhysics();
    // Create body instances and assign physics body
    this.instantiateMeshes();
    if ("equipChest" in this.spawn) {
      const variation = this.spawn.helm.toString().padStart(2, "0");
      await this.instantiateSecondaryMesh(
        variation,
        this.isHumanoid ? this.spawn.face : this.spawn.equipChest,
      );
    }
    await this.instantiateNameplate([this.spawn.name.replaceAll("_", " ")]);

    this.updateModelTextures();

    // this.debugWireframe?.createWireframe();
    this.isInitializing = false;
    this.hidden = false;
  }

  private instantiateMeshes() {
    let meshIdx = 0;
    for (const mesh of this.entityContainer.meshes) {
      mesh.isPickable = false;
      const bodyInst = mesh.createInstance(
        `instance_${this.spawn.name}_${this.spawn.spawnId ?? ""}_${meshIdx++}`,
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
      bodyInst.physicsBody = this.physicsBody;
      bodyInst.metadata = {
        name: mesh.name,
      };
      const vec = this.textureBuffers[mesh.name] || new BABYLON.Vector2(0, 0);
      this.textureBuffers[mesh.name] = vec;
      bodyInst.instancedBuffers.textureAttributes = vec;
      this.bodyInstances.push(bodyInst);
    }
  }

  public updateModelTextures() {
    for (const mesh of this.bodyInstances.concat(this.secondaryInstances)) {
      const name = mesh.metadata.name;
      let idx = this.getTextureIndex(
        name,
        !this.isPlayer ? (this.spawn as Spawn).equipChest : 1,
      );
      const nameMatch = name.match(charFileRegex);
      if (nameMatch) {
        const [, , piece, ,] = nameMatch;
        // Drive texture from equipment for PC humanoids
        if (piece === MaterialPrefixes.Face && this.isHumanoid) {
          idx = this.getTextureIndex(name, this.spawn.face);
        }
      }
      if (this.textureBuffers[name]) {
        this.textureBuffers[name].x = idx;
      }
    }
  }

  private setupPhysics() {
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

      // For entities other than self create a pick instance here.. maybe later just
      // disable pick when in first person, it gets annoying.
      if (!this.isPlayer) {
        const pickInst = Entity.pickerPrototype.createInstance(
          `pickBox_${this.spawn.name}_${this.spawn.spawnId ?? ""}`,
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
    this.nameplateNode.position = new BABYLON.Vector3(
      0,
      4 + textLines.length * 1.5 * this.spawnScale,
      0,
    );
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
      mesh.isPickable = false;

      const secondaryInstance = mesh.createInstance(mesh.name);
      secondaryInstance.isPickable = false;

      secondaryInstance.setParent(this.nodeContainer);
      secondaryInstance.position = new BABYLON.Vector3(
        0,
        this.spawnScale * (modelOffset[this.entityContainer.model] ?? 0.5),
        0,
      );
      secondaryInstance.metadata = {
        name: mesh.name,
      };
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
