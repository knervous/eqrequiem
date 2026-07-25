import BABYLON from "@bjs";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { humanoidNpcRaces, charFileRegex, clkRegex, isPlayerRace, MaterialPrefixes, } from "@game/Constants/constants";
import { InventorySlot, InventorySlotTextures, } from "@game/Player/player-constants";
import EntityCache from "./entity-cache";
import { createTargetRingMaterial } from "./entity-select-ring";
import { heldItemLocalYOffset } from "./held-item-attachment";
const modelYOffset = {
    gnn: 0.5,
};
const humanAnimationAliases = {
    pos: "Idle",
    p01: "Idle",
    o01: "Idle_Look",
    l01: "Walk",
    l02: "Run",
    l03: "Jump_Start",
    l04: "Jump_Land",
    l05: "Jump_Loop",
    l06: "Crouch_Walk",
    l09: "Swim",
    p02: "Sit_Idle",
    p03: "Turn_Right",
    p04: "Strafe_Right",
    p05: "Pickup",
    p06: "Swim",
    c01: "Kick",
    c02: "Punch_Right",
    c03: "Block",
    c04: "Punch_Left",
    c05: "Punch_Right",
    c06: "Punch_Left",
    c07: "Block",
    c08: "Punch_Right",
    c11: "Kick",
    d01: "Hit_Front",
    d02: "Knockdown",
    d05: "Death",
    s01: "Cheer",
    s03: "Wave",
    s06: "Yes",
    s07: "No",
    s20: "Kneel",
    s22: "Point",
    s28: "Bow",
};
export class Entity extends BABYLON.TransformNode {
    spawn;
    entityContainer;
    entityCache;
    spawnPosition = new BABYLON.Vector3(0, 0, 0);
    spawnScale = 1.5;
    hidden = true;
    raceDataEntry = null;
    get cleanName() {
        return this.spawn.name.replaceAll("_", " ");
    }
    static targetRing;
    static currentlySelected = null;
    static targetTexture = null;
    static disposeStatics() {
        if (Entity.targetRing) {
            Entity.targetRing.dispose(false, true);
            Entity.targetRing = null;
        }
        if (Entity.targetTexture) {
            Entity.targetTexture.dispose();
            Entity.targetTexture = null;
        }
        Entity.currentlySelected = null;
    }
    static instantiateStatics(scene) {
        if (!Entity.targetRing) {
            const targetRing = BABYLON.MeshBuilder.CreateTorus("selectionRing", {
                diameter: 5, // outer diameter = 2 × your desired radius (5 × 2)
                thickness: 4, // tube thickness — make this as big as you like to “fill” the hole
                tessellation: 64, // smoothness
                updatable: true, // if you ever want to tweak it at runtime
            }, scene);
            const positions = targetRing.getVerticesData(BABYLON.VertexBuffer.PositionKind);
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
    gameManager;
    scene;
    animationBuffer = new BABYLON.Vector4(0, 1, 0, 60);
    meshInstance = null;
    nameplateLines = [];
    capsuleShape = null;
    pickInst = null;
    isPlayer = false;
    disposed = false;
    appearanceGeneration = 0;
    visibilityOverride = null;
    itemResolver;
    ready;
    get lifecycleDisposed() {
        return this.disposed;
    }
    get isPlayerRace() {
        return isPlayerRace(this.entityContainer.model);
    }
    get physicsPlugin() {
        return this.gameManager
            .scene.getPhysicsEngine()
            .getPhysicsPlugin();
    }
    // private debugWireframe: DebugWireframe | null = null;
    constructor(gameManager, spawn, scene, entityContainer, entityCache, parent, raceEntry, itemResolver) {
        super(`entity_${spawn.name}`, scene);
        this.isPlayer = !!(spawn?.inventoryItems ?? false);
        this.raceDataEntry = raceEntry;
        this.gameManager = gameManager;
        this.spawn = spawn;
        this.scene = scene;
        this.setParent(parent);
        this.entityContainer = entityContainer;
        this.entityCache = entityCache;
        this.itemResolver = itemResolver;
        const height = raceEntry.height ?? 6;
        let spawnScale = typeof spawn.size === "number" ? spawn.size : height;
        if (spawnScale === -1) {
            spawnScale = height;
        }
        const finalScale = spawnScale / height;
        this.spawnScale = finalScale; // Use spawn scale if available, otherwise default to 1.5
        // Body rendering, attachments, and physics each consume spawnScale
        // explicitly. Scaling this shared parent as well would apply it twice to
        // attached weapons and to physics implementations that honor node scale.
        this.scaling.setAll(1);
        this.spawnPosition = new BABYLON.Vector3(spawn.x, spawn.y, spawn.z);
        this.playAnimation(AnimationDefinitions.Idle1);
        Entity.instantiateStatics(scene);
        this.ready = this.setup();
        // this.debugWireframe?.createWireframe();
    }
    async setup() {
        this.setupPhysics();
        // Spawn headings from EQ content use the canonical 0..512 turn scale.
        this.setRotation((Number(this.spawn.heading ?? 0) * Math.PI) / 256);
        // Create body instances and assign physics body
        this.instantiateMeshes();
        await this.instantiateNameplate([this.spawn.name.replaceAll("_", " ")]);
        if (this.disposed)
            return;
        await this.updateModelTextures();
        if (this.disposed)
            return;
        this.checkBelowAndReposition();
    }
    get isHumanoid() {
        return ((this.spawn.race >= 1 && this.spawn.race <= 12) ||
            humanoidNpcRaces.has(this.spawn.race));
    }
    /** Playable races select facial variants by the profile face field. Classic
     * city NPC models are humanoid for armor, but encode heads as materials. */
    get usesPlayerFaceTextures() {
        return this.spawn.race >= 1 && this.spawn.race <= 12;
    }
    getHeading() {
        const physicsBody = this.physicsBody;
        if (!physicsBody) {
            return 0;
        }
        const [, outQuat] = this.physicsPlugin._hknp.HP_Body_GetOrientation(physicsBody._pluginData.hpBodyId);
        const eulers = BABYLON.Quaternion.FromArray(outQuat).toEulerAngles();
        return eulers.y;
    }
    setVelocity(x, y, z) {
        const physicsBody = this.physicsBody;
        if (!physicsBody) {
            return;
        }
        physicsBody.setLinearVelocity(new BABYLON.Vector3(x, y, z));
    }
    lastYaw = 0;
    setRotation(yaw) {
        this.lastYaw = yaw;
        const physicsBody = this.physicsBody;
        if (!physicsBody) {
            return;
        }
        const normalized = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const q = BABYLON.Quaternion.RotationYawPitchRoll(normalized, 0, 0);
        this.rotationQuaternion = q;
        const plugin = this.gameManager
            .scene.getPhysicsEngine()
            .getPhysicsPlugin();
        plugin._hknp.HP_Body_SetOrientation(physicsBody._pluginData.hpBodyId, q.asArray());
    }
    setPosition(x, y, z) {
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
            .scene.getPhysicsEngine()
            .getPhysicsPlugin();
        plugin._hknp.HP_Body_SetPosition(physicsBody._pluginData.hpBodyId, [
            x,
            y,
            z,
        ]);
    }
    getClosestSpawns(n = 1, filter = () => true) {
        const entities = this.gameManager.ZoneManager?.EntityPool?.entities ?? {};
        const myPos = this.spawnPosition;
        // Create an array of entities with their distances
        return Object.values(entities)
            .filter((entity) => !entity.hidden && entity !== this)
            .map((entity) => ({
            entity,
            dist: Math.sqrt(BABYLON.Vector3.DistanceSquared(myPos, entity.spawnPosition)),
        }))
            .filter((entity) => filter(entity.entity))
            .sort((a, b) => a.dist - b.dist) // Sort by distance
            .slice(0, n) // Take the 5 closest
            .map((entry) => entry.entity);
    }
    setSelected(selected, color) {
        if (this.meshInstance) {
            this.entityContainer.shadoPool.setSelected(this.meshInstance.actor, selected);
        }
        const targetRing = Entity.targetRing;
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
            const rayOrigin = this.spawnPosition.add(new BABYLON.Vector3(0, 5 * this.spawnScale, 0));
            const downEnd = rayOrigin.add(new BABYLON.Vector3(0, -1000, 0));
            this.physicsPlugin.raycast(rayOrigin, downEnd, result);
            const groundY = result.hasHit ? result.hitPoint.y : this.spawnPosition.y;
            if (color) {
                Entity.targetTexture?.setColor4("color", new BABYLON.Color4(color.r, color.g, color.b, 0.5));
            }
            targetRing.scaling.setAll(this.spawnScale);
            targetRing.position.set(this.spawnPosition.x, groundY + 0.1, this.spawnPosition.z);
            targetRing.setEnabled(true);
        }
        else {
            // only hide if *this* entity is the one that owns it
            if (Entity.currentlySelected === this) {
                targetRing.setEnabled(false);
                Entity.currentlySelected = null;
            }
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.appearanceGeneration++;
        EntityCache.unregister(this);
        if (this.meshInstance) {
            this.entityContainer.removeThinInstance(this.meshInstance.thinInstanceIndex);
        }
        this.meshInstance = null;
        this.nameplateLines = [];
        for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
            if (!mesh.isDisposed())
                mesh.dispose();
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
    toggleVisibility(visible) {
        if (this.disposed)
            return;
        this.visibilityOverride = visible ? null : false;
        this.hidden = !visible;
        if (this.meshInstance) {
            this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, visible);
        }
        for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
            mesh.setEnabled(visible);
        }
    }
    async hide() {
        if (this.disposed)
            return;
        this.visibilityOverride = false;
        this.hidden = true;
        if (this.meshInstance) {
            this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, false);
        }
        for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
            mesh.setEnabled(false);
        }
    }
    async initialize() {
        if (this.disposed)
            return;
        this.visibilityOverride = null;
        this.hidden = false;
        if (this.meshInstance) {
            this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, true);
        }
        for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
            mesh.setEnabled(true);
        }
    }
    applyReducedVisibility() {
        if (this.disposed || !this.meshInstance)
            return;
        if (this.visibilityOverride === false) {
            this.entityContainer.shadoPool.setVisible(this.meshInstance.actor, false);
        }
        const visible = Boolean(this.meshInstance.actor.visibleFlag);
        this.hidden = !visible;
        for (const mesh of this.primaryMeshes)
            mesh.setEnabled(visible);
        for (const mesh of this.secondaryMeshes)
            mesh.setEnabled(visible);
    }
    updateMaterialBuffers() {
        if (this.meshInstance) {
            this.entityContainer.shadoPool.setAnimation(this.meshInstance.actor, this.animationBuffer);
        }
    }
    instantiateMeshes() {
        const worldMat = BABYLON.Matrix.Scaling(this.spawnScale, this.spawnScale, this.spawnScale)
            .multiply(BABYLON.Matrix.RotationYawPitchRoll(0, 0, 0))
            .multiply(BABYLON.Matrix.Translation(this.spawnPosition.x, this.spawnPosition.y, this.spawnPosition.z));
        const { mesh, addThinInstance } = this.entityContainer;
        const entityId = Number(this.spawn.spawnId ?? 0);
        const thinInstanceIndex = addThinInstance(worldMat, entityId);
        this.meshInstance = {
            mesh: mesh,
            thinInstanceIndex,
            actor: this.entityContainer.shadoPool.shado.children[thinInstanceIndex],
        };
        this.entityContainer.shadoPool.setTransform(this.meshInstance.actor, this.spawnPosition, this.rotationQuaternion ?? BABYLON.Quaternion.Identity(), this.spawnScale);
        this.entityContainer.shadoPool.setAnimation(this.meshInstance.actor, this.animationBuffer);
    }
    isNpc() {
        return !!this.spawn.isNpc;
    }
    isPc() {
        return !this.isPlayer && !this.isNpc();
    }
    headModel() {
        let variation = "";
        if (this.isNpc()) {
            variation = this.spawn.helm.toString().padStart(2, "0");
        }
        else if (this.isPc()) {
            variation =
                this.spawn?.equipment?.head
                    ?.toString()
                    ?.padStart(2, "0") ?? "00";
        }
        else if (this.isPlayer) {
            const headItem = this.equippedItem(InventorySlot.Head);
            if (headItem) {
                variation = headItem.material.toString().padStart(2, "0");
            }
            else {
                variation = "00"; // Default to 00 if no head item found
            }
        }
        return variation;
    }
    robeModel() {
        let variation = "";
        const spawnChest = this.spawn.equipment?.chest;
        if ("equipChest" in this.spawn && this.spawn.equipChest >= 10) {
            variation = this.spawn.equipChest.toString().padStart(2, "0");
        }
        else if (spawnChest !== undefined && spawnChest >= 10) {
            variation = spawnChest.toString().padStart(2, "0");
        }
        else if (this.isPlayer) {
            const playerChestItem = this.equippedItem(InventorySlot.Chest);
            if (playerChestItem?.material && playerChestItem.material >= 10) {
                variation = playerChestItem.material.toString().padStart(2, "0");
            }
        }
        return variation;
    }
    primaryMeshes = [];
    secondaryMeshes = [];
    appearanceUpdate = Promise.resolve();
    async updatePrimary() {
        const generation = this.appearanceGeneration;
        let item = "";
        for (const mesh of this.primaryMeshes) {
            console.log("Disposing primary mesh", mesh.name);
            mesh.dispose();
        }
        this.primaryMeshes = [];
        if (this.isPlayer) {
            item = this.equippedItem(InventorySlot.Primary)?.idfile ?? "";
        }
        else {
            const primary = this.spawn.equipment?.primary ?? 0;
            if (primary) {
                item = `IT${primary}`;
            }
        }
        if (item.length === 0) {
            return;
        }
        console.log("[Entity] Updating primary weapon model", item);
        const primaryBoneIndex = this.entityContainer?.attachmentBoneIndices.r_point;
        if (primaryBoneIndex === undefined) {
            return;
        }
        const itemContainer = await this.entityContainer?.getItem?.(item, true, primaryBoneIndex, "r_point");
        if (this.disposed || generation !== this.appearanceGeneration)
            return;
        if (itemContainer) {
            for (const mesh of itemContainer.meshes) {
                const itemInst = mesh.createInstance(`i_primary_${item}`);
                itemInst.rotation = this.rotation;
                itemInst.setParent(this);
                itemInst.position = new BABYLON.Vector3(0, heldItemLocalYOffset(Boolean(this.entityContainer.attachmentGeometryTransforms.r_point), this.spawnScale), 0);
                itemInst.scaling.setAll(this.spawnScale);
                itemInst.bakedVertexAnimationManager = this.entityContainer.manager;
                itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
                    this.animationBuffer;
                itemInst.setEnabled(!this.hidden && this.isEnabled());
                this.primaryMeshes.push(itemInst);
            }
        }
        else {
            console.warn(`[Entity] No item container found for primary weapon ${item}`);
        }
        // Particle system to be implemented later. For now leave as boilerplate.
        // Reference for future code https://playground.babylonjs.com/?BabylonToolkit#T3QKRV#32
        if (false && this.primaryMeshes.length > 0) {
            const { Vector3, GPUParticleSystem, Texture } = BABYLON;
            const particleSystem = new GPUParticleSystem("vatParticle", { capacity: 250 }, this.scene);
            let textureBuffer = this.entityContainer?.manager?.texture?.getInternalTexture()
                ?._bufferView;
            if (!textureBuffer) {
                console.warn("[Entity] No texture buffer found for VAT particle system");
                return;
            }
            const isHalfFloat = textureBuffer instanceof Uint16Array;
            if (isHalfFloat) {
                textureBuffer = textureBuffer;
            }
            else {
                textureBuffer = textureBuffer;
            }
            const { skeleton } = this.entityContainer;
            const numBones = skeleton?.bones.length ?? 0;
            const floatsPerBone = 16;
            const manager = this.entityContainer.manager;
            const position = new Vector3(0, 0, 0);
            const boneQuaternion = new BABYLON.Quaternion();
            const floatsPerFrame = (numBones + 1) * floatsPerBone;
            const boneAnchors = skeleton?.bones
                .filter((b) => ["r_point"].includes(b.name))
                .map((b) => b.getIndex() * floatsPerBone) ?? [];
            const startOffsetLocal = new BABYLON.Vector3(-2.5, 0.4, 0);
            const qAlign = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), // Z‑axis
            -Math.PI / 2);
            this.scene.onBeforeRenderObservable.add(() => {
                const fromFrame = this.animationBuffer.x;
                const toFrame = this.animationBuffer.y;
                const total = toFrame - fromFrame + 1;
                const t = manager.time * this.animationBuffer.w;
                const anchorIdx = t % boneAnchors.length | 0;
                const offsetBase = boneAnchors[anchorIdx];
                const off = (fromFrame + Math.floor(t % total)) * floatsPerFrame + offsetBase;
                const mat = BABYLON.Matrix.FromArray(textureBuffer, off);
                if (isHalfFloat) {
                    for (let i = 0; i < 16; i++) {
                        mat.m[i] = BABYLON.FromHalfFloat(textureBuffer[off + i]);
                    }
                }
                mat.decompose(undefined, boneQuaternion, position);
                boneQuaternion.multiplyInPlace(qAlign);
                const rotationMatrix = mat.getRotationMatrix();
                const rotatedUp = BABYLON.Vector3.TransformNormal(startOffsetLocal, rotationMatrix);
                position.addInPlace(rotatedUp);
            });
            particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            particleSystem.particleTexture = new Texture("https://eqrequiem.blob.core.windows.net/requiem/spelleffects/firec.webp", this.scene);
            particleSystem.particleTexture.hasAlpha = true;
            particleSystem.particleTexture.getAlphaFromRGB = false;
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
    async createParticleEffects() { }
    async updateSecondary() {
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
        }
        else {
            const secondary = this.spawn.equipment?.secondary ?? 0;
            if (secondary) {
                item = `IT${secondary}`;
            }
        }
        if (item.length) {
            console.log("[Entity] Updating secondary weapon model", item);
            const secondaryBoneIndex = this.entityContainer?.attachmentBoneIndices[defaultPoint];
            if (secondaryBoneIndex === undefined) {
                return;
            }
            const itemContainer = await this.entityContainer?.getItem?.(item, defaultPoint === "l_point", secondaryBoneIndex, defaultPoint);
            if (this.disposed || generation !== this.appearanceGeneration)
                return;
            if (itemContainer) {
                for (const mesh of itemContainer.meshes) {
                    const itemInst = mesh.createInstance(`i_secondary_${item}`);
                    itemInst.setParent(this);
                    itemInst.position = new BABYLON.Vector3(0, heldItemLocalYOffset(Boolean(this.entityContainer.attachmentGeometryTransforms[defaultPoint]), this.spawnScale), 0);
                    itemInst.rotation = this.rotation;
                    itemInst.scaling.setAll(this.spawnScale);
                    itemInst.bakedVertexAnimationManager =
                        this.entityContainer.manager;
                    itemInst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
                        this.animationBuffer;
                    itemInst.setEnabled(!this.hidden && this.isEnabled());
                    this.secondaryMeshes.push(itemInst);
                }
            }
            else {
                console.warn(`[Entity] No item container found for secondary item ${item}`);
            }
        }
    }
    updateModelTextures() {
        this.appearanceUpdate = this.appearanceUpdate
            .catch((error) => {
            console.warn("[Entity] Previous appearance update failed", error);
        })
            .then(() => this.updateModelTexturesNow());
        return this.appearanceUpdate;
    }
    async updateModelTexturesNow() {
        if (this.disposed || !this.meshInstance) {
            console.warn("[Entity] No mesh instance found for texture update");
            return;
        }
        const { thinInstanceIndex } = this.meshInstance;
        const headModel = this.headModel();
        const hasRobe = this.robeModel() !== "";
        for (const [submeshIndex, range,] of this.entityContainer.submeshRanges.entries()) {
            const { name, isRobe, isHelm, atlasArray, metadata: { texNum, variation, piece }, } = range;
            let idx = this.getTextureIndex(name, !this.isPlayer ? this.spawn.equipChest : 0, atlasArray);
            let idxSet = false;
            let r = 1, g = 1, b = 1;
            if (hasRobe) {
                if ([
                    MaterialPrefixes.Arms,
                    MaterialPrefixes.Chest,
                    MaterialPrefixes.Legs,
                    MaterialPrefixes.Wrists,
                ].includes(piece) ||
                    (MaterialPrefixes.Feet === piece && texNum === "01")) {
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
            let associatedItem = null;
            const matchingInventorySlot = InventorySlotTextures[piece];
            if (this.isPlayer && matchingInventorySlot !== undefined) {
                associatedItem = this.equippedItem(matchingInventorySlot);
            }
            if (matchingInventorySlot &&
                !idxSet &&
                this.isHumanoid &&
                !this.spawn.isNpc) {
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
                        idx = this.getTextureIndex(name, associatedItem.material, atlasArray);
                        idxSet = true;
                    }
                }
                else {
                    // TODO get equipmentTint mapped out
                    // const spawn = this.spawn as Spawn;
                    // idx = this.getTextureIndex(name, spawn.equipment[TextureProfileMap[piece]] ?? 0);
                }
            }
            // Drive texture from equipment for PC humanoids
            if (!idxSet &&
                piece === MaterialPrefixes.Face &&
                this.usesPlayerFaceTextures) {
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
            }
            else if (isHelm) {
                if (this.isPlayer) {
                    associatedItem = this.equippedItem(InventorySlot.Head);
                }
            }
            if (!idxSet) {
                const defaultMaterial = isRobe ? 10 : 0;
                let material = defaultMaterial;
                if (!this.isPlayer) {
                    const spawn = this.spawn;
                    material =
                        hasRobe && !isRobe
                            ? 0
                            : spawn.isNpc
                                ? spawn.equipChest
                                : (spawn.equipment?.chest ?? spawn.equipChest ?? 0);
                }
                else {
                    material = associatedItem?.material ?? defaultMaterial;
                }
                idx = this.getTextureIndex(name, material, atlasArray);
            }
            else if (!idxSet) {
                idx = this.getTextureIndex(name, 1, atlasArray);
            }
            const x = submeshIndex;
            const y = thinInstanceIndex;
            this.entityContainer.shadoPool.setAppearance(y, x, this.entityContainer.submeshRanges.size, idx, r, g, b);
        }
        this.updateMaterialBuffers();
        this.setRotation(this.lastYaw + 0.0001); // Reapply last yaw to ensure correct orientation after texture update
        await Promise.all([this.updatePrimary(), this.updateSecondary()]);
    }
    equippedItem(slot) {
        if (this.itemResolver)
            return this.itemResolver(slot);
        const items = this.spawn.inventoryItems ?? [];
        return (items.find((item) => item.slot === slot && item.bagSlot === -1) ??
            items.find((item) => item.slot === slot && item.bagSlot === 0) ??
            null);
    }
    setupPhysics() {
        // Get BB for physics capsule height
        const boundingBox = this.entityContainer.boundingBox;
        const yOffset = 0; // this.entityContainer.boundingBox?.yOffset ?? 0;
        let capsuleHeight = this.raceDataEntry?.height ?? 6;
        if (boundingBox) {
            const min = new BABYLON.Vector3(boundingBox.min[0], boundingBox.min[1], boundingBox.min[2]);
            const max = new BABYLON.Vector3(boundingBox.max[0], boundingBox.max[1], boundingBox.max[2]);
            const extents = max.subtract(min).scale(0.5);
            capsuleHeight = extents.y * 2 * this.spawnScale;
        }
        else {
            console.warn(`[Entity] No bounding box found for ${this.entityContainer.model}, using default capsule height`);
        }
        // Setup physics body with capsule shape
        const capsuleRadius = 2.0 * this.spawnScale; // Adjust radius based on scale
        const pointA = new BABYLON.Vector3(0, capsuleHeight / 2 - capsuleRadius, 0);
        const pointB = new BABYLON.Vector3(0, -(capsuleHeight / 2 - capsuleRadius), 0);
        pointA.y += yOffset / 2;
        pointB.y += yOffset / 2;
        // Slight adjustment to ensure the capsule is centered
        // pointA.y -= 0.5;
        // pointB.y -= 0.3;
        if (modelYOffset[this.entityContainer.model]) {
            pointB.y += modelYOffset[this.entityContainer.model];
        }
        this.capsuleShape = new BABYLON.PhysicsShapeCapsule(pointA, pointB, capsuleRadius, this.scene);
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
        this.physicsBody = new BABYLON.PhysicsBody(this, // Use the TransformNode as the root
        BABYLON.PhysicsMotionType.DYNAMIC, false, this.scene);
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
    async instantiateNameplate(textLines) {
        if (this.disposed)
            return;
        this.nameplateLines = [...textLines];
    }
    lastPosition = new BABYLON.Vector3(0, 0, 0);
    lastRotationQuaternion = new BABYLON.Quaternion(0, 0, 0, 1);
    syncMatrix() {
        if (!this.spawnPosition || !this.rotationQuaternion || !this.meshInstance) {
            return;
        }
        if (this.lastPosition.equals(this.spawnPosition) &&
            this.lastRotationQuaternion.equals(this.rotationQuaternion)) {
            return;
        }
        this.lastPosition.copyFrom(this.spawnPosition);
        this.lastRotationQuaternion.copyFrom(this.rotationQuaternion);
        this.entityContainer.shadoPool.setTransform(this.meshInstance.actor, this.spawnPosition, this.rotationQuaternion, this.spawnScale);
        // The render transform is now read directly from the Shado arena by the
        // entity shader. No Babylon matrix-buffer copy is required here.
    }
    checkBelowAndReposition() {
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
            if (result.hasHit &&
                result.body?.motionType === BABYLON.PhysicsMotionType.STATIC) {
                // Reposition player just below the hit point
                const hitPoint = result.hitPoint;
                const newPosition = new BABYLON.Vector3(hitPoint.x, hitPoint.y - 0.1, hitPoint.z);
                this.setPosition(newPosition.x, newPosition.y + 5, newPosition.z);
                if (this.isPlayer) {
                    console.log(`[Entity] Repositioned to ${newPosition.toString()} due to no ground below`);
                }
            }
            else if (this.isPlayer) {
                console.log("[Entity] Repositioned to Safe Point due to no ground below");
                this.setPosition(5, 5, 5);
            }
        }
    }
    setFace(variation) {
        if (!this.usesPlayerFaceTextures) {
            return;
        }
        this.spawn.face = variation;
        this.updateModelTextures();
    }
    currentAnimation = null;
    animationTimeout = false;
    queuedAnimation = null;
    computeOffset(fromFrame, toFrame, time, fps = 60) {
        const totalFrames = toFrame - fromFrame + 1;
        const t = (time * fps) / totalFrames;
        const frame = Math.floor((t - Math.floor(t)) * totalFrames);
        return totalFrames - frame;
    }
    playAnimation(name, playThrough = false) {
        const resolvedName = this.entityContainer.model === "hum" || this.entityContainer.model === "huf"
            ? (humanAnimationAliases[name] ?? name)
            : name;
        const match = this.entityContainer.animations.find((animation) => animation.name === resolvedName);
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
            console.warn(`[Entity] No animation manager found for ${this.entityContainer.model}`);
            return;
        }
        if (this.currentAnimation === resolvedName && !playThrough) {
            return;
        }
        if (this.animationTimeout) {
            this.queuedAnimation = name;
            return;
        }
        this.currentAnimation = resolvedName;
        const fps = match.fps ?? 60;
        const offset = this.computeOffset(match.from, match.to, manager.time, fps);
        this.animationBuffer.set(match.from, match.to, offset, fps);
        for (const mesh of [...this.primaryMeshes, ...this.secondaryMeshes]) {
            mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
                this.animationBuffer;
        }
        this.updateMaterialBuffers();
        if (playThrough) {
            this.animationTimeout = setTimeout(() => {
                const queuedAnimation = this.queuedAnimation;
                this.animationTimeout = false;
                this.queuedAnimation = null;
                this.playAnimation(queuedAnimation ?? AnimationDefinitions.Idle1);
            }, (match.to - match.from) * (1000 / fps)); // Convert frames to milliseconds
        }
    }
    getTextureIndex(originalName, variation = 0, textureAtlas) {
        const requested = this.getTextureIndexImpl(originalName, variation, textureAtlas);
        if (requested >= 0 || variation === 0)
            return requested;
        // Missing armor variants fall back to that model piece's base material.
        // Walking upward through unrelated material ids caused guards to sample a
        // valid but incorrect atlas layer, which presented as texture bleeding.
        return this.getTextureIndexImpl(originalName, 0, textureAtlas);
    }
    getTextureIndexImpl(originalName, variation, textureAtlas) {
        if (!originalName || originalName.length === 0) {
            console.warn(`[Entity] getTextureIndex called with empty originalName for ${this.spawn.name}`);
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
                return (textureAtlas.indexOf(`${model}${(variation - 6).toString().padStart(2, "0")}${texIdx}`) ?? -1);
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
            const baseIndex = textureAtlas.indexOf(`${model}${piece}00${variation}${pieceNumber}`);
            if (baseIndex !== undefined && baseIndex >= 0) {
                return baseIndex; // Adjust index based on variation
            }
            return (textureAtlas.indexOf(`${model}${piece}00${+variation + 1}${pieceNumber}`) ?? -1);
        }
        const material = variation.toString().padStart(2, "0");
        let textureNumber = Number(texIdx);
        while (textureNumber >= 0) {
            const retValue = textureAtlas.indexOf(`${model}${piece}${material}${textureNumber.toString().padStart(2, "0")}`);
            if (retValue >= 0)
                return retValue;
            textureNumber--;
        }
        return -1;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW50aXR5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUMzQixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRSxPQUFPLEVBQ0wsZ0JBQWdCLEVBQ2hCLGFBQWEsRUFDYixRQUFRLEVBQ1IsWUFBWSxFQUNaLGdCQUFnQixHQUNqQixNQUFNLDJCQUEyQixDQUFDO0FBSW5DLE9BQU8sRUFDTCxhQUFhLEVBQ2IscUJBQXFCLEdBRXRCLE1BQU0sK0JBQStCLENBQUM7QUFDdkMsT0FBTyxXQUFxQyxNQUFNLGdCQUFnQixDQUFDO0FBQ25FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRzlELE1BQU0sWUFBWSxHQUFHO0lBQ25CLEdBQUcsRUFBRSxHQUFHO0NBQ1QsQ0FBQztBQUVGLE1BQU0scUJBQXFCLEdBQXFDO0lBQzlELEdBQUcsRUFBRSxNQUFNO0lBQ1gsR0FBRyxFQUFFLE1BQU07SUFDWCxHQUFHLEVBQUUsV0FBVztJQUNoQixHQUFHLEVBQUUsTUFBTTtJQUNYLEdBQUcsRUFBRSxLQUFLO0lBQ1YsR0FBRyxFQUFFLFlBQVk7SUFDakIsR0FBRyxFQUFFLFdBQVc7SUFDaEIsR0FBRyxFQUFFLFdBQVc7SUFDaEIsR0FBRyxFQUFFLGFBQWE7SUFDbEIsR0FBRyxFQUFFLE1BQU07SUFDWCxHQUFHLEVBQUUsVUFBVTtJQUNmLEdBQUcsRUFBRSxZQUFZO0lBQ2pCLEdBQUcsRUFBRSxjQUFjO0lBQ25CLEdBQUcsRUFBRSxRQUFRO0lBQ2IsR0FBRyxFQUFFLE1BQU07SUFDWCxHQUFHLEVBQUUsTUFBTTtJQUNYLEdBQUcsRUFBRSxhQUFhO0lBQ2xCLEdBQUcsRUFBRSxPQUFPO0lBQ1osR0FBRyxFQUFFLFlB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bXBvcnQgdHlwZSAqIGFzIEJKUyBmcm9tIFwiQGJhYnlsb25qcy9jb3JlXCI7XG5pbXBvcnQgQkFCWUxPTiBmcm9tIFwiQGJqc1wiO1xuaW1wb3J0IHsgQW5pbWF0aW9uRGVmaW5pdGlvbnMgfSBmcm9tIFwiQGdhbWUvQW5pbWF0aW9uL2FuaW1hdGlvbi1jb25zdGFudHNcIjtcbmltcG9ydCB7XG4gIGh1bWFub2lkTnBjUmFjZXMsXG4gIGNoYXJGaWxlUmVnZXgsXG4gIGNsa1JlZ2V4LFxuICBpc1BsYXllclJhY2UsXG4gIE1hdGVyaWFsUHJlZml4ZXMsXG59IGZyb20gXCJAZ2FtZS9Db25zdGFudHMvY29uc3RhbnRzXCI7XG5pbXBvcnQgeyBSYWNlRW50cnkgfSBmcm9tIFwiQGdhbWUvQ29uc3RhbnRzL3JhY2UtZGF0YVwiO1xuaW1wb3J0IHR5cGUgR2FtZU1hbmFnZXIgZnJvbSBcIkBnYW1lL01hbmFnZXIvZ2FtZS1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBQbGF5ZXJQcm9maWxlLCBTcGF3biB9IGZyb20gXCJAZ2FtZS9OZXQvbWVzc2FnZXNcIjtcbmltcG9ydCB7XG4gIEludmVudG9yeVNsb3QsXG4gIEludmVudG9yeVNsb3RUZXh0dXJlcyxcbiAgTnVsbGFibGVJdGVtSW5zdGFuY2UsXG59IGZyb20gXCJAZ2FtZS9QbGF5ZXIvcGxheWVyLWNvbnN0YW50c1wiO1xuaW1wb3J0IEVudGl0eUNhY2hlLCB7IHR5cGUgRW50aXR5Q29udGFpbmVyIH0gZnJvbSBcIi4vZW50aXR5LWNhY2hlXCI7XG5pbXBvcnQgeyBjcmVhdGVUYXJnZXRSaW5nTWF0ZXJpYWwgfSBmcm9tIFwiLi9lbnRpdHktc2VsZWN0LXJpbmdcIjtcbmltcG9ydCB7IGhlbGRJdGVtTG9jYWxZT2Zmc2V0IH0gZnJvbSBcIi4vaGVsZC1pdGVtLWF0dGFjaG1lbnRcIjtcbmltcG9ydCB0eXBlIHsgUmVxdWllbUVudGl0eUFjdG9yIH0gZnJvbSBcIi4vc2hhZG8tZW50aXR5LXBvb2xcIjtcblxuY29uc3QgbW9kZWxZT2Zmc2V0ID0ge1xuICBnbm46IDAuNSxcbn07XG5cbmNvbnN0IGh1bWFuQW5pbWF0aW9uQWxpYXNlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XG4gIHBvczogXCJJZGxlXCIsXG4gIHAwMTogXCJJZGxlXCIsXG4gIG8wMTogXCJJZGxlX0xvb2tcIixcbiAgbDAxOiBcIldhbGtcIixcbiAgbDAyOiBcIlJ1blwiLFxuICBsMDM6IFwiSnVtcF9TdGFydFwiLFxuICBsMDQ6IFwiSnVtcF9MYW5kXCIsXG4gIGwwNTogXCJKdW1wX0xvb3BcIixcbiAgbDA2OiBcIkNyb3VjaF9XYWxrXCIsXG4gIGwwOTogXCJTd2ltXCIsXG4gIHAwMjogXCJTaXRfSWRsZVwiLFxuICBwMDM6IFwiVHVybl9SaWdodFwiLFxuICBwMDQ6IFwiU3RyYWZlX1JpZ2h0XCIsXG4gIHAwNTogXCJQaWNrdXBcIixcbiAgcDA2OiBcIlN3aW1cIixcbiAgYzAxOiBcIktpY2tcIixcbiAgYzAyOiBcIlB1bmNoX1JpZ2h0XCIsXG4gIGMwMzogXCJCbG9ja1wiLFxuICBjMDQ6IFwiUHVuY2hfTGVmdFwiLFxuICBjMDU6IFwiUHVuY2hfUmlnaHRcIixcbiAgYzA2OiBcIlB1bmNoX0xlZnRcIixcbiAgYzA3OiBcIkJsb2NrXCIsXG4gIGMwODogXCJQdW5jaF9SaWdodFwiLFxuICBjMTE6IFwiS2lja1wiLFxuICBkMDE6IFwiSGl0X0Zyb250XCIsXG4gIGQwMjogXCJLbm9ja2Rvd25cIixcbiAgZDA1OiBcIkRlYXRoXCIsXG4gIHMwMTogXCJDaGVlclwiLFxuICBzMDM6IFwiV2F2ZVwiLFxuICBzMDY6IFwiWWVzXCIsXG4gIHMwNzogXCJOb1wiLFxuICBzMjA6IFwiS25lZWxcIixcbiAgczIyOiBcIlBvaW50XCIsXG4gIHMyODogXCJCb3dcIixcbn07XG5cbnR5cGUgSW5zdGFuY2VDb250YWluZXIgPSB7XG4gIG1lc2g6IEJKUy5NZXNoO1xuICB0aGluSW5zdGFuY2VJbmRleDogbnVtYmVyO1xuICBhY3RvcjogUmVxdWllbUVudGl0eUFjdG9yO1xufTtcblxuZXhwb3J0IGNsYXNzIEVudGl0eSBleHRlbmRzIEJBQllMT04uVHJhbnNmb3JtTm9kZSB7XG4gIHB1YmxpYyBzcGF3bjogU3Bhd24gfCBQbGF5ZXJQcm9maWxlO1xuICBwdWJsaWMgZW50aXR5Q29udGFpbmVyOiBFbnRpdHlDb250YWluZXI7XG4gIHB1YmxpYyBlbnRpdHlDYWNoZTogdHlwZW9mIEVudGl0eUNhY2hlO1xuICBwdWJsaWMgc3Bhd25Qb3NpdGlvbjogQkpTLlZlY3RvcjMgPSBuZXcgQkFCWUxPTi5WZWN0b3IzKDAsIDAsIDApO1xuICBwdWJsaWMgc3Bhd25TY2FsZTogbnVtYmVyID0gMS41O1xuICBwdWJsaWMgaGlkZGVuOiBib29sZWFuID0gdHJ1ZTtcbiAgcHVibGljIHJhY2VEYXRhRW50cnk6IFJhY2VFbnRyeSB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyBnZXQgY2xlYW5OYW1lKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuc3Bhd24ubmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIik7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyB0YXJnZXRSaW5nOiBCSlMuTWVzaDtcbiAgcHJpdmF0ZSBzdGF0aWMgY3VycmVudGx5U2VsZWN0ZWQ6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyB0YXJnZXRUZXh0dXJlOiBCSlMuUHJvY2VkdXJhbFRleHR1cmUgfCBudWxsID0gbnVsbDtcblxuICBwdWJsaWMgc3RhdGljIGRpc3Bvc2VTdGF0aWNzKCkge1xuICAgIGlmIChFbnRpdHkudGFyZ2V0UmluZykge1xuICAgICAgRW50aXR5LnRhcmdldFJpbmcuZGlzcG9zZShmYWxzZSwgdHJ1ZSk7XG4gICAgICBFbnRpdHkudGFyZ2V0UmluZyA9IG51bGwgYXMgdW5rbm93biBhcyBCSlMuTWVzaDtcbiAgICB9XG4gICAgaWYgKEVudGl0eS50YXJnZXRUZXh0dXJlKSB7XG4gICAgICBFbnRpdHkudGFyZ2V0VGV4dHVyZS5kaXNwb3NlKCk7XG4gICAgICBFbnRpdHkudGFyZ2V0VGV4dHVyZSA9IG51bGw7XG4gICAgfVxuICAgIEVudGl0eS5jdXJyZW50bHlTZWxlY3RlZCA9IG51bGw7XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGluc3RhbnRpYXRlU3RhdGljcyhzY2VuZTogQkpTLlNjZW5lKSB7XG4gICAgaWYgKCFFbnRpdHkudGFyZ2V0UmluZykge1xuICAgICAgY29uc3QgdGFyZ2V0UmluZyA9IEJBQllMT04uTWVzaEJ1aWxkZXIuQ3JlYXRlVG9ydXMoXG4gICAgICAgIFwic2VsZWN0aW9uUmluZ1wiLFxuICAgICAgICB7XG4gICAgICAgICAgZGlhbWV0ZXI6IDUsIC8vIG91dGVyIGRpYW1ldGVyID0gMiDDlyB5b3VyIGRlc2lyZWQgcmFkaXVzICg1IMOXIDIpXG4gICAgICAgICAgdGhpY2tuZXNzOiA0LCAvLyB0dWJlIHRoaWNrbmVzcyDigJQgbWFrZSB0aGlzIGFzIGJpZyBhcyB5b3UgbGlrZSB0byDigJxmaWxs4oCdIHRoZSBob2xlXG4gICAgICAgICAgdGVzc2VsbGF0aW9uOiA2NCwgLy8gc21vb3RobmVzc1xuICAgICAgICAgIHVwZGF0YWJsZTogdHJ1ZSwgLy8gaWYgeW91IGV2ZXIgd2FudCB0byB0d2VhayBpdCBhdCBydW50aW1lXG4gICAgICAgIH0sXG4gICAgICAgIHNjZW5lLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHBvc2l0aW9ucyA9IHRhcmdldFJpbmcuZ2V0VmVydGljZXNEYXRhKFxuICAgICAgICBCQUJZTE9OLlZlcnRleEJ1ZmZlci5Qb3NpdGlvbktpbmQsXG4gICAgICApITtcbiAgICAgIGNvbnN0IHV2cyA9IG5ldyBBcnJheSgocG9zaXRpb25zLmxlbmd0aCAvIDMpICogMik7XG4gICAgICBmb3IgKGxldCBpID0gMCwgaiA9IDA7IGkgPCBwb3NpdGlvbnMubGVuZ3RoOyBpICs9IDMsIGogKz0gMikge1xuICAgICAgICBjb25zdCB4ID0gcG9zaXRpb25zW2ldOyAvLyByaW5n4oCZcyBsb2NhbCBYXG4gICAgICAgIGNvbnN0IHogPSBwb3NpdGlvbnNbaSArIDJdOyAvLyByaW5n4oCZcyBsb2NhbCBaXG4gICAgICAgIHV2c1tqXSA9IHggLyAxMCArIDAuNTsgLy8geOKIiFstNS4uKzVdIOKGkiBbMC4uMV1cbiAgICAgICAgdXZzW2ogKyAxXSA9IHogLyAxMCArIDAuNTsgLy8geuKIiFstNS4uKzVdIOKGkiBbMC4uMV1cbiAgICAgIH1cbiAgICAgIHRhcmdldFJpbmcuc2V0VmVydGljZXNEYXRhKEJBQllMT04uVmVydGV4QnVmZmVyLlVWS2luZCwgdXZzLCB0cnVlKTtcbiAgICAgIGNvbnN0IFttYXQsIHRleHR1cmVdID0gY3JlYXRlVGFyZ2V0UmluZ01hdGVyaWFsKHNjZW5lKTtcbiAgICAgIEVudGl0eS50YXJnZXRUZXh0dXJlID0gdGV4dHVyZTtcbiAgICAgIHRhcmdldFJpbmcubWF0ZXJpYWwgPSBtYXQ7XG4gICAgICB0YXJnZXRSaW5nLmlzUGlja2FibGUgPSBmYWxzZTtcbiAgICAgIHRhcmdldFJpbmcuc2V0RW5hYmxlZChmYWxzZSk7XG4gICAgICBFbnRpdHkudGFyZ2V0UmluZyA9IHRhcmdldFJpbmc7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnYW1lTWFuYWdlcjogR2FtZU1hbmFnZXI7XG4gIHByaXZhdGUgc2NlbmU6IEJKUy5TY2VuZTtcbiAgcHJpdmF0ZSBhbmltYXRpb25CdWZmZXI6IEJKUy5WZWN0b3I0ID0gbmV3IEJBQllMT04uVmVjdG9yNCgwLCAxLCAwLCA2MCk7XG4gIHB1YmxpYyBtZXNoSW5zdGFuY2U6IEluc3RhbmNlQ29udGFpbmVyIHwgbnVsbCA9IG51bGw7XG4gIHB1YmxpYyBuYW1lcGxhdGVMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSBjYXBzdWxlU2hhcGU6IEJKUy5QaHlzaWNzU2hhcGVDYXBzdWxlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcGlja0luc3Q6IEJKUy5JbnN0YW5jZWRNZXNoIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNQbGF5ZXIgPSBmYWxzZTtcbiAgcHJpdmF0ZSBkaXNwb3NlZCA9IGZhbHNlO1xuICBwcml2YXRlIGFwcGVhcmFuY2VHZW5lcmF0aW9uID0gMDtcbiAgcHJpdmF0ZSB2aXNpYmlsaXR5T3ZlcnJpZGU6IGJvb2xlYW4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSByZWFkb25seSBpdGVtUmVzb2x2ZXI/OiAoc2xvdDogbnVtYmVyKSA9PiBOdWxsYWJsZUl0ZW1JbnN0YW5jZTtcbiAgcHVibGljIHJlYWRvbmx5IHJlYWR5OiBQcm9taXNlPHZvaWQ+O1xuXG4gIHB1YmxpYyBnZXQgbGlmZWN5Y2xlRGlzcG9zZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcG9zZWQ7XG4gIH1cblxuICBwdWJsaWMgZ2V0IGlzUGxheWVyUmFjZSgpIHtcbiAgICByZXR1cm4gaXNQbGF5ZXJSYWNlKHRoaXMuZW50aXR5Q29udGFpbmVyLm1vZGVsKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0IHBoeXNpY3NQbHVnaW4oKTogQkpTLkhhdm9rUGx1Z2luIHtcbiAgICByZXR1cm4gdGhpcy5nYW1lTWFuYWdlclxuICAgICAgLnNjZW5lIS5nZXRQaHlzaWNzRW5naW5lKCkhXG4gICAgICAuZ2V0UGh5c2ljc1BsdWdpbigpIGFzIEJKUy5IYXZva1BsdWdpbjtcbiAgfVxuXG4gIC8vIHByaXZhdGUgZGVidWdXaXJlZnJhbWU6IERlYnVnV2lyZWZyYW1lIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0cnVjdG9yKFxuICAgIGdhbWVNYW5hZ2VyOiBHYW1lTWFuYWdlcixcbiAgICBzcGF3bjogU3Bhd24gfCBQbGF5ZXJQcm9maWxlLFxuICAgIHNjZW5lOiBCSlMuU2NlbmUsXG4gICAgZW50aXR5Q29udGFpbmVyOiBFbnRpdHlDb250YWluZXIsXG4gICAgZW50aXR5Q2FjaGU6IHR5cGVvZiBFbnRpdHlDYWNoZSxcbiAgICBwYXJlbnQ6IEJKUy5Ob2RlLFxuICAgIHJhY2VFbnRyeTogUmFjZUVudHJ5LFxuICAgIGl0ZW1SZXNvbHZlcj86IChzbG90OiBudW1iZXIpID0+IE51bGxhYmxlSXRlbUluc3RhbmNlLFxuICApIHtcbiAgICBzdXBlcihgZW50aXR5XyR7c3Bhd24ubmFtZX1gLCBzY2VuZSk7XG4gICAgdGhpcy5pc1BsYXllciA9ICEhKChzcGF3biBhcyBQbGF5ZXJQcm9maWxlKT8uaW52ZW50b3J5SXRlbXMgPz8gZmFsc2UpO1xuICAgIHRoaXMucmFjZURhdGFFbnRyeSA9IHJhY2VFbnRyeTtcbiAgICB0aGlzLmdhbWVNYW5hZ2VyID0gZ2FtZU1hbmFnZXI7XG4gICAgdGhpcy5zcGF3biA9IHNwYXduO1xuICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICB0aGlzLnNldFBhcmVudChwYXJlbnQpO1xuICAgIHRoaXMuZW50aXR5Q29udGFpbmVyID0gZW50aXR5Q29udGFpbmVyO1xuICAgIHRoaXMuZW50aXR5Q2FjaGUgPSBlbnRpdHlDYWNoZTtcbiAgICB0aGlzLml0ZW1SZXNvbHZlciA9IGl0ZW1SZXNvbHZlcjtcbiAgICBjb25zdCBoZWlnaHQgPSByYWNlRW50cnkuaGVpZ2h0ID8/IDY7XG4gICAgbGV0IHNwYXduU2NhbGUgPSB0eXBlb2Ygc3Bhd24uc2l6ZSA9PT0gXCJudW1iZXJcIiA/IHNwYXduLnNpemUgOiBoZWlnaHQ7XG4gICAgaWYgKHNwYXduU2NhbGUgPT09IC0xKSB7XG4gICAgICBzcGF3blNjYWxlID0gaGVpZ2h0O1xuICAgIH1cbiAgICBjb25zdCBmaW5hbFNjYWxlID0gc3Bhd25TY2FsZSAvIGhlaWdodDtcblxuICAgIHRoaXMuc3Bhd25TY2FsZSA9IGZpbmFsU2NhbGU7IC8vIFVzZSBzcGF3biBzY2FsZSBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBkZWZhdWx0IHRvIDEuNVxuICAgIC8vIEJvZHkgcmVuZGVyaW5nLCBhdHRhY2htZW50cywgYW5kIHBoeXNpY3MgZWFjaCBjb25zdW1lIHNwYXduU2NhbGVcbiAgICAvLyBleHBsaWNpdGx5LiBTY2FsaW5nIHRoaXMgc2hhcmVkIHBhcmVudCBhcyB3ZWxsIHdvdWxkIGFwcGx5IGl0IHR3aWNlIHRvXG4gICAgLy8gYXR0YWNoZWQgd2VhcG9ucyBhbmQgdG8gcGh5c2ljcyBpbXBsZW1lbnRhdGlvbnMgdGhhdCBob25vciBub2RlIHNjYWxlLlxuICAgIHRoaXMuc2NhbGluZy5zZXRBbGwoMSk7XG4gICAgdGhpcy5zcGF3blBvc2l0aW9uID0gbmV3IEJBQllMT04uVmVjdG9yMyhzcGF3bi54LCBzcGF3bi55LCBzcGF3bi56KTtcbiAgICB0aGlzLnBsYXlBbmltYXRpb24oQW5pbWF0aW9uRGVmaW5pdGlvbnMuSWRsZTEpO1xuICAgIEVudGl0eS5pbnN0YW50aWF0ZVN0YXRpY3Moc2NlbmUpO1xuICAgIHRoaXMucmVhZHkgPSB0aGlzLnNldHVwKCk7XG4gICAgLy8gdGhpcy5kZWJ1Z1dpcmVmcmFtZT8uY3JlYXRlV2lyZWZyYW1lKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNldHVwKCkge1xuICAgIHRoaXMuc2V0dXBQaHlzaWNzKCk7XG4gICAgLy8gU3Bhd24gaGVhZGluZ3MgZnJvbSBFUSBjb250ZW50IHVzZSB0aGUgY2Fub25pY2FsIDAuLjUxMiB0dXJuIHNjYWxlLlxuICAgIHRoaXMuc2V0Um90YXRpb24oKE51bWJlcih0aGlzLnNwYXduLmhlYWRpbmcgPz8gMCkgKiBNYXRoLlBJKSAvIDI1Nik7XG4gICAgLy8gQ3JlYXRlIGJvZHkgaW5zdGFuY2VzIGFuZCBhc3NpZ24gcGh5c2ljcyBib2R5XG4gICAgdGhpcy5pbnN0YW50aWF0ZU1lc2hlcygpO1xuICAgIGF3YWl0IHRoaXMuaW5zdGFudGlhdGVOYW1lcGxhdGUoW3RoaXMuc3Bhd24ubmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIiBcIildKTtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMudXBkYXRlTW9kZWxUZXh0dXJlcygpO1xuICAgIGlmICh0aGlzLmRpc3Bvc2VkKSByZXR1cm47XG4gICAgdGhpcy5jaGVja0JlbG93QW5kUmVwb3NpdGlvbigpO1xuICB9XG5cbiAgcHVibGljIGdldCBpc0h1bWFub2lkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAoXG4gICAgICAodGhpcy5zcGF3bi5yYWNlID49IDEgJiYgdGhpcy5zcGF3bi5yYWNlIDw9IDEyKSB8fFxuICAgICAgaHVtYW5vaWROcGNSYWNlcy5oYXModGhpcy5zcGF3bi5yYWNlKVxuICAgICk7XG4gIH1cblxuICAvKiogUGxheWFibGUgcmFjZXMgc2VsZWN0IGZhY2lhbCB2YXJpYW50cyBieSB0aGUgcHJvZmlsZSBmYWNlIGZpZWxkLiBDbGFzc2ljXG4gICAqIGNpdHkgTlBDIG1vZGVscyBhcmUgaHVtYW5vaWQgZm9yIGFybW9yLCBidXQgZW5jb2RlIGhlYWRzIGFzIG1hdGVyaWFscy4gKi9cbiAgcHJpdmF0ZSBnZXQgdXNlc1BsYXllckZhY2VUZXh0dXJlcygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zcGF3bi5yYWNlID49IDEgJiYgdGhpcy5zcGF3bi5yYWNlIDw9IDEyO1xuICB9XG5cbiAgcHVibGljIGdldEhlYWRpbmcoKTogbnVtYmVyIHtcbiAgICBjb25zdCBwaHlzaWNzQm9keSA9IHRoaXMucGh5c2ljc0JvZHk7XG4gICAgaWYgKCFwaHlzaWNzQm9keSkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgY29uc3QgWywgb3V0UXVhdF0gPSB0aGlzLnBoeXNpY3NQbHVnaW4uX2hrbnAuSFBfQm9keV9HZXRPcmllbnRhdGlvbihcbiAgICAgIHBoeXNpY3NCb2R5Ll9wbHVnaW5EYXRhLmhwQm9keUlkLFxuICAgICk7XG4gICAgY29uc3QgZXVsZXJzID0gQkFCWUxPTi5RdWF0ZXJuaW9uLkZyb21BcnJheShvdXRRdWF0KS50b0V1bGVyQW5nbGVzKCk7XG5cbiAgICByZXR1cm4gZXVsZXJzLnk7XG4gIH1cblxuICBwdWJsaWMgc2V0VmVsb2NpdHkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcikge1xuICAgIGNvbnN0IHBoeXNpY3NCb2R5ID0gdGhpcy5waHlzaWNzQm9keTtcbiAgICBpZiAoIXBoeXNpY3NCb2R5KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHBoeXNpY3NCb2R5LnNldExpbmVhclZlbG9jaXR5KG5ldyBCQUJZTE9OLlZlY3RvcjMoeCwgeSwgeikpO1xuICB9XG4gIHByaXZhdGUgbGFzdFlhdzogbnVtYmVyID0gMDtcbiAgcHVibGljIHNldFJvdGF0aW9uKHlhdzogbnVtYmVyKSB7XG4gICAgdGhpcy5sYXN0WWF3ID0geWF3O1xuICAgIGNvbnN0IHBoeXNpY3NCb2R5ID0gdGhpcy5waHlzaWNzQm9keTtcbiAgICBpZiAoIXBoeXNpY3NCb2R5KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSAoKHlhdyAlICgyICogTWF0aC5QSSkpICsgMiAqIE1hdGguUEkpICUgKDIgKiBNYXRoLlBJKTtcbiAgICBjb25zdCBxID0gQkFCWUxPTi5RdWF0ZXJuaW9uLlJvdGF0aW9uWWF3UGl0Y2hSb2xsKG5vcm1hbGl6ZWQsIDAsIDApO1xuICAgIHRoaXMucm90YXRpb25RdWF0ZXJuaW9uID0gcTtcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzLmdhbWVNYW5hZ2VyXG4gICAgICAuc2NlbmUhLmdldFBoeXNpY3NFbmdpbmUoKSFcbiAgICAgIC5nZXRQaHlzaWNzUGx1Z2luKCkgYXMgQkpTLkhhdm9rUGx1Z2luO1xuXG4gICAgcGx1Z2luLl9oa25wLkhQX0JvZHlfU2V0T3JpZW50YXRpb24oXG4gICAgICBwaHlzaWNzQm9keS5fcGx1Z2luRGF0YS5ocEJvZHlJZCxcbiAgICAgIHEuYXNBcnJheSgpLFxuICAgICk7XG4gIH1cblxuICBwdWJsaWMgc2V0UG9zaXRpb24oeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcikge1xuICAgIHRoaXMuc3Bhd25Qb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgaWYgKEVudGl0eS5jdXJyZW50bHlTZWxlY3RlZCA9PT0gdGhpcyAmJiBFbnRpdHkudGFyZ2V0UmluZykge1xuICAgICAgRW50aXR5LnRhcmdldFJpbmcucG9zaXRpb24ueCA9IHg7XG4gICAgICBFbnRpdHkudGFyZ2V0UmluZy5wb3NpdGlvbi56ID0gejtcbiAgICB9XG4gICAgY29uc3QgcGh5c2ljc0JvZHkgPSB0aGlzLnBoeXNpY3NCb2R5O1xuICAgIGlmICghcGh5c2ljc0JvZHkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcGx1Z2luID0gdGhpcy5nYW1lTWFuYWdlclxuICAgICAgLnNjZW5lIS5nZXRQaHlzaWNzRW5naW5lKCkhXG4gICAgICAuZ2V0UGh5c2ljc1BsdWdpbigpIGFzIEJKUy5IYXZva1BsdWdpbjtcblxuICAgIHBsdWdpbi5faGtucC5IUF9Cb2R5X1NldFBvc2l0aW9uKHBoeXNpY3NCb2R5Ll9wbHVnaW5EYXRhLmhwQm9keUlkLCBbXG4gICAgICB4LFxuICAgICAgeSxcbiAgICAgIHosXG4gICAgXSk7XG4gIH1cblxuICBwdWJsaWMgZ2V0Q2xvc2VzdFNwYXducyhcbiAgICBuOiBudW1iZXIgPSAxLFxuICAgIGZpbHRlcjogKHNwYXduOiBFbnRpdHkpID0+IGJvb2xlYW4gPSAoKSA9PiB0cnVlLFxuICApOiBFbnRpdHlbXSB7XG4gICAgY29uc3QgZW50aXRpZXMgPSB0aGlzLmdhbWVNYW5hZ2VyLlpvbmVNYW5hZ2VyPy5FbnRpdHlQb29sPy5lbnRpdGllcyA/PyB7fTtcbiAgICBjb25zdCBteVBvcyA9IHRoaXMuc3Bhd25Qb3NpdGlvbjtcbiAgICAvLyBDcmVhdGUgYW4gYXJyYXkgb2YgZW50aXRpZXMgd2l0aCB0aGVpciBkaXN0YW5jZXNcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhlbnRpdGllcylcbiAgICAgIC5maWx0ZXIoKGVudGl0eSkgPT4gIWVudGl0eS5oaWRkZW4gJiYgZW50aXR5ICE9PSB0aGlzKVxuICAgICAgLm1hcCgoZW50aXR5KSA9PiAoe1xuICAgICAgICBlbnRpdHksXG4gICAgICAgIGRpc3Q6IE1hdGguc3FydChcbiAgICAgICAgICBCQUJZTE9OLlZlY3RvcjMuRGlzdGFuY2VTcXVhcmVkKG15UG9zLCBlbnRpdHkuc3Bhd25Qb3NpdGlvbiksXG4gICAgICAgICksXG4gICAgICB9KSlcbiAgICAgIC5maWx0ZXIoKGVudGl0eSkgPT4gZmlsdGVyKGVudGl0eS5lbnRpdHkpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuZGlzdCAtIGIuZGlzdCkgLy8gU29ydCBieSBkaXN0YW5jZVxuICAgICAgLnNsaWNlKDAsIG4pIC8vIFRha2UgdGhlIDUgY2xvc2VzdFxuICAgICAgLm1hcCgoZW50cnkpID0+IGVudHJ5LmVudGl0eSk7XG4gIH1cblxuICBwdWJsaWMgc2V0U2VsZWN0ZWQoc2VsZWN0ZWQ6IGJvb2xlYW4sIGNvbG9yPzogQkpTLkNvbG9yNCk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1lc2hJbnN0YW5jZSkge1xuICAgICAgdGhpcy5lbnRpdHlDb250YWluZXIuc2hhZG9Qb29sLnNldFNlbGVjdGVkKFxuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS5hY3RvcixcbiAgICAgICAgc2VsZWN0ZWQsXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB0YXJnZXRSaW5nID0gRW50aXR5LnRhcmdldFJpbmchO1xuICAgIGlmIChzZWxlY3RlZCkge1xuICAgICAgLy8gZGVzZWxlY3QgYW55IHByZXZpb3VzIGVudGl0eVxuICAgICAgaWYgKEVudGl0eS5jdXJyZW50bHlTZWxlY3RlZCAmJiBFbnRpdHkuY3VycmVudGx5U2VsZWN0ZWQgIT09IHRoaXMpIHtcbiAgICAgICAgRW50aXR5LmN1cnJlbnRseVNlbGVjdGVkLnNldFNlbGVjdGVkKGZhbHNlKTtcbiAgICAgIH1cbiAgICAgIEVudGl0eS5jdXJyZW50bHlTZWxlY3RlZCA9IHRoaXM7XG5cbiAgICAgIC8vIFNoYWRvIGFjdG9ycyBrZWVwIHRoZWlyIHdvcmxkIHRyYW5zZm9ybSBpbiB0aGUgc2hhcmVkIGFjdG9yIGJ1ZmZlcjsgdGhlXG4gICAgICAvLyBCYWJ5bG9uIFRyYW5zZm9ybU5vZGUgaW50ZW50aW9uYWxseSByZW1haW5zIGF0IHRoZSBvcmlnaW4uIEtlZXAgdGhlIG9uZVxuICAgICAgLy8gc2hhcmVkIHJpbmcgaW4gd29ybGQgc3BhY2Ugc28gaXQgZm9sbG93cyB0aGUgc2FtZSBzb3VyY2Ugb2YgdHJ1dGguXG4gICAgICB0YXJnZXRSaW5nLnNldFBhcmVudChudWxsKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBCQUJZTE9OLlBoeXNpY3NSYXljYXN0UmVzdWx0KCk7XG4gICAgICBjb25zdCByYXlPcmlnaW4gPSB0aGlzLnNwYXduUG9zaXRpb24uYWRkKFxuICAgICAgICBuZXcgQkFCWUxPTi5WZWN0b3IzKDAsIDUgKiB0aGlzLnNwYXduU2NhbGUsIDApLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGRvd25FbmQgPSByYXlPcmlnaW4uYWRkKG5ldyBCQUJZTE9OLlZlY3RvcjMoMCwgLTEwMDAsIDApKTtcbiAgICAgIHRoaXMucGh5c2ljc1BsdWdpbi5yYXljYXN0KHJheU9yaWdpbiwgZG93bkVuZCwgcmVzdWx0KTtcbiAgICAgIGNvbnN0IGdyb3VuZFkgPSByZXN1bHQuaGFzSGl0ID8gcmVzdWx0LmhpdFBvaW50LnkgOiB0aGlzLnNwYXduUG9zaXRpb24ueTtcblxuICAgICAgaWYgKGNvbG9yKSB7XG4gICAgICAgIEVudGl0eS50YXJnZXRUZXh0dXJlPy5zZXRDb2xvcjQoXG4gICAgICAgICAgXCJjb2xvclwiLFxuICAgICAgICAgIG5ldyBCQUJZTE9OLkNvbG9yNChjb2xvci5yLCBjb2xvci5nLCBjb2xvci5iLCAwLjUpLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGFyZ2V0UmluZy5zY2FsaW5nLnNldEFsbCh0aGlzLnNwYXduU2NhbGUpO1xuICAgICAgdGFyZ2V0UmluZy5wb3NpdGlvbi5zZXQodGhpcy5zcGF3blBvc2l0aW9uLngsIGdyb3VuZFkgKyAwLjEsIHRoaXMuc3Bhd25Qb3NpdGlvbi56KTtcbiAgICAgIHRhcmdldFJpbmcuc2V0RW5hYmxlZCh0cnVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gb25seSBoaWRlIGlmICp0aGlzKiBlbnRpdHkgaXMgdGhlIG9uZSB0aGF0IG93bnMgaXRcbiAgICAgIGlmIChFbnRpdHkuY3VycmVudGx5U2VsZWN0ZWQgPT09IHRoaXMpIHtcbiAgICAgICAgdGFyZ2V0UmluZy5zZXRFbmFibGVkKGZhbHNlKTtcbiAgICAgICAgRW50aXR5LmN1cnJlbnRseVNlbGVjdGVkID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgZGlzcG9zZSgpIHtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgIHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuICAgIHRoaXMuYXBwZWFyYW5jZUdlbmVyYXRpb24rKztcbiAgICBFbnRpdHlDYWNoZS51bnJlZ2lzdGVyKHRoaXMpO1xuICAgIGlmICh0aGlzLm1lc2hJbnN0YW5jZSkge1xuICAgICAgdGhpcy5lbnRpdHlDb250YWluZXIucmVtb3ZlVGhpbkluc3RhbmNlKFxuICAgICAgICB0aGlzLm1lc2hJbnN0YW5jZS50aGluSW5zdGFuY2VJbmRleCxcbiAgICAgICk7XG4gICAgfVxuICAgIHRoaXMubWVzaEluc3RhbmNlID0gbnVsbDtcblxuICAgIHRoaXMubmFtZXBsYXRlTGluZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgbWVzaCBvZiBbLi4udGhpcy5wcmltYXJ5TWVzaGVzLCAuLi50aGlzLnNlY29uZGFyeU1lc2hlc10pIHtcbiAgICAgIGlmICghbWVzaC5pc0Rpc3Bvc2VkKCkpIG1lc2guZGlzcG9zZSgpO1xuICAgIH1cbiAgICB0aGlzLnByaW1hcnlNZXNoZXMgPSBbXTtcbiAgICB0aGlzLnNlY29uZGFyeU1lc2hlcyA9IFtdO1xuICAgIGlmICh0aGlzLmFuaW1hdGlvblRpbWVvdXQgJiYgdHlwZW9mIHRoaXMuYW5pbWF0aW9uVGltZW91dCAhPT0gXCJib29sZWFuXCIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLmFuaW1hdGlvblRpbWVvdXQpO1xuICAgIH1cbiAgICB0aGlzLmFuaW1hdGlvblRpbWVvdXQgPSBmYWxzZTtcblxuICAgIC8vIERpc3Bvc2UgcGh5c2ljcyBib2R5IGFuZCBzaGFwZVxuICAgIGlmICh0aGlzLnBoeXNpY3NCb2R5KSB7XG4gICAgICB0aGlzLnBoeXNpY3NCb2R5LmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMucGh5c2ljc0JvZHkgPSBudWxsO1xuICAgIH1cbiAgICBpZiAodGhpcy5jYXBzdWxlU2hhcGUpIHtcbiAgICAgIHRoaXMuY2Fwc3VsZVNoYXBlLmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMuY2Fwc3VsZVNoYXBlID0gbnVsbDtcbiAgICB9XG4gICAgLy8gRGlzcG9zZSBwaWNrIGluc3RhbmNlXG4gICAgaWYgKHRoaXMucGlja0luc3QpIHtcbiAgICAgIHRoaXMucGlja0luc3QuZGlzcG9zZSgpO1xuICAgICAgdGhpcy5waWNrSW5zdCA9IG51bGw7XG4gICAgfVxuXG4gICAgc3VwZXIuZGlzcG9zZSgpO1xuICB9XG5cbiAgcHVibGljIHRvZ2dsZVZpc2liaWxpdHkodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICh0aGlzLmRpc3Bvc2VkKSByZXR1cm47XG4gICAgdGhpcy52aXNpYmlsaXR5T3ZlcnJpZGUgPSB2aXNpYmxlID8gbnVsbCA6IGZhbHNlO1xuICAgIHRoaXMuaGlkZGVuID0gIXZpc2libGU7XG4gICAgaWYgKHRoaXMubWVzaEluc3RhbmNlKSB7XG4gICAgICB0aGlzLmVudGl0eUNvbnRhaW5lci5zaGFkb1Bvb2wuc2V0VmlzaWJsZShcbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2UuYWN0b3IsXG4gICAgICAgIHZpc2libGUsXG4gICAgICApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG1lc2ggb2YgWy4uLnRoaXMucHJpbWFyeU1lc2hlcywgLi4udGhpcy5zZWNvbmRhcnlNZXNoZXNdKSB7XG4gICAgICBtZXNoLnNldEVuYWJsZWQodmlzaWJsZSk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGhpZGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybjtcbiAgICB0aGlzLnZpc2liaWxpdHlPdmVycmlkZSA9IGZhbHNlO1xuICAgIHRoaXMuaGlkZGVuID0gdHJ1ZTtcbiAgICBpZiAodGhpcy5tZXNoSW5zdGFuY2UpIHtcbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLnNoYWRvUG9vbC5zZXRWaXNpYmxlKHRoaXMubWVzaEluc3RhbmNlLmFjdG9yLCBmYWxzZSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbWVzaCBvZiBbLi4udGhpcy5wcmltYXJ5TWVzaGVzLCAuLi50aGlzLnNlY29uZGFyeU1lc2hlc10pIHtcbiAgICAgIG1lc2guc2V0RW5hYmxlZChmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGluaXRpYWxpemUoKSB7XG4gICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybjtcbiAgICB0aGlzLnZpc2liaWxpdHlPdmVycmlkZSA9IG51bGw7XG4gICAgdGhpcy5oaWRkZW4gPSBmYWxzZTtcbiAgICBpZiAodGhpcy5tZXNoSW5zdGFuY2UpIHtcbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLnNoYWRvUG9vbC5zZXRWaXNpYmxlKHRoaXMubWVzaEluc3RhbmNlLmFjdG9yLCB0cnVlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBtZXNoIG9mIFsuLi50aGlzLnByaW1hcnlNZXNoZXMsIC4uLnRoaXMuc2Vjb25kYXJ5TWVzaGVzXSkge1xuICAgICAgbWVzaC5zZXRFbmFibGVkKHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhcHBseVJlZHVjZWRWaXNpYmlsaXR5KCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmRpc3Bvc2VkIHx8ICF0aGlzLm1lc2hJbnN0YW5jZSkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnZpc2liaWxpdHlPdmVycmlkZSA9PT0gZmFsc2UpIHtcbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLnNoYWRvUG9vbC5zZXRWaXNpYmxlKHRoaXMubWVzaEluc3RhbmNlLmFjdG9yLCBmYWxzZSk7XG4gICAgfVxuICAgIGNvbnN0IHZpc2libGUgPSBCb29sZWFuKHRoaXMubWVzaEluc3RhbmNlLmFjdG9yLnZpc2libGVGbGFnKTtcbiAgICB0aGlzLmhpZGRlbiA9ICF2aXNpYmxlO1xuICAgIGZvciAoY29uc3QgbWVzaCBvZiB0aGlzLnByaW1hcnlNZXNoZXMpIG1lc2guc2V0RW5hYmxlZCh2aXNpYmxlKTtcbiAgICBmb3IgKGNvbnN0IG1lc2ggb2YgdGhpcy5zZWNvbmRhcnlNZXNoZXMpIG1lc2guc2V0RW5hYmxlZCh2aXNpYmxlKTtcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlTWF0ZXJpYWxCdWZmZXJzKCkge1xuICAgIGlmICh0aGlzLm1lc2hJbnN0YW5jZSkge1xuICAgICAgdGhpcy5lbnRpdHlDb250YWluZXIuc2hhZG9Qb29sLnNldEFuaW1hdGlvbihcbiAgICAgICAgdGhpcy5tZXNoSW5zdGFuY2UuYWN0b3IsXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uQnVmZmVyLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGluc3RhbnRpYXRlTWVzaGVzKCkge1xuICAgIGNvbnN0IHdvcmxkTWF0ID0gQkFCWUxPTi5NYXRyaXguU2NhbGluZyhcbiAgICAgIHRoaXMuc3Bhd25TY2FsZSxcbiAgICAgIHRoaXMuc3Bhd25TY2FsZSxcbiAgICAgIHRoaXMuc3Bhd25TY2FsZSxcbiAgICApXG4gICAgICAubXVsdGlwbHkoQkFCWUxPTi5NYXRyaXguUm90YXRpb25ZYXdQaXRjaFJvbGwoMCwgMCwgMCkpXG4gICAgICAubXVsdGlwbHkoXG4gICAgICAgIEJBQllMT04uTWF0cml4LlRyYW5zbGF0aW9uKFxuICAgICAgICAgIHRoaXMuc3Bhd25Qb3NpdGlvbi54LFxuICAgICAgICAgIHRoaXMuc3Bhd25Qb3NpdGlvbi55LFxuICAgICAgICAgIHRoaXMuc3Bhd25Qb3NpdGlvbi56LFxuICAgICAgICApLFxuICAgICAgKTtcbiAgICBjb25zdCB7IG1lc2gsIGFkZFRoaW5JbnN0YW5jZSB9ID0gdGhpcy5lbnRpdHlDb250YWluZXI7XG4gICAgY29uc3QgZW50aXR5SWQgPSBOdW1iZXIoKHRoaXMuc3Bhd24gYXMgU3Bhd24pLnNwYXduSWQgPz8gMCk7XG4gICAgY29uc3QgdGhpbkluc3RhbmNlSW5kZXggPSBhZGRUaGluSW5zdGFuY2Uod29ybGRNYXQsIGVudGl0eUlkKTtcbiAgICB0aGlzLm1lc2hJbnN0YW5jZSA9IHtcbiAgICAgIG1lc2g6IG1lc2ggYXMgQkpTLk1lc2gsXG4gICAgICB0aGluSW5zdGFuY2VJbmRleCxcbiAgICAgIGFjdG9yOiB0aGlzLmVudGl0eUNvbnRhaW5lci5zaGFkb1Bvb2wuc2hhZG8uY2hpbGRyZW5bdGhpbkluc3RhbmNlSW5kZXhdLFxuICAgIH07XG4gICAgdGhpcy5lbnRpdHlDb250YWluZXIuc2hhZG9Qb29sLnNldFRyYW5zZm9ybShcbiAgICAgIHRoaXMubWVzaEluc3RhbmNlLmFjdG9yLFxuICAgICAgdGhpcy5zcGF3blBvc2l0aW9uLFxuICAgICAgdGhpcy5yb3RhdGlvblF1YXRlcm5pb24gPz8gQkFCWUxPTi5RdWF0ZXJuaW9uLklkZW50aXR5KCksXG4gICAgICB0aGlzLnNwYXduU2NhbGUsXG4gICAgKTtcbiAgICB0aGlzLmVudGl0eUNvbnRhaW5lci5zaGFkb1Bvb2wuc2V0QW5pbWF0aW9uKFxuICAgICAgdGhpcy5tZXNoSW5zdGFuY2UuYWN0b3IsXG4gICAgICB0aGlzLmFuaW1hdGlvbkJ1ZmZlcixcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBpc05wYygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gISEodGhpcy5zcGF3biBhcyBTcGF3bikuaXNOcGM7XG4gIH1cblxuICBwcml2YXRlIGlzUGMoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICF0aGlzLmlzUGxheWVyICYmICF0aGlzLmlzTnBjKCk7XG4gIH1cbiAgcHJpdmF0ZSBoZWFkTW9kZWwoKTogc3RyaW5nIHtcbiAgICBsZXQgdmFyaWF0aW9uID0gXCJcIjtcbiAgICBpZiAodGhpcy5pc05wYygpKSB7XG4gICAgICB2YXJpYXRpb24gPSAodGhpcy5zcGF3biBhcyBhbnkgYXMgU3Bhd24pLmhlbG0udG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgfSBlbHNlIGlmICh0aGlzLmlzUGMoKSkge1xuICAgICAgdmFyaWF0aW9uID1cbiAgICAgICAgKHRoaXMuc3Bhd24gYXMgYW55IGFzIFNwYXduKT8uZXF1aXBtZW50Py5oZWFkXG4gICAgICAgICAgPy50b1N0cmluZygpXG4gICAgICAgICAgPy5wYWRTdGFydCgyLCBcIjBcIikgPz8gXCIwMFwiO1xuICAgIH0gZWxzZSBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgY29uc3QgaGVhZEl0ZW0gPSB0aGlzLmVxdWlwcGVkSXRlbShJbnZlbnRvcnlTbG90LkhlYWQpO1xuICAgICAgaWYgKGhlYWRJdGVtKSB7XG4gICAgICAgIHZhcmlhdGlvbiA9IGhlYWRJdGVtLm1hdGVyaWFsLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyaWF0aW9uID0gXCIwMFwiOyAvLyBEZWZhdWx0IHRvIDAwIGlmIG5vIGhlYWQgaXRlbSBmb3VuZFxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFyaWF0aW9uO1xuICB9XG5cbiAgcHJpdmF0ZSByb2JlTW9kZWwoKTogc3RyaW5nIHtcbiAgICBsZXQgdmFyaWF0aW9uID0gXCJcIjtcbiAgICBjb25zdCBzcGF3bkNoZXN0ID0gKHRoaXMuc3Bhd24gYXMgU3Bhd24pLmVxdWlwbWVudD8uY2hlc3Q7XG4gICAgaWYgKFwiZXF1aXBDaGVzdFwiIGluIHRoaXMuc3Bhd24gJiYgdGhpcy5zcGF3bi5lcXVpcENoZXN0ID49IDEwKSB7XG4gICAgICB2YXJpYXRpb24gPSB0aGlzLnNwYXduLmVxdWlwQ2hlc3QudG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgfSBlbHNlIGlmIChzcGF3bkNoZXN0ICE9PSB1bmRlZmluZWQgJiYgc3Bhd25DaGVzdCA+PSAxMCkge1xuICAgICAgdmFyaWF0aW9uID0gc3Bhd25DaGVzdC50b1N0cmluZygpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaXNQbGF5ZXIpIHtcbiAgICAgIGNvbnN0IHBsYXllckNoZXN0SXRlbSA9IHRoaXMuZXF1aXBwZWRJdGVtKEludmVudG9yeVNsb3QuQ2hlc3QpO1xuICAgICAgaWYgKHBsYXllckNoZXN0SXRlbT8ubWF0ZXJpYWwgJiYgcGxheWVyQ2hlc3RJdGVtLm1hdGVyaWFsID49IDEwKSB7XG4gICAgICAgIHZhcmlhdGlvbiA9IHBsYXllckNoZXN0SXRlbS5tYXRlcmlhbC50b1N0cmluZygpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhcmlhdGlvbjtcbiAgfVxuICBwcml2YXRlIHByaW1hcnlNZXNoZXM6IEJKUy5JbnN0YW5jZWRNZXNoW10gPSBbXTtcbiAgcHJpdmF0ZSBzZWNvbmRhcnlNZXNoZXM6IEJKUy5JbnN0YW5jZWRNZXNoW10gPSBbXTtcbiAgcHJpdmF0ZSBhcHBlYXJhbmNlVXBkYXRlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVQcmltYXJ5KCkge1xuICAgIGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLmFwcGVhcmFuY2VHZW5lcmF0aW9uO1xuICAgIGxldCBpdGVtID0gXCJcIjtcbiAgICBmb3IgKGNvbnN0IG1lc2ggb2YgdGhpcy5wcmltYXJ5TWVzaGVzKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIkRpc3Bvc2luZyBwcmltYXJ5IG1lc2hcIiwgbWVzaC5uYW1lKTtcbiAgICAgIG1lc2guZGlzcG9zZSgpO1xuICAgIH1cbiAgICB0aGlzLnByaW1hcnlNZXNoZXMgPSBbXTtcbiAgICBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgaXRlbSA9IHRoaXMuZXF1aXBwZWRJdGVtKEludmVudG9yeVNsb3QuUHJpbWFyeSk/LmlkZmlsZSA/PyBcIlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwcmltYXJ5ID0gKHRoaXMuc3Bhd24gYXMgU3Bhd24pLmVxdWlwbWVudD8ucHJpbWFyeSA/PyAwO1xuICAgICAgaWYgKHByaW1hcnkpIHtcbiAgICAgICAgaXRlbSA9IGBJVCR7cHJpbWFyeX1gO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoaXRlbS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc29sZS5sb2coXCJbRW50aXR5XSBVcGRhdGluZyBwcmltYXJ5IHdlYXBvbiBtb2RlbFwiLCBpdGVtKTtcbiAgICBjb25zdCBwcmltYXJ5Qm9uZUluZGV4ID1cbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyPy5hdHRhY2htZW50Qm9uZUluZGljZXMucl9wb2ludDtcbiAgICBpZiAocHJpbWFyeUJvbmVJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGl0ZW1Db250YWluZXIgPSBhd2FpdCB0aGlzLmVudGl0eUNvbnRhaW5lcj8uZ2V0SXRlbT8uKFxuICAgICAgaXRlbSxcbiAgICAgIHRydWUsXG4gICAgICBwcmltYXJ5Qm9uZUluZGV4LFxuICAgICAgXCJyX3BvaW50XCIsXG4gICAgKTtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCB8fCBnZW5lcmF0aW9uICE9PSB0aGlzLmFwcGVhcmFuY2VHZW5lcmF0aW9uKSByZXR1cm47XG4gICAgaWYgKGl0ZW1Db250YWluZXIpIHtcbiAgICAgIGZvciAoY29uc3QgbWVzaCBvZiBpdGVtQ29udGFpbmVyLm1lc2hlcykge1xuICAgICAgICBjb25zdCBpdGVtSW5zdCA9IG1lc2guY3JlYXRlSW5zdGFuY2UoYGlfcHJpbWFyeV8ke2l0ZW19YCk7XG4gICAgICAgIGl0ZW1JbnN0LnJvdGF0aW9uID0gdGhpcy5yb3RhdGlvbjtcbiAgICAgICAgaXRlbUluc3Quc2V0UGFyZW50KHRoaXMpO1xuICAgICAgICBpdGVtSW5zdC5wb3NpdGlvbiA9IG5ldyBCQUJZTE9OLlZlY3RvcjMoXG4gICAgICAgICAgMCxcbiAgICAgICAgICBoZWxkSXRlbUxvY2FsWU9mZnNldChcbiAgICAgICAgICAgIEJvb2xlYW4oXG4gICAgICAgICAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLmF0dGFjaG1lbnRHZW9tZXRyeVRyYW5zZm9ybXMucl9wb2ludCxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICB0aGlzLnNwYXduU2NhbGUsXG4gICAgICAgICAgKSxcbiAgICAgICAgICAwLFxuICAgICAgICApO1xuICAgICAgICBpdGVtSW5zdC5zY2FsaW5nLnNldEFsbCh0aGlzLnNwYXduU2NhbGUpO1xuICAgICAgICBpdGVtSW5zdC5iYWtlZFZlcnRleEFuaW1hdGlvbk1hbmFnZXIgPSB0aGlzLmVudGl0eUNvbnRhaW5lci5tYW5hZ2VyITtcbiAgICAgICAgaXRlbUluc3QuaW5zdGFuY2VkQnVmZmVycy5iYWtlZFZlcnRleEFuaW1hdGlvblNldHRpbmdzSW5zdGFuY2VkID1cbiAgICAgICAgICB0aGlzLmFuaW1hdGlvbkJ1ZmZlcjtcbiAgICAgICAgaXRlbUluc3Quc2V0RW5hYmxlZCghdGhpcy5oaWRkZW4gJiYgdGhpcy5pc0VuYWJsZWQoKSk7XG4gICAgICAgIHRoaXMucHJpbWFyeU1lc2hlcy5wdXNoKGl0ZW1JbnN0KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgW0VudGl0eV0gTm8gaXRlbSBjb250YWluZXIgZm91bmQgZm9yIHByaW1hcnkgd2VhcG9uICR7aXRlbX1gLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gUGFydGljbGUgc3lzdGVtIHRvIGJlIGltcGxlbWVudGVkIGxhdGVyLiBGb3Igbm93IGxlYXZlIGFzIGJvaWxlcnBsYXRlLlxuICAgIC8vIFJlZmVyZW5jZSBmb3IgZnV0dXJlIGNvZGUgaHR0cHM6Ly9wbGF5Z3JvdW5kLmJhYnlsb25qcy5jb20vP0JhYnlsb25Ub29sa2l0I1QzUUtSViMzMlxuICAgIGlmIChmYWxzZSAmJiB0aGlzLnByaW1hcnlNZXNoZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgeyBWZWN0b3IzLCBHUFVQYXJ0aWNsZVN5c3RlbSwgVGV4dHVyZSB9ID0gQkFCWUxPTjtcbiAgICAgIGNvbnN0IHBhcnRpY2xlU3lzdGVtID0gbmV3IEdQVVBhcnRpY2xlU3lzdGVtKFxuICAgICAgICBcInZhdFBhcnRpY2xlXCIsXG4gICAgICAgIHsgY2FwYWNpdHk6IDI1MCB9LFxuICAgICAgICB0aGlzLnNjZW5lLFxuICAgICAgKTtcblxuICAgICAgbGV0IHRleHR1cmVCdWZmZXIgPVxuICAgICAgICB0aGlzLmVudGl0eUNvbnRhaW5lcj8ubWFuYWdlcj8udGV4dHVyZT8uZ2V0SW50ZXJuYWxUZXh0dXJlKClcbiAgICAgICAgICA/Ll9idWZmZXJWaWV3O1xuICAgICAgaWYgKCF0ZXh0dXJlQnVmZmVyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBcIltFbnRpdHldIE5vIHRleHR1cmUgYnVmZmVyIGZvdW5kIGZvciBWQVQgcGFydGljbGUgc3lzdGVtXCIsXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGlzSGFsZkZsb2F0ID0gdGV4dHVyZUJ1ZmZlciBpbnN0YW5jZW9mIFVpbnQxNkFycmF5O1xuICAgICAgaWYgKGlzSGFsZkZsb2F0KSB7XG4gICAgICAgIHRleHR1cmVCdWZmZXIgPSB0ZXh0dXJlQnVmZmVyIGFzIFVpbnQxNkFycmF5O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dHVyZUJ1ZmZlciA9IHRleHR1cmVCdWZmZXIgYXMgRmxvYXQzMkFycmF5O1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IHNrZWxldG9uIH0gPSB0aGlzLmVudGl0eUNvbnRhaW5lcjtcbiAgICAgIGNvbnN0IG51bUJvbmVzID0gc2tlbGV0b24/LmJvbmVzLmxlbmd0aCA/PyAwO1xuICAgICAgY29uc3QgZmxvYXRzUGVyQm9uZSA9IDE2O1xuICAgICAgY29uc3QgbWFuYWdlciA9IHRoaXMuZW50aXR5Q29udGFpbmVyLm1hbmFnZXIhO1xuICAgICAgY29uc3QgcG9zaXRpb24gPSBuZXcgVmVjdG9yMygwLCAwLCAwKTtcbiAgICAgIGNvbnN0IGJvbmVRdWF0ZXJuaW9uID0gbmV3IEJBQllMT04uUXVhdGVybmlvbigpO1xuICAgICAgY29uc3QgZmxvYXRzUGVyRnJhbWUgPSAobnVtQm9uZXMgKyAxKSAqIGZsb2F0c1BlckJvbmU7XG4gICAgICBjb25zdCBib25lQW5jaG9ycyA9XG4gICAgICAgIHNrZWxldG9uPy5ib25lc1xuICAgICAgICAgIC5maWx0ZXIoKGIpID0+IFtcInJfcG9pbnRcIl0uaW5jbHVkZXMoYi5uYW1lKSlcbiAgICAgICAgICAubWFwKChiKSA9PiBiLmdldEluZGV4KCkgKiBmbG9hdHNQZXJCb25lKSA/PyBbXTtcblxuICAgICAgY29uc3Qgc3RhcnRPZmZzZXRMb2NhbCA9IG5ldyBCQUJZTE9OLlZlY3RvcjMoLTIuNSwgMC40LCAwKTtcbiAgICAgIGNvbnN0IHFBbGlnbiA9IEJBQllMT04uUXVhdGVybmlvbi5Sb3RhdGlvbkF4aXMoXG4gICAgICAgIG5ldyBCQUJZTE9OLlZlY3RvcjMoMCwgMCwgMSksIC8vIFrigJFheGlzXG4gICAgICAgIC1NYXRoLlBJIC8gMiwgLy8g4oCTOTAgZGVncmVlc1xuICAgICAgKTtcbiAgICAgIHRoaXMuc2NlbmUub25CZWZvcmVSZW5kZXJPYnNlcnZhYmxlLmFkZCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGZyb21GcmFtZSA9IHRoaXMuYW5pbWF0aW9uQnVmZmVyLng7XG4gICAgICAgIGNvbnN0IHRvRnJhbWUgPSB0aGlzLmFuaW1hdGlvbkJ1ZmZlci55O1xuICAgICAgICBjb25zdCB0b3RhbCA9IHRvRnJhbWUgLSBmcm9tRnJhbWUgKyAxO1xuICAgICAgICBjb25zdCB0ID0gbWFuYWdlci50aW1lICogdGhpcy5hbmltYXRpb25CdWZmZXIudztcbiAgICAgICAgY29uc3QgYW5jaG9ySWR4ID0gdCAlIGJvbmVBbmNob3JzLmxlbmd0aCB8IDA7XG4gICAgICAgIGNvbnN0IG9mZnNldEJhc2UgPSBib25lQW5jaG9yc1thbmNob3JJZHhdO1xuICAgICAgICBjb25zdCBvZmYgPVxuICAgICAgICAgIChmcm9tRnJhbWUgKyBNYXRoLmZsb29yKHQgJSB0b3RhbCkpICogZmxvYXRzUGVyRnJhbWUgKyBvZmZzZXRCYXNlO1xuXG4gICAgICAgIGNvbnN0IG1hdCA9IEJBQllMT04uTWF0cml4LkZyb21BcnJheSh0ZXh0dXJlQnVmZmVyIGFzIGFueSwgb2ZmKTtcbiAgICAgICAgaWYgKGlzSGFsZkZsb2F0KSB7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAxNjsgaSsrKSB7XG4gICAgICAgICAgICAobWF0Lm0gYXMgYW55KVtpXSA9IEJBQllMT04uRnJvbUhhbGZGbG9hdCh0ZXh0dXJlQnVmZmVyIVtvZmYgKyBpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG1hdC5kZWNvbXBvc2UodW5kZWZpbmVkLCBib25lUXVhdGVybmlvbiwgcG9zaXRpb24pO1xuICAgICAgICBib25lUXVhdGVybmlvbi5tdWx0aXBseUluUGxhY2UocUFsaWduKTtcbiAgICAgICAgY29uc3Qgcm90YXRpb25NYXRyaXggPSBtYXQuZ2V0Um90YXRpb25NYXRyaXgoKTtcbiAgICAgICAgY29uc3Qgcm90YXRlZFVwID0gQkFCWUxPTi5WZWN0b3IzLlRyYW5zZm9ybU5vcm1hbChcbiAgICAgICAgICBzdGFydE9mZnNldExvY2FsLFxuICAgICAgICAgIHJvdGF0aW9uTWF0cml4LFxuICAgICAgICApO1xuICAgICAgICBwb3NpdGlvbi5hZGRJblBsYWNlKHJvdGF0ZWRVcCk7XG4gICAgICB9KTtcbiAgICAgIHBhcnRpY2xlU3lzdGVtLmJsZW5kTW9kZSA9IEJBQllMT04uUGFydGljbGVTeXN0ZW0uQkxFTkRNT0RFX1NUQU5EQVJEO1xuXG4gICAgICBwYXJ0aWNsZVN5c3RlbS5wYXJ0aWNsZVRleHR1cmUgPSBuZXcgVGV4dHVyZShcbiAgICAgICAgXCJodHRwczovL2VxcmVxdWllbS5ibG9iLmNvcmUud2luZG93cy5uZXQvcmVxdWllbS9zcGVsbGVmZmVjdHMvZmlyZWMud2VicFwiLFxuICAgICAgICB0aGlzLnNjZW5lLFxuICAgICAgKTtcbiAgICAgIHBhcnRpY2xlU3lzdGVtLnBhcnRpY2xlVGV4dHVyZSEuaGFzQWxwaGEgPSB0cnVlO1xuICAgICAgcGFydGljbGVTeXN0ZW0ucGFydGljbGVUZXh0dXJlIS5nZXRBbHBoYUZyb21SR0IgPSBmYWxzZTtcbiAgICAgIGNvbnN0IHBhcnRpY2xlTWVzaCA9IG5ldyBCQUJZTE9OLk1lc2goXCJwYXJ0aWNsZU1lc2hcIiwgdGhpcy5zY2VuZSk7XG4gICAgICBwYXJ0aWNsZU1lc2guc2V0UGFyZW50KHRoaXMpO1xuICAgICAgcGFydGljbGVNZXNoLmlzUGlja2FibGUgPSBmYWxzZTtcbiAgICAgIHBhcnRpY2xlTWVzaC5wb3NpdGlvbiA9IHBvc2l0aW9uO1xuICAgICAgcGFydGljbGVNZXNoLnJvdGF0aW9uUXVhdGVybmlvbiA9IGJvbmVRdWF0ZXJuaW9uO1xuICAgICAgcGFydGljbGVTeXN0ZW0uZW1pdHRlciA9IHBhcnRpY2xlTWVzaDtcblxuICAgICAgcGFydGljbGVTeXN0ZW0uaXNBbmltYXRpb25TaGVldEVuYWJsZWQgPSB0cnVlO1xuICAgICAgcGFydGljbGVTeXN0ZW0uc3ByaXRlQ2VsbENoYW5nZVNwZWVkID0gMTsgLy8gU3BlZWQgb2YgYW5pbWF0aW9uXG4gICAgICBwYXJ0aWNsZVN5c3RlbS5zdGFydFNwcml0ZUNlbGxJRCA9IDA7XG4gICAgICBwYXJ0aWNsZVN5c3RlbS5lbmRTcHJpdGVDZWxsSUQgPSAxNTsgLy8gZGVwZW5kcyBvbiB5b3VyIHNoZWV0IGxheW91dFxuICAgICAgcGFydGljbGVTeXN0ZW0uc3ByaXRlQ2VsbFdpZHRoID0gNjQ7IC8vIHBpeGVsIHdpZHRoIG9mIGEgc2luZ2xlIHNwcml0ZSBmcmFtZVxuICAgICAgcGFydGljbGVTeXN0ZW0uc3ByaXRlQ2VsbEhlaWdodCA9IDY0OyAvLyBwaXhlbCBoZWlnaHQgb2YgYSBzaW5nbGUgc3ByaXRlIGZyYW1lXG4gICAgICBwYXJ0aWNsZVN5c3RlbS5zcHJpdGVDZWxsTG9vcCA9IHRydWU7IC8vIG9wdGlvbmFsbHkgbG9vcFxuXG4gICAgICAvLyBtYXliZSB1c2UgdGhpcyBpbnN0ZWFkIHRvIHNwYXduIHBhcnRpY2xlcyBpbiBhIGJveFxuICAgICAgY29uc3QgYm94RW1pdHRlciA9IHBhcnRpY2xlU3lzdGVtLmNyZWF0ZUN5bGluZGVyRW1pdHRlcigwLjIsIDMsIDEsIDAuNSk7XG4gICAgICBwYXJ0aWNsZVN5c3RlbS5wYXJ0aWNsZUVtaXR0ZXJUeXBlID0gYm94RW1pdHRlcjtcbiAgICAgIHBhcnRpY2xlU3lzdGVtLm1pblNpemUgPSAwLjI1O1xuICAgICAgcGFydGljbGVTeXN0ZW0ubWF4U2l6ZSA9IDAuNzU7XG4gICAgICBwYXJ0aWNsZVN5c3RlbS5taW5MaWZlVGltZSA9IDAuMjtcbiAgICAgIHBhcnRpY2xlU3lzdGVtLm1heExpZmVUaW1lID0gMS41O1xuICAgICAgcGFydGljbGVTeXN0ZW0uYmlsbGJvYXJkTW9kZSA9IEJBQllMT04uUGFydGljbGVTeXN0ZW0uQklMTEJPQVJETU9ERV9BTEw7XG4gICAgICBwYXJ0aWNsZVN5c3RlbS5lbWl0UmF0ZSA9IDU1O1xuICAgICAgcGFydGljbGVTeXN0ZW0ubWF4QW5ndWxhclNwZWVkID0gTWF0aC5QSSAvIDI7XG4gICAgICBwYXJ0aWNsZVN5c3RlbS5taW5FbWl0UG93ZXIgPSAwLjAxO1xuICAgICAgcGFydGljbGVTeXN0ZW0ubWF4RW1pdFBvd2VyID0gMC4xO1xuICAgICAgcGFydGljbGVTeXN0ZW0udXBkYXRlU3BlZWQgPSAwLjAyO1xuXG4gICAgICBwYXJ0aWNsZVN5c3RlbS5zdGFydCgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlUGFydGljbGVFZmZlY3RzKCkge31cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZVNlY29uZGFyeSgpIHtcbiAgICBjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5hcHBlYXJhbmNlR2VuZXJhdGlvbjtcbiAgICBsZXQgaXRlbSA9IFwiXCI7XG4gICAgZm9yIChjb25zdCBtZXNoIG9mIHRoaXMuc2Vjb25kYXJ5TWVzaGVzKSB7XG4gICAgICBtZXNoLmRpc3Bvc2UoKTtcbiAgICB9XG4gICAgdGhpcy5zZWNvbmRhcnlNZXNoZXMgPSBbXTtcbiAgICBsZXQgZGVmYXVsdFBvaW50ID0gXCJzaGllbGRfcG9pbnRcIjtcblxuICAgIGlmICh0aGlzLmlzUGxheWVyKSB7XG4gICAgICBjb25zdCBwbGF5ZXJJdGVtID0gdGhpcy5lcXVpcHBlZEl0ZW0oSW52ZW50b3J5U2xvdC5TZWNvbmRhcnkpO1xuICAgICAgaWYgKHBsYXllckl0ZW0gJiYgcGxheWVySXRlbS5pdGVtdHlwZSAhPT0gOCkge1xuICAgICAgICBkZWZhdWx0UG9pbnQgPSBcImxfcG9pbnRcIjtcbiAgICAgIH1cbiAgICAgIGl0ZW0gPSBwbGF5ZXJJdGVtPy5pZGZpbGUgPz8gXCJcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2Vjb25kYXJ5ID0gKHRoaXMuc3Bhd24gYXMgU3Bhd24pLmVxdWlwbWVudD8uc2Vjb25kYXJ5ID8/IDA7XG4gICAgICBpZiAoc2Vjb25kYXJ5KSB7XG4gICAgICAgIGl0ZW0gPSBgSVQke3NlY29uZGFyeX1gO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoaXRlbS5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiW0VudGl0eV0gVXBkYXRpbmcgc2Vjb25kYXJ5IHdlYXBvbiBtb2RlbFwiLCBpdGVtKTtcbiAgICAgIGNvbnN0IHNlY29uZGFyeUJvbmVJbmRleCA9XG4gICAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyPy5hdHRhY2htZW50Qm9uZUluZGljZXNbZGVmYXVsdFBvaW50XTtcbiAgICAgIGlmIChzZWNvbmRhcnlCb25lSW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBpdGVtQ29udGFpbmVyID0gYXdhaXQgdGhpcy5lbnRpdHlDb250YWluZXI/LmdldEl0ZW0/LihcbiAgICAgICAgaXRlbSxcbiAgICAgICAgZGVmYXVsdFBvaW50ID09PSBcImxfcG9pbnRcIixcbiAgICAgICAgc2Vjb25kYXJ5Qm9uZUluZGV4LFxuICAgICAgICBkZWZhdWx0UG9pbnQsXG4gICAgICApO1xuICAgICAgaWYgKHRoaXMuZGlzcG9zZWQgfHwgZ2VuZXJhdGlvbiAhPT0gdGhpcy5hcHBlYXJhbmNlR2VuZXJhdGlvbikgcmV0dXJuO1xuICAgICAgaWYgKGl0ZW1Db250YWluZXIpIHtcbiAgICAgICAgZm9yIChjb25zdCBtZXNoIG9mIGl0ZW1Db250YWluZXIubWVzaGVzKSB7XG4gICAgICAgICAgY29uc3QgaXRlbUluc3QgPSBtZXNoLmNyZWF0ZUluc3RhbmNlKGBpX3NlY29uZGFyeV8ke2l0ZW19YCk7XG5cbiAgICAgICAgICBpdGVtSW5zdC5zZXRQYXJlbnQodGhpcyk7XG4gICAgICAgICAgaXRlbUluc3QucG9zaXRpb24gPSBuZXcgQkFCWUxPTi5WZWN0b3IzKFxuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIGhlbGRJdGVtTG9jYWxZT2Zmc2V0KFxuICAgICAgICAgICAgICBCb29sZWFuKFxuICAgICAgICAgICAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLmF0dGFjaG1lbnRHZW9tZXRyeVRyYW5zZm9ybXNbZGVmYXVsdFBvaW50XSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgdGhpcy5zcGF3blNjYWxlLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpdGVtSW5zdC5yb3RhdGlvbiA9IHRoaXMucm90YXRpb247XG4gICAgICAgICAgaXRlbUluc3Quc2NhbGluZy5zZXRBbGwodGhpcy5zcGF3blNjYWxlKTtcblxuICAgICAgICAgIGl0ZW1JbnN0LmJha2VkVmVydGV4QW5pbWF0aW9uTWFuYWdlciA9XG4gICAgICAgICAgICB0aGlzLmVudGl0eUNvbnRhaW5lci5tYW5hZ2VyITtcbiAgICAgICAgICBpdGVtSW5zdC5pbnN0YW5jZWRCdWZmZXJzLmJha2VkVmVydGV4QW5pbWF0aW9uU2V0dGluZ3NJbnN0YW5jZWQgPVxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25CdWZmZXI7XG4gICAgICAgICAgaXRlbUluc3Quc2V0RW5hYmxlZCghdGhpcy5oaWRkZW4gJiYgdGhpcy5pc0VuYWJsZWQoKSk7XG4gICAgICAgICAgdGhpcy5zZWNvbmRhcnlNZXNoZXMucHVzaChpdGVtSW5zdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgW0VudGl0eV0gTm8gaXRlbSBjb250YWluZXIgZm91bmQgZm9yIHNlY29uZGFyeSBpdGVtICR7aXRlbX1gLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyB1cGRhdGVNb2RlbFRleHR1cmVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuYXBwZWFyYW5jZVVwZGF0ZSA9IHRoaXMuYXBwZWFyYW5jZVVwZGF0ZVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJbRW50aXR5XSBQcmV2aW91cyBhcHBlYXJhbmNlIHVwZGF0ZSBmYWlsZWRcIiwgZXJyb3IpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMudXBkYXRlTW9kZWxUZXh0dXJlc05vdygpKTtcbiAgICByZXR1cm4gdGhpcy5hcHBlYXJhbmNlVXBkYXRlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVNb2RlbFRleHR1cmVzTm93KCkge1xuICAgIGlmICh0aGlzLmRpc3Bvc2VkIHx8ICF0aGlzLm1lc2hJbnN0YW5jZSkge1xuICAgICAgY29uc29sZS53YXJuKFwiW0VudGl0eV0gTm8gbWVzaCBpbnN0YW5jZSBmb3VuZCBmb3IgdGV4dHVyZSB1cGRhdGVcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgdGhpbkluc3RhbmNlSW5kZXggfSA9IHRoaXMubWVzaEluc3RhbmNlO1xuICAgIGNvbnN0IGhlYWRNb2RlbCA9IHRoaXMuaGVhZE1vZGVsKCk7XG4gICAgY29uc3QgaGFzUm9iZSA9IHRoaXMucm9iZU1vZGVsKCkgIT09IFwiXCI7XG4gICAgZm9yIChjb25zdCBbXG4gICAgICBzdWJtZXNoSW5kZXgsXG4gICAgICByYW5nZSxcbiAgICBdIG9mIHRoaXMuZW50aXR5Q29udGFpbmVyLnN1Ym1lc2hSYW5nZXMuZW50cmllcygpKSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIGlzUm9iZSxcbiAgICAgICAgaXNIZWxtLFxuICAgICAgICBhdGxhc0FycmF5LFxuICAgICAgICBtZXRhZGF0YTogeyB0ZXhOdW0sIHZhcmlhdGlvbiwgcGllY2UgfSxcbiAgICAgIH0gPSByYW5nZTtcblxuICAgICAgbGV0IGlkeCA9IHRoaXMuZ2V0VGV4dHVyZUluZGV4KFxuICAgICAgICBuYW1lLFxuICAgICAgICAhdGhpcy5pc1BsYXllciA/ICh0aGlzLnNwYXduIGFzIFNwYXduKS5lcXVpcENoZXN0IDogMCxcbiAgICAgICAgYXRsYXNBcnJheSxcbiAgICAgICk7XG4gICAgICBsZXQgaWR4U2V0ID0gZmFsc2U7XG4gICAgICBsZXQgcjogbnVtYmVyID0gMSxcbiAgICAgICAgZzogbnVtYmVyID0gMSxcbiAgICAgICAgYjogbnVtYmVyID0gMTtcblxuICAgICAgaWYgKGhhc1JvYmUpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIFtcbiAgICAgICAgICAgIE1hdGVyaWFsUHJlZml4ZXMuQXJtcyxcbiAgICAgICAgICAgIE1hdGVyaWFsUHJlZml4ZXMuQ2hlc3QsXG4gICAgICAgICAgICBNYXRlcmlhbFByZWZpeGVzLkxlZ3MsXG4gICAgICAgICAgICBNYXRlcmlhbFByZWZpeGVzLldyaXN0cyxcbiAgICAgICAgICBdLmluY2x1ZGVzKHBpZWNlKSB8fFxuICAgICAgICAgIChNYXRlcmlhbFByZWZpeGVzLkZlZXQgPT09IHBpZWNlICYmIHRleE51bSA9PT0gXCIwMVwiKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZHggPSAtMTtcbiAgICAgICAgICBpZHhTZXQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocGllY2UgPT09IE1hdGVyaWFsUHJlZml4ZXMuRmFjZSkge1xuICAgICAgICBpZiAodmFyaWF0aW9uICE9PSBoZWFkTW9kZWwpIHtcbiAgICAgICAgICBpZHggPSAtMTtcbiAgICAgICAgICBpZHhTZXQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1JvYmUgJiYgIWhhc1JvYmUpIHtcbiAgICAgICAgaWR4ID0gLTE7XG4gICAgICAgIGlkeFNldCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGxldCBhc3NvY2lhdGVkSXRlbTogTnVsbGFibGVJdGVtSW5zdGFuY2UgPSBudWxsO1xuXG4gICAgICBjb25zdCBtYXRjaGluZ0ludmVudG9yeVNsb3QgPSBJbnZlbnRvcnlTbG90VGV4dHVyZXNbcGllY2UgYXMgc3RyaW5nXTtcbiAgICAgIGlmICh0aGlzLmlzUGxheWVyICYmIG1hdGNoaW5nSW52ZW50b3J5U2xvdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFzc29jaWF0ZWRJdGVtID0gdGhpcy5lcXVpcHBlZEl0ZW0obWF0Y2hpbmdJbnZlbnRvcnlTbG90KTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgbWF0Y2hpbmdJbnZlbnRvcnlTbG90ICYmXG4gICAgICAgICFpZHhTZXQgJiZcbiAgICAgICAgdGhpcy5pc0h1bWFub2lkICYmXG4gICAgICAgICEodGhpcy5zcGF3biBhcyBTcGF3bikuaXNOcGNcbiAgICAgICkge1xuICAgICAgICBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgICAgIC8vIFRPRE8gaGFuZGxlIHBhcnRpYWwgdGV4dHVyZSBtYXBwaW5nIHdpdGggZmFjZS9oZWxtZXQgbGF0ZXJcbiAgICAgICAgICBpZiAoYXNzb2NpYXRlZEl0ZW0pIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gYXNzb2NpYXRlZEl0ZW0uY29sb3IgPj4+IDA7XG4gICAgICAgICAgICBjb25zdCByZ2IgPSBjb2xvciAmIDB4ZmZmZmZmO1xuICAgICAgICAgICAgaWYgKHJnYiAhPT0gMCkge1xuICAgICAgICAgICAgICByID0gKChyZ2IgPj4+IDE2KSAmIDB4ZmYpIC8gMjU1O1xuICAgICAgICAgICAgICBnID0gKChyZ2IgPj4+IDgpICYgMHhmZikgLyAyNTU7XG4gICAgICAgICAgICAgIGIgPSAocmdiICYgMHhmZikgLyAyNTU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZHggPSB0aGlzLmdldFRleHR1cmVJbmRleChcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgYXNzb2NpYXRlZEl0ZW0ubWF0ZXJpYWwsXG4gICAgICAgICAgICAgIGF0bGFzQXJyYXksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWR4U2V0ID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVE9ETyBnZXQgZXF1aXBtZW50VGludCBtYXBwZWQgb3V0XG4gICAgICAgICAgLy8gY29uc3Qgc3Bhd24gPSB0aGlzLnNwYXduIGFzIFNwYXduO1xuICAgICAgICAgIC8vIGlkeCA9IHRoaXMuZ2V0VGV4dHVyZUluZGV4KG5hbWUsIHNwYXduLmVxdWlwbWVudFtUZXh0dXJlUHJvZmlsZU1hcFtwaWVjZV1dID8/IDApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIERyaXZlIHRleHR1cmUgZnJvbSBlcXVpcG1lbnQgZm9yIFBDIGh1bWFub2lkc1xuICAgICAgaWYgKFxuICAgICAgICAhaWR4U2V0ICYmXG4gICAgICAgIHBpZWNlID09PSBNYXRlcmlhbFByZWZpeGVzLkZhY2UgJiZcbiAgICAgICAgdGhpcy51c2VzUGxheWVyRmFjZVRleHR1cmVzXG4gICAgICApIHtcbiAgICAgICAgaWR4ID0gdGhpcy5nZXRUZXh0dXJlSW5kZXgobmFtZSwgdGhpcy5zcGF3bi5mYWNlLCBhdGxhc0FycmF5KTtcbiAgICAgICAgciA9IDE7XG4gICAgICAgIGcgPSAxO1xuICAgICAgICBiID0gMTtcbiAgICAgICAgaWR4U2V0ID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1JvYmUpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5ZXIpIHtcbiAgICAgICAgICBhc3NvY2lhdGVkSXRlbSA9IHRoaXMuZXF1aXBwZWRJdGVtKEludmVudG9yeVNsb3QuQ2hlc3QpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzSGVsbSkge1xuICAgICAgICBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgICAgIGFzc29jaWF0ZWRJdGVtID0gdGhpcy5lcXVpcHBlZEl0ZW0oSW52ZW50b3J5U2xvdC5IZWFkKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIWlkeFNldCkge1xuICAgICAgICBjb25zdCBkZWZhdWx0TWF0ZXJpYWwgPSBpc1JvYmUgPyAxMCA6IDA7XG4gICAgICAgIGxldCBtYXRlcmlhbCA9IGRlZmF1bHRNYXRlcmlhbDtcbiAgICAgICAgaWYgKCF0aGlzLmlzUGxheWVyKSB7XG4gICAgICAgICAgY29uc3Qgc3Bhd24gPSB0aGlzLnNwYXduIGFzIFNwYXduO1xuICAgICAgICAgIG1hdGVyaWFsID1cbiAgICAgICAgICAgIGhhc1JvYmUgJiYgIWlzUm9iZVxuICAgICAgICAgICAgICA/IDBcbiAgICAgICAgICAgICAgOiBzcGF3bi5pc05wY1xuICAgICAgICAgICAgICAgID8gc3Bhd24uZXF1aXBDaGVzdFxuICAgICAgICAgICAgICAgIDogKHNwYXduLmVxdWlwbWVudD8uY2hlc3QgPz8gc3Bhd24uZXF1aXBDaGVzdCA/PyAwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtYXRlcmlhbCA9IGFzc29jaWF0ZWRJdGVtPy5tYXRlcmlhbCA/PyBkZWZhdWx0TWF0ZXJpYWw7XG4gICAgICAgIH1cblxuICAgICAgICBpZHggPSB0aGlzLmdldFRleHR1cmVJbmRleChuYW1lLCBtYXRlcmlhbCwgYXRsYXNBcnJheSk7XG4gICAgICB9IGVsc2UgaWYgKCFpZHhTZXQpIHtcbiAgICAgICAgaWR4ID0gdGhpcy5nZXRUZXh0dXJlSW5kZXgobmFtZSwgMSwgYXRsYXNBcnJheSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHggPSBzdWJtZXNoSW5kZXg7XG4gICAgICBjb25zdCB5ID0gdGhpbkluc3RhbmNlSW5kZXg7XG5cbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLnNoYWRvUG9vbC5zZXRBcHBlYXJhbmNlKFxuICAgICAgICB5LFxuICAgICAgICB4LFxuICAgICAgICB0aGlzLmVudGl0eUNvbnRhaW5lci5zdWJtZXNoUmFuZ2VzLnNpemUsXG4gICAgICAgIGlkeCxcbiAgICAgICAgcixcbiAgICAgICAgZyxcbiAgICAgICAgYixcbiAgICAgICk7XG4gICAgfVxuICAgIHRoaXMudXBkYXRlTWF0ZXJpYWxCdWZmZXJzKCk7XG4gICAgdGhpcy5zZXRSb3RhdGlvbih0aGlzLmxhc3RZYXcgKyAwLjAwMDEpOyAvLyBSZWFwcGx5IGxhc3QgeWF3IHRvIGVuc3VyZSBjb3JyZWN0IG9yaWVudGF0aW9uIGFmdGVyIHRleHR1cmUgdXBkYXRlXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMudXBkYXRlUHJpbWFyeSgpLCB0aGlzLnVwZGF0ZVNlY29uZGFyeSgpXSk7XG4gIH1cblxuICBwcml2YXRlIGVxdWlwcGVkSXRlbShzbG90OiBJbnZlbnRvcnlTbG90KTogTnVsbGFibGVJdGVtSW5zdGFuY2Uge1xuICAgIGlmICh0aGlzLml0ZW1SZXNvbHZlcikgcmV0dXJuIHRoaXMuaXRlbVJlc29sdmVyKHNsb3QpO1xuICAgIGNvbnN0IGl0ZW1zID0gKHRoaXMuc3Bhd24gYXMgUGxheWVyUHJvZmlsZSkuaW52ZW50b3J5SXRlbXMgPz8gW107XG4gICAgcmV0dXJuIChcbiAgICAgIGl0ZW1zLmZpbmQoKGl0ZW0pID0+IGl0ZW0uc2xvdCA9PT0gc2xvdCAmJiBpdGVtLmJhZ1Nsb3QgPT09IC0xKSA/P1xuICAgICAgaXRlbXMuZmluZCgoaXRlbSkgPT4gaXRlbS5zbG90ID09PSBzbG90ICYmIGl0ZW0uYmFnU2xvdCA9PT0gMCkgPz9cbiAgICAgIG51bGxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFBoeXNpY3MoKSB7XG4gICAgLy8gR2V0IEJCIGZvciBwaHlzaWNzIGNhcHN1bGUgaGVpZ2h0XG4gICAgY29uc3QgYm91bmRpbmdCb3ggPSB0aGlzLmVudGl0eUNvbnRhaW5lci5ib3VuZGluZ0JveDtcbiAgICBjb25zdCB5T2Zmc2V0ID0gMDsgLy8gdGhpcy5lbnRpdHlDb250YWluZXIuYm91bmRpbmdCb3g/LnlPZmZzZXQgPz8gMDtcbiAgICBsZXQgY2Fwc3VsZUhlaWdodCA9IHRoaXMucmFjZURhdGFFbnRyeT8uaGVpZ2h0ID8/IDY7XG4gICAgaWYgKGJvdW5kaW5nQm94KSB7XG4gICAgICBjb25zdCBtaW4gPSBuZXcgQkFCWUxPTi5WZWN0b3IzKFxuICAgICAgICBib3VuZGluZ0JveC5taW5bMF0sXG4gICAgICAgIGJvdW5kaW5nQm94Lm1pblsxXSxcbiAgICAgICAgYm91bmRpbmdCb3gubWluWzJdLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1heCA9IG5ldyBCQUJZTE9OLlZlY3RvcjMoXG4gICAgICAgIGJvdW5kaW5nQm94Lm1heFswXSxcbiAgICAgICAgYm91bmRpbmdCb3gubWF4WzFdLFxuICAgICAgICBib3VuZGluZ0JveC5tYXhbMl0sXG4gICAgICApO1xuICAgICAgY29uc3QgZXh0ZW50cyA9IG1heC5zdWJ0cmFjdChtaW4pLnNjYWxlKDAuNSk7XG4gICAgICBjYXBzdWxlSGVpZ2h0ID0gZXh0ZW50cy55ICogMiAqIHRoaXMuc3Bhd25TY2FsZTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgW0VudGl0eV0gTm8gYm91bmRpbmcgYm94IGZvdW5kIGZvciAke3RoaXMuZW50aXR5Q29udGFpbmVyLm1vZGVsfSwgdXNpbmcgZGVmYXVsdCBjYXBzdWxlIGhlaWdodGAsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFNldHVwIHBoeXNpY3MgYm9keSB3aXRoIGNhcHN1bGUgc2hhcGVcbiAgICBjb25zdCBjYXBzdWxlUmFkaXVzID0gMi4wICogdGhpcy5zcGF3blNjYWxlOyAvLyBBZGp1c3QgcmFkaXVzIGJhc2VkIG9uIHNjYWxlXG4gICAgY29uc3QgcG9pbnRBID0gbmV3IEJBQllMT04uVmVjdG9yMygwLCBjYXBzdWxlSGVpZ2h0IC8gMiAtIGNhcHN1bGVSYWRpdXMsIDApO1xuICAgIGNvbnN0IHBvaW50QiA9IG5ldyBCQUJZTE9OLlZlY3RvcjMoXG4gICAgICAwLFxuICAgICAgLShjYXBzdWxlSGVpZ2h0IC8gMiAtIGNhcHN1bGVSYWRpdXMpLFxuICAgICAgMCxcbiAgICApO1xuICAgIHBvaW50QS55ICs9IHlPZmZzZXQgLyAyO1xuICAgIHBvaW50Qi55ICs9IHlPZmZzZXQgLyAyO1xuICAgIC8vIFNsaWdodCBhZGp1c3RtZW50IHRvIGVuc3VyZSB0aGUgY2Fwc3VsZSBpcyBjZW50ZXJlZFxuICAgIC8vIHBvaW50QS55IC09IDAuNTtcbiAgICAvLyBwb2ludEIueSAtPSAwLjM7XG5cbiAgICBpZiAobW9kZWxZT2Zmc2V0W3RoaXMuZW50aXR5Q29udGFpbmVyLm1vZGVsXSkge1xuICAgICAgcG9pbnRCLnkgKz0gbW9kZWxZT2Zmc2V0W3RoaXMuZW50aXR5Q29udGFpbmVyLm1vZGVsXTtcbiAgICB9XG5cbiAgICB0aGlzLmNhcHN1bGVTaGFwZSA9IG5ldyBCQUJZTE9OLlBoeXNpY3NTaGFwZUNhcHN1bGUoXG4gICAgICBwb2ludEEsXG4gICAgICBwb2ludEIsXG4gICAgICBjYXBzdWxlUmFkaXVzLFxuICAgICAgdGhpcy5zY2VuZSxcbiAgICApO1xuICAgIHRoaXMuY2Fwc3VsZVNoYXBlLm1hdGVyaWFsLmZyaWN0aW9uID0gMS4wO1xuICAgIHRoaXMuY2Fwc3VsZVNoYXBlLm1hdGVyaWFsLnJlc3RpdHV0aW9uID0gMDtcbiAgICAvLyB0aGlzLm5vZGVDb250YWluZXIgPSBuZXcgQkFCWUxPTi5UcmFuc2Zvcm1Ob2RlKFxuICAgIC8vICAgYCR7dGhpcy5zcGF3bi5uYW1lfWAsXG4gICAgLy8gICB0aGlzLnNjZW5lLFxuICAgIC8vICk7XG4gICAgLy8gaWYgKCF0aGlzLmlzUGxheWVyKSB7XG4gICAgLy8gICB0aGlzLm5vZGVDb250YWluZXIucGFyZW50ID0gdGhpcztcbiAgICAvLyB9IGVsc2Uge1xuICAgIC8vICAgdGhpcy5ub2RlQ29udGFpbmVyLnBhcmVudCA9IHRoaXMucGFyZW50O1xuICAgIC8vIH1cbiAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5zcGF3blBvc2l0aW9uO1xuICAgIHRoaXMucGh5c2ljc0JvZHkgPSBuZXcgQkFCWUxPTi5QaHlzaWNzQm9keShcbiAgICAgIHRoaXMsIC8vIFVzZSB0aGUgVHJhbnNmb3JtTm9kZSBhcyB0aGUgcm9vdFxuICAgICAgQkFCWUxPTi5QaHlzaWNzTW90aW9uVHlwZS5EWU5BTUlDLFxuICAgICAgZmFsc2UsXG4gICAgICB0aGlzLnNjZW5lLFxuICAgICk7XG4gICAgLy8gTG9jayBhbmd1bGFyIG1vdGlvbiB0byBwcmV2ZW50IHBoeXNpY3MtaW5kdWNlZCByb3RhdGlvblxuICAgIHRoaXMucGh5c2ljc0JvZHkuc2V0QW5ndWxhclZlbG9jaXR5KEJBQllMT04uVmVjdG9yMy5aZXJvKCkpO1xuICAgIHRoaXMucGh5c2ljc0JvZHkuc2V0QW5ndWxhckRhbXBpbmcoMS4wKTsgLy8gSGlnaCBkYW1waW5nIHRvIHJlc2lzdCByb3RhdGlvblxuICAgIHRoaXMucGh5c2ljc0JvZHkuc2V0TGluZWFyRGFtcGluZygwLjkpO1xuXG4gICAgdGhpcy5waHlzaWNzQm9keS5zaGFwZSA9IHRoaXMuY2Fwc3VsZVNoYXBlO1xuICAgIHRoaXMucGh5c2ljc0JvZHkuc2V0TWFzc1Byb3BlcnRpZXMoe1xuICAgICAgbWFzczogNSxcbiAgICAgIGluZXJ0aWE6IG5ldyBCQUJZTE9OLlZlY3RvcjMoMCwgMCwgMCksXG4gICAgfSk7XG4gIH1cbiAgcHVibGljIGFzeW5jIGluc3RhbnRpYXRlTmFtZXBsYXRlKHRleHRMaW5lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgIHRoaXMubmFtZXBsYXRlTGluZXMgPSBbLi4udGV4dExpbmVzXTtcbiAgfVxuICBwcml2YXRlIGxhc3RQb3NpdGlvbjogQkpTLlZlY3RvcjMgPSBuZXcgQkFCWUxPTi5WZWN0b3IzKDAsIDAsIDApO1xuICBwcml2YXRlIGxhc3RSb3RhdGlvblF1YXRlcm5pb246IEJKUy5RdWF0ZXJuaW9uID0gbmV3IEJBQllMT04uUXVhdGVybmlvbihcbiAgICAwLFxuICAgIDAsXG4gICAgMCxcbiAgICAxLFxuICApO1xuICBwdWJsaWMgc3luY01hdHJpeCgpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc3Bhd25Qb3NpdGlvbiB8fCAhdGhpcy5yb3RhdGlvblF1YXRlcm5pb24gfHwgIXRoaXMubWVzaEluc3RhbmNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHRoaXMubGFzdFBvc2l0aW9uLmVxdWFscyh0aGlzLnNwYXduUG9zaXRpb24pICYmXG4gICAgICB0aGlzLmxhc3RSb3RhdGlvblF1YXRlcm5pb24uZXF1YWxzKHRoaXMucm90YXRpb25RdWF0ZXJuaW9uKVxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxhc3RQb3NpdGlvbi5jb3B5RnJvbSh0aGlzLnNwYXduUG9zaXRpb24pO1xuICAgIHRoaXMubGFzdFJvdGF0aW9uUXVhdGVybmlvbi5jb3B5RnJvbSh0aGlzLnJvdGF0aW9uUXVhdGVybmlvbiEpO1xuICAgIHRoaXMuZW50aXR5Q29udGFpbmVyLnNoYWRvUG9vbC5zZXRUcmFuc2Zvcm0oXG4gICAgICB0aGlzLm1lc2hJbnN0YW5jZS5hY3RvcixcbiAgICAgIHRoaXMuc3Bhd25Qb3NpdGlvbixcbiAgICAgIHRoaXMucm90YXRpb25RdWF0ZXJuaW9uLFxuICAgICAgdGhpcy5zcGF3blNjYWxlLFxuICAgICk7XG4gICAgLy8gVGhlIHJlbmRlciB0cmFuc2Zvcm0gaXMgbm93IHJlYWQgZGlyZWN0bHkgZnJvbSB0aGUgU2hhZG8gYXJlbmEgYnkgdGhlXG4gICAgLy8gZW50aXR5IHNoYWRlci4gTm8gQmFieWxvbiBtYXRyaXgtYnVmZmVyIGNvcHkgaXMgcmVxdWlyZWQgaGVyZS5cbiAgfVxuXG4gIHB1YmxpYyBjaGVja0JlbG93QW5kUmVwb3NpdGlvbigpIHtcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzLnBoeXNpY3NQbHVnaW47XG4gICAgY29uc3QgcG9zaXRpb24gPSB0aGlzLnNwYXduUG9zaXRpb247XG4gICAgaWYgKCFwb3NpdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByYXlPcmlnaW4gPSBuZXcgQkFCWUxPTi5WZWN0b3IzKHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnopO1xuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBCQUJZTE9OLlBoeXNpY3NSYXljYXN0UmVzdWx0KCk7XG5cbiAgICAvLyBEb3dud2FyZCByYXljYXN0XG4gICAgY29uc3QgZG93bkVuZCA9IHJheU9yaWdpbi5hZGQobmV3IEJBQllMT04uVmVjdG9yMygwLCAtMTAwMCwgMCkpOyAvLyAxMCB1bml0cyBkb3duXG4gICAgcGx1Z2luLnJheWNhc3QocmF5T3JpZ2luLCBkb3duRW5kLCByZXN1bHQpO1xuXG4gICAgaWYgKCFyZXN1bHQuaGFzSGl0KSB7XG4gICAgICAvLyBObyBzdGF0aWMgYm9keSBiZWxvdywgY2FzdCB1cHdhcmRcbiAgICAgIGNvbnN0IHVwRW5kID0gcmF5T3JpZ2luLmFkZChuZXcgQkFCWUxPTi5WZWN0b3IzKDAsIDEwMDAwLCAwKSk7IC8vIDEwMCB1bml0cyB1cFxuICAgICAgcmVzdWx0LnJlc2V0KCk7XG4gICAgICBwbHVnaW4ucmF5Y2FzdChyYXlPcmlnaW4sIHVwRW5kLCByZXN1bHQpO1xuXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3VsdC5oYXNIaXQgJiZcbiAgICAgICAgcmVzdWx0LmJvZHk/Lm1vdGlvblR5cGUgPT09IEJBQllMT04uUGh5c2ljc01vdGlvblR5cGUuU1RBVElDXG4gICAgICApIHtcbiAgICAgICAgLy8gUmVwb3NpdGlvbiBwbGF5ZXIganVzdCBiZWxvdyB0aGUgaGl0IHBvaW50XG4gICAgICAgIGNvbnN0IGhpdFBvaW50ID0gcmVzdWx0LmhpdFBvaW50O1xuICAgICAgICBjb25zdCBuZXdQb3NpdGlvbiA9IG5ldyBCQUJZTE9OLlZlY3RvcjMoXG4gICAgICAgICAgaGl0UG9pbnQueCxcbiAgICAgICAgICBoaXRQb2ludC55IC0gMC4xLFxuICAgICAgICAgIGhpdFBvaW50LnosXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuc2V0UG9zaXRpb24obmV3UG9zaXRpb24ueCwgbmV3UG9zaXRpb24ueSArIDUsIG5ld1Bvc2l0aW9uLnopO1xuICAgICAgICBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtFbnRpdHldIFJlcG9zaXRpb25lZCB0byAke25ld1Bvc2l0aW9uLnRvU3RyaW5nKCl9IGR1ZSB0byBubyBncm91bmQgYmVsb3dgLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodGhpcy5pc1BsYXllcikge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltFbnRpdHldIFJlcG9zaXRpb25lZCB0byBTYWZlIFBvaW50IGR1ZSB0byBubyBncm91bmQgYmVsb3dcIixcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5zZXRQb3NpdGlvbig1LCA1LCA1KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc2V0RmFjZSh2YXJpYXRpb246IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghdGhpcy51c2VzUGxheWVyRmFjZVRleHR1cmVzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuc3Bhd24uZmFjZSA9IHZhcmlhdGlvbjtcbiAgICB0aGlzLnVwZGF0ZU1vZGVsVGV4dHVyZXMoKTtcbiAgfVxuXG4gIHB1YmxpYyBjdXJyZW50QW5pbWF0aW9uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHVibGljIGFuaW1hdGlvblRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgYm9vbGVhbiA9IGZhbHNlO1xuICBwdWJsaWMgcXVldWVkQW5pbWF0aW9uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIGNvbXB1dGVPZmZzZXQoXG4gICAgZnJvbUZyYW1lOiBudW1iZXIsXG4gICAgdG9GcmFtZTogbnVtYmVyLFxuICAgIHRpbWU6IG51bWJlcixcbiAgICBmcHM6IG51bWJlciA9IDYwLFxuICApOiBudW1iZXIge1xuICAgIGNvbnN0IHRvdGFsRnJhbWVzID0gdG9GcmFtZSAtIGZyb21GcmFtZSArIDE7XG4gICAgY29uc3QgdCA9ICh0aW1lICogZnBzKSAvIHRvdGFsRnJhbWVzO1xuICAgIGNvbnN0IGZyYW1lID0gTWF0aC5mbG9vcigodCAtIE1hdGguZmxvb3IodCkpICogdG90YWxGcmFtZXMpO1xuICAgIHJldHVybiB0b3RhbEZyYW1lcyAtIGZyYW1lO1xuICB9XG4gIHB1YmxpYyBwbGF5QW5pbWF0aW9uKG5hbWU6IHN0cmluZywgcGxheVRocm91Z2g6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IHJlc29sdmVkTmFtZSA9XG4gICAgICB0aGlzLmVudGl0eUNvbnRhaW5lci5tb2RlbCA9PT0gXCJodW1cIiB8fCB0aGlzLmVudGl0eUNvbnRhaW5lci5tb2RlbCA9PT0gXCJodWZcIlxuICAgICAgICA/IChodW1hbkFuaW1hdGlvbkFsaWFzZXNbbmFtZV0gPz8gbmFtZSlcbiAgICAgICAgOiBuYW1lO1xuICAgIGNvbnN0IG1hdGNoID0gdGhpcy5lbnRpdHlDb250YWluZXIuYW5pbWF0aW9ucy5maW5kKFxuICAgICAgKGFuaW1hdGlvbikgPT4gYW5pbWF0aW9uLm5hbWUgPT09IHJlc29sdmVkTmFtZSxcbiAgICApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIC8vIGNvbnNvbGUud2FybihcbiAgICAgIC8vICAgYFtFbnRpdHldIEFuaW1hdGlvbiAke25hbWV9IG5vdCBmb3VuZCBpbiAke3RoaXMuZW50aXR5Q29udGFpbmVyLm1vZGVsfWAsXG4gICAgICAvLyApO1xuICAgICAgaWYgKG5hbWUgPT09IEFuaW1hdGlvbkRlZmluaXRpb25zLldhbGtpbmcpIHtcbiAgICAgICAgdGhpcy5wbGF5QW5pbWF0aW9uKEFuaW1hdGlvbkRlZmluaXRpb25zLlJ1bm5pbmcsIHBsYXlUaHJvdWdoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbWFuYWdlciA9IHRoaXMuZW50aXR5Q29udGFpbmVyLm1hbmFnZXI7XG4gICAgaWYgKCFtYW5hZ2VyKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbRW50aXR5XSBObyBhbmltYXRpb24gbWFuYWdlciBmb3VuZCBmb3IgJHt0aGlzLmVudGl0eUNvbnRhaW5lci5tb2RlbH1gLFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMuY3VycmVudEFuaW1hdGlvbiA9PT0gcmVzb2x2ZWROYW1lICYmICFwbGF5VGhyb3VnaCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5hbmltYXRpb25UaW1lb3V0KSB7XG4gICAgICB0aGlzLnF1ZXVlZEFuaW1hdGlvbiA9IG5hbWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuY3VycmVudEFuaW1hdGlvbiA9IHJlc29sdmVkTmFtZTtcbiAgICBjb25zdCBmcHMgPSBtYXRjaC5mcHMgPz8gNjA7XG4gICAgY29uc3Qgb2Zmc2V0ID0gdGhpcy5jb21wdXRlT2Zmc2V0KG1hdGNoLmZyb20sIG1hdGNoLnRvLCBtYW5hZ2VyLnRpbWUsIGZwcyk7XG4gICAgdGhpcy5hbmltYXRpb25CdWZmZXIuc2V0KG1hdGNoLmZyb20sIG1hdGNoLnRvLCBvZmZzZXQsIGZwcyk7XG4gICAgZm9yIChjb25zdCBtZXNoIG9mIFsuLi50aGlzLnByaW1hcnlNZXNoZXMsIC4uLnRoaXMuc2Vjb25kYXJ5TWVzaGVzXSkge1xuICAgICAgbWVzaC5pbnN0YW5jZWRCdWZmZXJzLmJha2VkVmVydGV4QW5pbWF0aW9uU2V0dGluZ3NJbnN0YW5jZWQgPVxuICAgICAgICB0aGlzLmFuaW1hdGlvbkJ1ZmZlcjtcbiAgICB9XG4gICAgdGhpcy51cGRhdGVNYXRlcmlhbEJ1ZmZlcnMoKTtcblxuICAgIGlmIChwbGF5VGhyb3VnaCkge1xuICAgICAgdGhpcy5hbmltYXRpb25UaW1lb3V0ID0gc2V0VGltZW91dChcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHF1ZXVlZEFuaW1hdGlvbiA9IHRoaXMucXVldWVkQW5pbWF0aW9uO1xuICAgICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZW91dCA9IGZhbHNlO1xuICAgICAgICAgIHRoaXMucXVldWVkQW5pbWF0aW9uID0gbnVsbDtcbiAgICAgICAgICB0aGlzLnBsYXlBbmltYXRpb24ocXVldWVkQW5pbWF0aW9uID8/IEFuaW1hdGlvbkRlZmluaXRpb25zLklkbGUxKTtcbiAgICAgICAgfSxcbiAgICAgICAgKG1hdGNoLnRvIC0gbWF0Y2guZnJvbSkgKiAoMTAwMCAvIGZwcyksXG4gICAgICApOyAvLyBDb252ZXJ0IGZyYW1lcyB0byBtaWxsaXNlY29uZHNcbiAgICB9XG4gIH1cbiAgcHJpdmF0ZSBnZXRUZXh0dXJlSW5kZXgoXG4gICAgb3JpZ2luYWxOYW1lOiBzdHJpbmcsXG4gICAgdmFyaWF0aW9uOiBudW1iZXIgPSAwLFxuICAgIHRleHR1cmVBdGxhczogc3RyaW5nW10sXG4gICk6IG51bWJlciB7XG4gICAgY29uc3QgcmVxdWVzdGVkID0gdGhpcy5nZXRUZXh0dXJlSW5kZXhJbXBsKFxuICAgICAgb3JpZ2luYWxOYW1lLFxuICAgICAgdmFyaWF0aW9uLFxuICAgICAgdGV4dHVyZUF0bGFzLFxuICAgICk7XG4gICAgaWYgKHJlcXVlc3RlZCA+PSAwIHx8IHZhcmlhdGlvbiA9PT0gMCkgcmV0dXJuIHJlcXVlc3RlZDtcbiAgICAvLyBNaXNzaW5nIGFybW9yIHZhcmlhbnRzIGZhbGwgYmFjayB0byB0aGF0IG1vZGVsIHBpZWNlJ3MgYmFzZSBtYXRlcmlhbC5cbiAgICAvLyBXYWxraW5nIHVwd2FyZCB0aHJvdWdoIHVucmVsYXRlZCBtYXRlcmlhbCBpZHMgY2F1c2VkIGd1YXJkcyB0byBzYW1wbGUgYVxuICAgIC8vIHZhbGlkIGJ1dCBpbmNvcnJlY3QgYXRsYXMgbGF5ZXIsIHdoaWNoIHByZXNlbnRlZCBhcyB0ZXh0dXJlIGJsZWVkaW5nLlxuICAgIHJldHVybiB0aGlzLmdldFRleHR1cmVJbmRleEltcGwob3JpZ2luYWxOYW1lLCAwLCB0ZXh0dXJlQXRsYXMpO1xuICB9XG4gIHByaXZhdGUgZ2V0VGV4dHVyZUluZGV4SW1wbChcbiAgICBvcmlnaW5hbE5hbWU6IHN0cmluZyxcbiAgICB2YXJpYXRpb246IG51bWJlcixcbiAgICB0ZXh0dXJlQXRsYXM6IHN0cmluZ1tdLFxuICApOiBudW1iZXIge1xuICAgIGlmICghb3JpZ2luYWxOYW1lIHx8IG9yaWdpbmFsTmFtZS5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtFbnRpdHldIGdldFRleHR1cmVJbmRleCBjYWxsZWQgd2l0aCBlbXB0eSBvcmlnaW5hbE5hbWUgZm9yICR7dGhpcy5zcGF3bi5uYW1lfWAsXG4gICAgICApO1xuICAgICAgcmV0dXJuIDA7IC8vIGRlYnVnIHJlYWxseVxuICAgIH1cbiAgICBvcmlnaW5hbE5hbWUgPSBvcmlnaW5hbE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgbW9kZWwsIHRleElkeDtcbiAgICBjb25zdCBtYXRjaCA9IG9yaWdpbmFsTmFtZS5tYXRjaChjaGFyRmlsZVJlZ2V4KTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBjb25zdCBjbGtNYXRjaCA9IG9yaWdpbmFsTmFtZS5tYXRjaChjbGtSZWdleCk7XG4gICAgICBpZiAoY2xrTWF0Y2gpIHtcbiAgICAgICAgbW9kZWwgPSBcImNsa1wiO1xuICAgICAgICB0ZXhJZHggPSBjbGtNYXRjaFsyXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICB0ZXh0dXJlQXRsYXMuaW5kZXhPZihcbiAgICAgICAgICAgIGAke21vZGVsfSR7KHZhcmlhdGlvbiAtIDYpLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpfSR7dGV4SWR4fWAsXG4gICAgICAgICAgKSA/PyAtMVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKG9yaWdpbmFsTmFtZS5zdGFydHNXaXRoKFwiaGVsbVwiKSkge1xuICAgICAgICByZXR1cm4gdGV4dHVyZUF0bGFzLmluZGV4T2Yob3JpZ2luYWxOYW1lKSA/PyAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9XG4gICAgbW9kZWwgPSBtYXRjaFsxXTtcbiAgICB0ZXhJZHggPSBtYXRjaFs0XTtcbiAgICBjb25zdCBwaWVjZSA9IG1hdGNoWzJdO1xuXG4gICAgaWYgKHBpZWNlID09PSBNYXRlcmlhbFByZWZpeGVzLkZhY2UgJiYgdGhpcy51c2VzUGxheWVyRmFjZVRleHR1cmVzKSB7XG4gICAgICAvLyBGb3IgaHVtYW5vaWRzLCB1c2UgdGhlIGZhY2UgdGV4dHVyZSB2YXJpYXRpb25cbiAgICAgIHZhcmlhdGlvbiA9IHRoaXMuc3Bhd24uZmFjZTtcbiAgICAgIGNvbnN0IHBpZWNlTnVtYmVyID0gdGV4SWR4WzFdO1xuICAgICAgY29uc3QgYmFzZUluZGV4ID0gdGV4dHVyZUF0bGFzLmluZGV4T2YoXG4gICAgICAgIGAke21vZGVsfSR7cGllY2V9MDAke3ZhcmlhdGlvbn0ke3BpZWNlTnVtYmVyfWAsXG4gICAgICApO1xuICAgICAgaWYgKGJhc2VJbmRleCAhPT0gdW5kZWZpbmVkICYmIGJhc2VJbmRleCA+PSAwKSB7XG4gICAgICAgIHJldHVybiBiYXNlSW5kZXg7IC8vIEFkanVzdCBpbmRleCBiYXNlZCBvbiB2YXJpYXRpb25cbiAgICAgIH1cbiAgICAgIHJldHVybiAoXG4gICAgICAgIHRleHR1cmVBdGxhcy5pbmRleE9mKFxuICAgICAgICAgIGAke21vZGVsfSR7cGllY2V9MDAkeyt2YXJpYXRpb24gKyAxfSR7cGllY2VOdW1iZXJ9YCxcbiAgICAgICAgKSA/PyAtMVxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgbWF0ZXJpYWwgPSB2YXJpYXRpb24udG9TdHJpbmcoKS5wYWRTdGFydCgyLCBcIjBcIik7XG4gICAgbGV0IHRleHR1cmVOdW1iZXIgPSBOdW1iZXIodGV4SWR4KTtcbiAgICB3aGlsZSAodGV4dHVyZU51bWJlciA+PSAwKSB7XG4gICAgICBjb25zdCByZXRWYWx1ZSA9IHRleHR1cmVBdGxhcy5pbmRleE9mKFxuICAgICAgICBgJHttb2RlbH0ke3BpZWNlfSR7bWF0ZXJpYWx9JHt0ZXh0dXJlTnVtYmVyLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgXCIwXCIpfWAsXG4gICAgICApO1xuICAgICAgaWYgKHJldFZhbHVlID49IDApIHJldHVybiByZXRWYWx1ZTtcbiAgICAgIHRleHR1cmVOdW1iZXItLTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuICB9XG59XG4iXX0=