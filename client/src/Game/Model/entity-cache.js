// src/game/Model/entity-cache.ts
import BABYLON from "@bjs";
import { isPlayerRace, MaterialPrefixes, Races, } from "@game/Constants/constants";
import RACE_DATA from "@game/Constants/race-data";
import { FileSystem } from "@game/FileSystem/filesystem";
import { ShadoDynamicEntityNameplateLayer } from "@knervous/shado/render";
import { getAssetContainerMeshes, getOrCreateAssetContainerRoot, } from "./asset-container";
import { loadBasisTexture } from "./basis-texture";
import { Entity } from "./entity";
import { createVATPickingMaterial, createVATShaderMaterial, } from "./entity-material";
import { createHeldItemBindTransform } from "./held-item-attachment";
import ItemCache from "./item-cache";
import { ShadoEntityPool } from "./shado-entity-pool";
export class EntityCache {
    static initialEntityCullDistance = 250;
    static containers = {};
    static resolvedContainers = {};
    static commonBasisAtlas = {};
    static commonBasisAtlasLoaded = false;
    static commonBasisAtlasPromise = null;
    static generation = 0;
    static activePools = new Set();
    static gameManager;
    /**
     * Retrieves or creates a shared parent node on the scene
     * under which all entities will be bucketed.
     */
    static getOrCreateNodeContainer(scene) {
        const existing = scene.getNodeByName("EntityNodeContainer");
        if (existing) {
            return existing;
        }
        return new BABYLON.TransformNode("EntityNodeContainer", scene);
    }
    /**
     * Loads (or returns cached) mesh/animation container for a given model.
     * @param model       model key (lowercased)
     * @param scene       Babylon scene
     * @param parentNode  parent under which to attach; defaults to shared container
     */
    static async getContainer(model, scene) {
        model = model.toLowerCase();
        const requestGeneration = EntityCache.generation;
        if (!EntityCache.commonBasisAtlasLoaded) {
            if (!EntityCache.commonBasisAtlasPromise) {
                const promise = EntityCache.loadCommonBasisAtlas(scene, requestGeneration);
                EntityCache.commonBasisAtlasPromise = promise;
                void promise.then(() => {
                    if (EntityCache.commonBasisAtlasPromise === promise) {
                        EntityCache.commonBasisAtlasPromise = null;
                    }
                }, () => {
                    if (EntityCache.commonBasisAtlasPromise === promise) {
                        EntityCache.commonBasisAtlasPromise = null;
                    }
                });
            }
            await EntityCache.commonBasisAtlasPromise;
        }
        if (requestGeneration !== EntityCache.generation ||
            !EntityCache.commonBasisAtlasLoaded) {
            return null;
        }
        const bucket = EntityCache.getOrCreateNodeContainer(scene);
        const baseModel = model.slice(0, 3);
        if (!EntityCache.containers[model]) {
            const generation = EntityCache.generation;
            EntityCache.containers[model] = (async () => {
                // Load .babylon
                const bytes = await FileSystem.getFileBytes("eqrequiem/babylon", `${model}.babylon.gz`);
                if (!bytes) {
                    console.log(`[EntityCache] Failed to load model ${model}`);
                    return null;
                }
                const container = await BABYLON.loadBabylonAssetContainer(bytes, scene, {
                    name: `${model}.babylon`,
                }).catch((e) => {
                    console.log(`[EntityCache] Error loading model ${model}:`, e);
                    return null;
                });
                if (!container) {
                    return null;
                }
                // Attach to bucket
                const root = getOrCreateAssetContainerRoot(container, scene, `container_${model}`);
                root.setParent(bucket);
                // VAT setup
                let manager = null;
                let shaderMaterial = null;
                let pickingMaterial = null;
                let textureAtlas = [];
                const shadoPool = await ShadoEntityPool.create(scene.getEngine());
                // Vertex animation data
                const canUseFloat16 = scene.getEngine().getCaps().textureHalfFloat;
                const vat16 = `${model}.bin.gz`;
                const vat32 = `${model}_32.bin.gz`;
                const vatBytes = await FileSystem.getFileBytes("eqrequiem/vat", canUseFloat16 ? vat16 : vat32);
                if (!vatBytes) {
                    console.warn(`[EntityCache] VAT data missing for ${model}`);
                    return null;
                }
                const vatData = canUseFloat16
                    ? new Uint16Array(vatBytes)
                    : new Float32Array(vatBytes);
                manager = new BABYLON.BakedVertexAnimationManager(scene);
                const baker = new BABYLON.VertexAnimationBaker(scene, container.skeletons[0]);
                manager.texture = baker.textureFromBakedVertexData(vatData);
                manager.texture.name = `vatTexture16_${model}`;
                container.addToScene((m) => {
                    return ((m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) ||
                        m instanceof BABYLON.Geometry ||
                        m instanceof BABYLON.Skeleton ||
                        m instanceof BABYLON.TransformNode);
                });
                // Basis textures
                const basisBytes = await FileSystem.getFileBytes("eqrequiem/basis", `${baseModel}.basis`);
                if (!basisBytes) {
                    console.warn(`[EntityCache] Basis texture missing for ${model}`);
                    return null;
                }
                const { data, layerCount, format, width, height } = await loadBasisTexture(scene.getEngine(), basisBytes);
                const textureArray = new BABYLON.RawTexture2DArray(null, width, height, layerCount, format, scene, false, false, BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
                textureArray.update(data);
                // Shader material
                shaderMaterial = createVATShaderMaterial(scene, shadoPool, model);
                pickingMaterial = createVATPickingMaterial(scene, shadoPool, model);
                // Atlas
                textureAtlas =
                    (await FileSystem.getFileJSON("eqrequiem/basis", `${baseModel}.json`)) ?? [];
                if (!textureAtlas.length) {
                    console.warn(`[EntityCache] VAT atlas missing for ${model}`);
                    return null;
                }
                // Animate
                const frameUpdate = () => {
                    manager.time += scene.getEngine().getDeltaTime() / 1000;
                };
                scene.registerBeforeRender(frameUpdate);
                bucket.onDisposeObservable.add(() => scene.unregisterBeforeRender(frameUpdate));
                // Gather animations
                let animations = [];
                const infoNode = root.getChildTransformNodes()?.[0];
                const boundingBox = infoNode?.metadata?.gltf?.extras?.boundingBox ?? null;
                const json = (await FileSystem.getFileJSON("eqrequiem/vat", `${model}.json`));
                if (json) {
                    animations = json.animations.map((animation) => ({
                        ...animation,
                        fps: animation.fps ?? json.fps ?? 60,
                    }));
                }
                else {
                    const ranges = infoNode?.metadata?.gltf?.extras?.animationRanges ?? [];
                    let offset = 0;
                    animations = ranges.map((r) => {
                        const entry = {
                            from: r.from + offset,
                            to: Math.max(0, r.to + offset),
                            name: r.name,
                        };
                        offset += r.to;
                        return entry;
                    });
                }
                // Process meshes
                const meshes = getAssetContainerMeshes(container);
                if (!meshes.length) {
                    console.warn(`[EntityCache] Model ${model} contains no renderable meshes`);
                    container.dispose();
                    return null;
                }
                const submeshRanges = new Map();
                let i = 0;
                for (const mesh of meshes) {
                    mesh.metadata ??= {};
                    mesh.computeWorldMatrix(true);
                    mesh.bakeTransformIntoVertices(mesh.getWorldMatrix());
                    // The legacy S3D -> Babylon exports use the opposite winding and
                    // still need this compatibility flip. Modern GLB-derived bundles
                    // declare that their loader-normalized winding must be preserved.
                    if (!mesh.metadata.gltf?.extras?.preserveRuntimeWinding) {
                        mesh.flipFaces(true);
                    }
                    const { model, variation, texNum } = mesh.metadata.gltf.extras;
                    let piece = mesh.metadata.gltf.extras.piece?.toLowerCase() ?? "";
                    let atlasIndex = 0;
                    let name = mesh.material?.name?.toLowerCase() ?? "";
                    if (!name) {
                        name = `${model}${piece}${variation}${texNum}`.toLowerCase();
                    }
                    const range = {
                        name,
                        textureAttributesBuffer: new Float32Array(4),
                        isRobe: false,
                        isHelm: false,
                        atlasArray: textureAtlas,
                        metadata: { model, piece: piece.toLowerCase(), variation, texNum },
                    };
                    if (isPlayerRace(model)) {
                        if (name?.toLowerCase()?.startsWith("clk")) {
                            atlasIndex = 1;
                            range.isRobe = true;
                            range.atlasArray = EntityCache.commonBasisAtlas["clk"].atlas;
                            piece = "ch";
                        }
                        else if (texNum !== "01" &&
                            piece === MaterialPrefixes.Helm &&
                            (name?.toLowerCase()?.startsWith("helm") ||
                                name?.toLowerCase()?.startsWith("chain"))) {
                            atlasIndex = 2;
                            range.isHelm = true;
                            range.atlasArray = EntityCache.commonBasisAtlas["helm"].atlas;
                        }
                    }
                    submeshRanges.set(i, range);
                    const vertexCount = mesh.getTotalVertices();
                    const data = new Float32Array(vertexCount * 2);
                    for (let j = 0; j < vertexCount; j++) {
                        data[j * 2] = atlasIndex;
                        data[j * 2 + 1] = i;
                    }
                    mesh.setVerticesData("submeshData", data, false, 2);
                    i++;
                }
                const textureAttributesDirtyRef = {
                    value: true,
                };
                const allSubmeshDataBuffers = [];
                meshes.forEach((m) => {
                    const d = m.getVerticesData("submeshData");
                    allSubmeshDataBuffers.push(d);
                });
                const mergedMesh = BABYLON.Mesh.MergeMeshes(meshes, true, false, undefined, false, false);
                mergedMesh.isPickable = true;
                mergedMesh.thinInstanceEnablePicking = false;
                mergedMesh.pointerOverDisableMeshTesting = true;
                // how many total verts?
                const totalVerts = allSubmeshDataBuffers
                    .map((buf) => buf.length / 2 /* stride*/)
                    .reduce((a, b) => a + b, 0);
                // flatten them into one big Float32Array (stride = 2)
                const mergedSubmeshData = new Float32Array(totalVerts * 2);
                let offsetVertices = 0;
                for (const buf of allSubmeshDataBuffers) {
                    // buf.length is (#verts * 2)
                    mergedSubmeshData.set(buf, offsetVertices * 2);
                    offsetVertices += buf.length / 2;
                }
                // _now_ re-attach
                mergedMesh.setVerticesData("submeshData", mergedSubmeshData, 
                /* updatable*/ false, 
                /* stride*/ 2);
                const submeshCount = meshes.length;
                const freeThinInstances = [];
                const addThinInstance = (matrix, entityId) => {
                    const shadoSlot = shadoPool.acquire(entityId, submeshCount);
                    const reusableIndex = freeThinInstances.pop();
                    if (reusableIndex !== undefined) {
                        if (reusableIndex !== shadoSlot.index) {
                            throw new Error("Shado and Babylon instance pools lost index alignment");
                        }
                        mergedMesh.thinInstanceSetMatrixAt(reusableIndex, matrix, true);
                        return shadoSlot.index;
                    }
                    const instanceIdx = mergedMesh.thinInstanceAdd(matrix, true);
                    if (instanceIdx !== shadoSlot.index) {
                        throw new Error("Shado and Babylon instance pools lost index alignment");
                    }
                    return shadoSlot.index;
                };
                const removeThinInstance = (index) => {
                    if (freeThinInstances.includes(index))
                        return;
                    mergedMesh.thinInstanceSetMatrixAt(index, BABYLON.Matrix.Zero(), true);
                    shadoPool.release(index);
                    freeThinInstances.push(index);
                };
                mergedMesh.metadata = {
                    textureAttributesDirtyRef,
                    shadoPool,
                    submeshCount,
                    atlasArrayTexture: textureArray,
                    cloakAtlasArrayTexture: EntityCache.commonBasisAtlas["clk"].texture,
                    helmAtlasArrayTexture: EntityCache.commonBasisAtlas["helm"].texture,
                    vatTexture: manager.texture,
                    vatTextureSizeInverted: new BABYLON.Vector2(1 / manager.texture.getSize().width, 1 / manager.texture.getSize().height),
                    gpuPickingMaterial: pickingMaterial,
                };
                mergedMesh.skeleton = container.skeletons[0] || null;
                mergedMesh.parent = bucket;
                mergedMesh.name = model;
                mergedMesh.bakedVertexAnimationManager = manager;
                mergedMesh.parent = null;
                mergedMesh.position.set(0, 0, 0);
                mergedMesh.rotation.set(0, 0, 0);
                mergedMesh.scaling.set(1, 1, 1);
                mergedMesh.thinInstanceRegisterAttribute("matrix", 16);
                const mat = mergedMesh.material;
                if (!mat) {
                    console.warn(`[EntityCache] Mesh ${mergedMesh.name} has no material`);
                    // continue;
                }
                mat?.dispose(true, true);
                mergedMesh.material = shaderMaterial;
                mergedMesh.parent = bucket;
                const attachmentBoneIndices = Object.fromEntries((container.skeletons[0]?.bones ?? []).map((bone) => [
                    bone.name,
                    bone.getIndex(),
                ]));
                const attachmentGeometryTransforms = {};
                if (model === "hum" || model === "huf") {
                    const skeleton = container.skeletons[0];
                    const runtimeScale = Number(infoNode?.metadata?.gltf?.extras?.runtimeScale);
                    const aliases = {
                        r_point: "socket_hand.R",
                        l_point: "socket_hand.L",
                        shield_point: "socket_hand.L",
                        head_point: "socket_head",
                    };
                    if (skeleton && Number.isFinite(runtimeScale) && runtimeScale > 0) {
                        skeleton.returnToRest();
                        skeleton.computeAbsoluteMatrices(true);
                        for (const [alias, socketName] of Object.entries(aliases)) {
                            const socket = skeleton.bones.find((bone) => bone.name === socketName);
                            if (!socket)
                                continue;
                            attachmentBoneIndices[alias] = socket.getIndex();
                            // VAT matrices are inverseBind * animatedAbsolute, followed by
                            // the GLB-to-runtime alignment. Item geometry must therefore
                            // begin at the socket's absolute bind transform. Compensate for
                            // runtimeScale because EQ item geometry is already authored in
                            // six-unit game space while the body source is authored in
                            // meters and scaled by the VAT alignment.
                            attachmentGeometryTransforms[alias] =
                                createHeldItemBindTransform(socket.getAbsoluteTransform(), runtimeScale);
                        }
                    }
                }
                const itemPool = {};
                const getItem = async (itemModel, flip = true, attachmentBoneIndex, attachmentKey) => {
                    itemModel = itemModel.toLowerCase();
                    const attachmentCacheKey = attachmentKey ??
                        (attachmentBoneIndex === undefined
                            ? "unbound"
                            : `bone-${attachmentBoneIndex}`);
                    const itemKey = `${itemModel}:${flip ? "flipped" : "raw"}:${attachmentCacheKey}`;
                    if (!itemPool[itemKey]) {
                        itemPool[itemKey] = new Promise((res) => {
                            ItemCache.getContainer(itemModel, model, scene, manager, container.skeletons[0] ?? null, flip, attachmentBoneIndex, attachmentCacheKey, attachmentGeometryTransforms[attachmentCacheKey])
                                .then(res)
                                .catch((e) => {
                                console.warn(`[EntityCache] Error loading item model ${itemModel}:`, e);
                                res(null);
                            });
                        });
                    }
                    return itemPool[itemKey];
                };
                root.dispose();
                EntityCache.gameManager.addToPickingList(mergedMesh);
                return {
                    container,
                    model,
                    textureAttributesDirtyRef,
                    getItem,
                    shadoPool,
                    addThinInstance,
                    removeThinInstance,
                    submeshRanges,
                    attachmentBoneIndices,
                    attachmentGeometryTransforms,
                    animations,
                    mesh: mergedMesh,
                    skeleton: container.skeletons[0],
                    manager: manager,
                    shaderMaterial: shaderMaterial,
                    pickingMaterial: pickingMaterial,
                    boundingBox,
                };
            })()
                .then((c) => {
                if (generation !== EntityCache.generation) {
                    EntityCache.disposeContainer(c);
                    return null;
                }
                if (c) {
                    EntityCache.resolvedContainers[model] = c;
                    EntityCache.activePools.add(c.shadoPool);
                    return c;
                }
                delete EntityCache.containers[model];
                return null;
            })
                .catch((e) => {
                console.error(`[EntityCache] Error loading model ${model}:`, e);
                delete EntityCache.containers[model];
                return null;
            });
        }
        return EntityCache.containers[model];
    }
    static entityInstances = new Set();
    static renderObserver = null;
    static cullObserver = null;
    static observerScene = null;
    static nameplateLayer = null;
    static initialize(scene) {
        if (EntityCache.renderObserver) {
            EntityCache.observerScene?.onAfterRenderCameraObservable.remove(EntityCache.renderObserver);
        }
        if (EntityCache.cullObserver) {
            EntityCache.observerScene?.onBeforeRenderObservable.remove(EntityCache.cullObserver);
        }
        EntityCache.observerScene = scene;
        EntityCache.nameplateLayer?.dispose();
        EntityCache.nameplateLayer = new ShadoDynamicEntityNameplateLayer(scene, {
            color: "#00ffff",
            depthTest: true,
            // Alpha-blended nameplates render after opaque geometry in group 0 and
            // retain that group's depth buffer. Later groups clear depth by default.
            renderingGroupId: 0,
            worldScale: 1 / 32,
        });
        EntityCache.cullObserver = scene.onBeforeRenderObservable.add(() => {
            const camera = scene.activeCamera;
            if (!camera)
                return;
            for (const pool of EntityCache.activePools) {
                pool.cull(camera, 5, EntityCache.initialEntityCullDistance);
            }
            for (const entity of EntityCache.entityInstances) {
                entity.applyReducedVisibility();
            }
        });
        EntityCache.renderObserver = scene.onAfterRenderCameraObservable.add(() => {
            const now = performance.now();
            for (const entity of EntityCache.entityInstances) {
                if (entity.lifecycleDisposed || entity.isDisposed()) {
                    EntityCache.entityInstances.delete(entity);
                    continue;
                }
                try {
                    entity.syncMatrix();
                }
                catch (error) {
                    console.warn("[EntityCache] Entity matrix sync skipped", error);
                }
            }
            EntityCache.nameplateLayer?.sync([...EntityCache.entityInstances].map((entity) => ({
                id: `${entity.spawn.name}:${entity.spawn.spawnId ?? "player"}`,
                text: entity.nameplateLines.join("\n"),
                x: entity.spawnPosition.x,
                y: entity.spawnPosition.z,
                z: entity.spawnPosition.y +
                    (4 + entity.nameplateLines.length * 1.5) * entity.spawnScale,
                visible: !entity.hidden &&
                    !entity.lifecycleDisposed &&
                    Boolean(entity.meshInstance?.actor.visibleFlag),
            })));
            const delta = performance.now() - now;
            window.perf = delta;
            // console.log('Delta for entity sync:', delta, 'ms');
        });
    }
    /**
     * Instantiates an Entity under the given parent (or shared container).
     */
    static async getInstance(gameManager, spawn, scene, parentNode, itemResolver) {
        const race = spawn.race ?? 1;
        const entry = RACE_DATA[race] ?? RACE_DATA[Races.HUMAN];
        let model = entry[spawn.gender ?? 0] || entry[2];
        model = model.toLowerCase();
        const container = await EntityCache.getContainer(model, scene);
        if (!container) {
            return null;
        }
        const entity = new Entity(gameManager, spawn, scene, container, this, parentNode, entry, itemResolver);
        try {
            await entity.ready;
        }
        catch (error) {
            // setup() acquires a Shado/thin-instance slot before loading optional
            // appearance assets. Never leave a visible, unregistered partial entity.
            entity.dispose();
            throw error;
        }
        EntityCache.entityInstances.add(entity);
        return entity;
    }
    static unregister(entity) {
        EntityCache.entityInstances.delete(entity);
    }
    static dispose(model) {
        delete EntityCache.containers[model];
    }
    static disposeAll(scene) {
        EntityCache.generation++;
        for (const entity of [...EntityCache.entityInstances])
            entity.dispose();
        EntityCache.entityInstances.clear();
        Entity.disposeStatics();
        if (EntityCache.renderObserver) {
            EntityCache.observerScene?.onAfterRenderCameraObservable.remove(EntityCache.renderObserver);
            EntityCache.renderObserver = null;
        }
        if (EntityCache.cullObserver) {
            EntityCache.observerScene?.onBeforeRenderObservable.remove(EntityCache.cullObserver);
            EntityCache.cullObserver = null;
        }
        EntityCache.observerScene = null;
        EntityCache.commonBasisAtlasLoaded = false;
        EntityCache.commonBasisAtlasPromise = null;
        for (const key in EntityCache.commonBasisAtlas) {
            const atlas = EntityCache.commonBasisAtlas[key];
            if (atlas.texture) {
                atlas.texture.dispose();
            }
        }
        EntityCache.commonBasisAtlas = {};
        EntityCache.nameplateLayer?.dispose();
        EntityCache.nameplateLayer = null;
        Object.keys(EntityCache.resolvedContainers).forEach((m) => {
            const c = EntityCache.resolvedContainers[m];
            if (!c) {
                return;
            }
            EntityCache.disposeContainer(c);
            delete EntityCache.resolvedContainers[m];
        });
        Object.keys(EntityCache.containers).forEach((m) => {
            delete EntityCache.containers[m];
        });
        Entity.instantiateStatics(scene);
        EntityCache.resolvedContainers = {};
        EntityCache.activePools.clear();
    }
    static disposeContainer(c) {
        if (!c)
            return;
        EntityCache.activePools.delete(c.shadoPool);
        c.manager?.dispose();
        c.shadoPool.dispose();
        c.shaderMaterial?.dispose(true, true);
        c.pickingMaterial?.dispose(true, true);
        if (!c.mesh.isDisposed())
            c.mesh.dispose();
        c.container.dispose();
    }
    static async loadCommonBasisAtlas(scene, generation) {
        const loaded = {};
        let published = false;
        try {
            for (const entry of ["clk", "helm"]) {
                const bytes = await FileSystem.getFileBytes("eqrequiem/basis", `${entry}.basis`);
                if (!bytes) {
                    throw new Error(`Common basis texture missing for ${entry}`);
                }
                const { data, layerCount, format, width, height } = await loadBasisTexture(scene.getEngine(), bytes);
                const texture = new BABYLON.RawTexture2DArray(null, width, height, layerCount, format, scene, false, false, BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
                texture.update(data);
                const atlas = (await FileSystem.getFileJSON("eqrequiem/basis", `${entry}.json`)) ?? [];
                if (!atlas.length) {
                    texture.dispose();
                    throw new Error(`Common basis atlas missing for ${entry}`);
                }
                loaded[entry] = { texture, atlas };
            }
            if (generation !== EntityCache.generation)
                return;
            EntityCache.commonBasisAtlas = loaded;
            EntityCache.commonBasisAtlasLoaded = true;
            published = true;
        }
        finally {
            if (!published) {
                for (const entry of Object.values(loaded))
                    entry.texture.dispose();
            }
        }
    }
}
export default EntityCache;
window.ec = EntityCache;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LWNhY2hlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW50aXR5LWNhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGlDQUFpQztBQUdqQyxPQUFPLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFDM0IsT0FBTyxFQUNMLFlBQVksRUFDWixnQkFBZ0IsRUFDaEIsS0FBSyxHQUNOLE1BQU0sMkJBQTJCLENBQUM7QUFDbkMsT0FBTyxTQUFTLE1BQU0sMkJBQTJCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBSXpELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzFFLE9BQU8sRUFDTCx1QkFBdUIsRUFDdkIsNkJBQTZCLEdBQzlCLE1BQU0sbUJBQW1CLENBQUM7QUFDM0IsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDbkQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsQyxPQUFPLEVBQ0wsd0JBQXdCLEVBQ3hCLHVCQUF1QixHQUN4QixNQUFNLG1CQUFtQixDQUFDO0FBRTNCLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3JFLE9BQU8sU0FBNEIsTUFBTSxjQUFjLENBQUM7QUFDeEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBOER0RCxNQUFNLE9BQU8sV0FBVztJQUNkLE1BQU0sQ0FBVSx5QkFBeUIsR0FBRyxHQUFHLENBQUM7SUFDaEQsTUFBTSxDQUFDLFVBQVUsR0FDdkIsRUFBRSxDQUFDO0lBQ0csTUFBTSxDQUFDLGtCQUFrQixHQUMvQixFQUFFLENBQUM7SUFDRyxNQUFNLENBQUMsZ0JBQWdCLEdBQStCLEVBQUUsQ0FBQztJQUN6RCxNQUFNLENBQUMsc0JBQXNCLEdBQUcsS0FBSyxDQUFDO0lBQ3RDLE1BQU0sQ0FBQyx1QkFBdUIsR0FBeUIs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QVcsQ0FDM0IsaUJBQWlCLEVBQ2pCLEdBQUcsS0FBSyxPQUFPLENBQ2hCLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1gsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDbEIsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUNyQyxDQUFDO1lBQ0QsSUFBSSxVQUFVLEtBQUssV0FBVyxDQUFDLFVBQVU7Z0JBQUUsT0FBTztZQUNsRCxXQUFXLENBQUMsZ0JBQWdCLEdBQUcsTUFBTSxDQUFDO1lBQ3RDLFdBQVcsQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUM7WUFDMUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUNuQixDQUFDO2dCQUFTLENBQUM7WUFDVCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2YsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztvQkFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3JFLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBRUQsZUFBZSxXQUFXLENBQUM7QUFFMUIsTUFBYyxDQUFDLEVBQUUsR0FBRyxXQUFXLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvZ2FtZS9Nb2RlbC9lbnRpdHktY2FjaGUudHNcblxuaW1wb3J0IHR5cGUgKiBhcyBCSlMgZnJvbSBcIkBiYWJ5bG9uanMvY29yZVwiO1xuaW1wb3J0IEJBQllMT04gZnJvbSBcIkBianNcIjtcbmltcG9ydCB7XG4gIGlzUGxheWVyUmFjZSxcbiAgTWF0ZXJpYWxQcmVmaXhlcyxcbiAgUmFjZXMsXG59IGZyb20gXCJAZ2FtZS9Db25zdGFudHMvY29uc3RhbnRzXCI7XG5pbXBvcnQgUkFDRV9EQVRBIGZyb20gXCJAZ2FtZS9Db25zdGFudHMvcmFjZS1kYXRhXCI7XG5pbXBvcnQgeyBGaWxlU3lzdGVtIH0gZnJvbSBcIkBnYW1lL0ZpbGVTeXN0ZW0vZmlsZXN5c3RlbVwiO1xuaW1wb3J0IHR5cGUgR2FtZU1hbmFnZXIgZnJvbSBcIkBnYW1lL01hbmFnZXIvZ2FtZS1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBQbGF5ZXJQcm9maWxlLCBTcGF3biB9IGZyb20gXCJAZ2FtZS9OZXQvbWVzc2FnZXNcIjtcbmltcG9ydCB0eXBlIHsgTnVsbGFibGVJdGVtSW5zdGFuY2UgfSBmcm9tIFwiQGdhbWUvUGxheWVyL3BsYXllci1jb25zdGFudHNcIjtcbmltcG9ydCB7IFNoYWRvRHluYW1pY0VudGl0eU5hbWVwbGF0ZUxheWVyIH0gZnJvbSBcIkBrbmVydm91cy9zaGFkby9yZW5kZXJcIjtcbmltcG9ydCB7XG4gIGdldEFzc2V0Q29udGFpbmVyTWVzaGVzLFxuICBnZXRPckNyZWF0ZUFzc2V0Q29udGFpbmVyUm9vdCxcbn0gZnJvbSBcIi4vYXNzZXQtY29udGFpbmVyXCI7XG5pbXBvcnQgeyBsb2FkQmFzaXNUZXh0dXJlIH0gZnJvbSBcIi4vYmFzaXMtdGV4dHVyZVwiO1xuaW1wb3J0IHsgRW50aXR5IH0gZnJvbSBcIi4vZW50aXR5XCI7XG5pbXBvcnQge1xuICBjcmVhdGVWQVRQaWNraW5nTWF0ZXJpYWwsXG4gIGNyZWF0ZVZBVFNoYWRlck1hdGVyaWFsLFxufSBmcm9tIFwiLi9lbnRpdHktbWF0ZXJpYWxcIjtcbmltcG9ydCB7IEVudGl0eU1lc2hNZXRhZGF0YSB9IGZyb20gXCIuL2VudGl0eS10eXBlc1wiO1xuaW1wb3J0IHsgY3JlYXRlSGVsZEl0ZW1CaW5kVHJhbnNmb3JtIH0gZnJvbSBcIi4vaGVsZC1pdGVtLWF0dGFjaG1lbnRcIjtcbmltcG9ydCBJdGVtQ2FjaGUsIHsgSXRlbUNvbnRhaW5lciB9IGZyb20gXCIuL2l0ZW0tY2FjaGVcIjtcbmltcG9ydCB7IFNoYWRvRW50aXR5UG9vbCB9IGZyb20gXCIuL3NoYWRvLWVudGl0eS1wb29sXCI7XG5cbnR5cGUgTW9kZWxLZXkgPSBzdHJpbmc7XG50eXBlIFN1Ym1lc2hSYW5nZSA9IHtcbiAgdGV4dHVyZUF0dHJpYnV0ZXNCdWZmZXI6IEZsb2F0MzJBcnJheTtcbiAgaXNSb2JlOiBib29sZWFuO1xuICBpc0hlbG06IGJvb2xlYW47XG4gIGF0bGFzQXJyYXk6IHN0cmluZ1tdO1xuICBuYW1lOiBzdHJpbmc7XG4gIG1ldGFkYXRhOiB7XG4gICAgbW9kZWw6IHN0cmluZztcbiAgICBwaWVjZTogc3RyaW5nO1xuICAgIHZhcmlhdGlvbjogc3RyaW5nO1xuICAgIHRleE51bTogc3RyaW5nO1xuICB9O1xufTtcblxuZXhwb3J0IHR5cGUgRW50aXR5Q29udGFpbmVyID0ge1xuICBjb250YWluZXI6IEJKUy5Bc3NldENvbnRhaW5lcjtcbiAgbW9kZWw6IE1vZGVsS2V5O1xuICBtYW5hZ2VyPzogQkpTLkJha2VkVmVydGV4QW5pbWF0aW9uTWFuYWdlcjtcbiAgc2hhZGVyTWF0ZXJpYWw/OiBCSlMuU2hhZGVyTWF0ZXJpYWw7XG4gIHBpY2tpbmdNYXRlcmlhbD86IEJKUy5TaGFkZXJNYXRlcmlhbDtcbiAgbWVzaDogQkpTLk1lc2g7XG4gIGFuaW1hdGlvbnM6IEFuaW1hdGlvbkVudHJ5W107XG4gIHNrZWxldG9uPzogQkpTLlNrZWxldG9uO1xuICBzdWJtZXNoUmFuZ2VzOiBNYXA8bnVtYmVyLCBTdWJtZXNoUmFuZ2U+O1xuICBpdGVtUG9vbD86IFJlY29yZDxzdHJpbmcsIFByb21pc2U8SXRlbUNvbnRhaW5lciB8IG51bGw+PjtcbiAgdGV4dHVyZUF0dHJpYnV0ZXNEaXJ0eVJlZjoge1xuICAgIHZhbHVlOiBib29sZWFuO1xuICB9O1xuICBnZXRJdGVtPzogKFxuICAgIG1vZGVsOiBzdHJpbmcsXG4gICAgZmxpcD86IGJvb2xlYW4sXG4gICAgYXR0YWNobWVudEJvbmVJbmRleD86IG51bWJlcixcbiAgICBhdHRhY2htZW50S2V5Pzogc3RyaW5nLFxuICApID0+IFByb21pc2U8SXRlbUNvbnRhaW5lciB8IG51bGw+O1xuICBhdHRhY2htZW50Qm9uZUluZGljZXM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIG51bWJlcj4+O1xuICBhdHRhY2htZW50R2VvbWV0cnlUcmFuc2Zvcm1zOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBCSlMuTWF0cml4Pj47XG4gIHNoYWRvUG9vbDogU2hhZG9FbnRpdHlQb29sO1xuICBhZGRUaGluSW5zdGFuY2U6IChtYXRyaXg6IEJKUy5NYXRyaXgsIGVudGl0eUlkOiBudW1iZXIpID0+IG51bWJlcjtcbiAgcmVtb3ZlVGhpbkluc3RhbmNlOiAoaW5kZXg6IG51bWJlcikgPT4gdm9pZDtcbiAgYm91bmRpbmdCb3g/OiB7XG4gICAgbWluOiBudW1iZXJbXTtcbiAgICBtYXg6IG51bWJlcltdO1xuICAgIGNlbnRlcjogbnVtYmVyW107XG4gICAgeU9mZnNldDogbnVtYmVyO1xuICB9IHwgbnVsbDtcbn07XG5cbmV4cG9ydCB0eXBlIEFuaW1hdGlvbkVudHJ5ID0ge1xuICBmcm9tOiBudW1iZXI7XG4gIHRvOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbiAgZnBzPzogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgQmFzaXNBdGxhcyA9IHtcbiAgdGV4dHVyZTogQkpTLlJhd1RleHR1cmUyREFycmF5O1xuICBhdGxhczogc3RyaW5nW107XG59O1xuXG5leHBvcnQgY2xhc3MgRW50aXR5Q2FjaGUge1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBpbml0aWFsRW50aXR5Q3VsbERpc3RhbmNlID0gMjUwO1xuICBwcml2YXRlIHN0YXRpYyBjb250YWluZXJzOiBSZWNvcmQ8TW9kZWxLZXksIFByb21pc2U8RW50aXR5Q29udGFpbmVyIHwgbnVsbD4+ID1cbiAgICB7fTtcbiAgcHJpdmF0ZSBzdGF0aWMgcmVzb2x2ZWRDb250YWluZXJzOiBSZWNvcmQ8TW9kZWxLZXksIEVudGl0eUNvbnRhaW5lciB8IG51bGw+ID1cbiAgICB7fTtcbiAgcHJpdmF0ZSBzdGF0aWMgY29tbW9uQmFzaXNBdGxhczogUmVjb3JkPHN0cmluZywgQmFzaXNBdGxhcz4gPSB7fTtcbiAgcHJpdmF0ZSBzdGF0aWMgY29tbW9uQmFzaXNBdGxhc0xvYWRlZCA9IGZhbHNlO1xuICBwcml2YXRlIHN0YXRpYyBjb21tb25CYXNpc0F0bGFzUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyBnZW5lcmF0aW9uID0gMDtcbiAgcHJpdmF0ZSBzdGF0aWMgYWN0aXZlUG9vbHMgPSBuZXcgU2V0PFNoYWRvRW50aXR5UG9vbD4oKTtcblxuICBwdWJsaWMgc3RhdGljIGdhbWVNYW5hZ2VyOiBHYW1lTWFuYWdlcjtcbiAgLyoqXG4gICAqIFJldHJpZXZlcyBvciBjcmVhdGVzIGEgc2hhcmVkIHBhcmVudCBub2RlIG9uIHRoZSBzY2VuZVxuICAgKiB1bmRlciB3aGljaCBhbGwgZW50aXRpZXMgd2lsbCBiZSBidWNrZXRlZC5cbiAgICovXG4gIHByaXZhdGUgc3RhdGljIGdldE9yQ3JlYXRlTm9kZUNvbnRhaW5lcihzY2VuZTogQkpTLlNjZW5lKTogQkpTLk5vZGUge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gc2NlbmUuZ2V0Tm9kZUJ5TmFtZShcIkVudGl0eU5vZGVDb250YWluZXJcIik7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICByZXR1cm4gZXhpc3RpbmcgYXMgQkpTLk5vZGU7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQkFCWUxPTi5UcmFuc2Zvcm1Ob2RlKFwiRW50aXR5Tm9kZUNvbnRhaW5lclwiLCBzY2VuZSk7XG4gIH1cblxuICAvKipcbiAgICogTG9hZHMgKG9yIHJldHVybnMgY2FjaGVkKSBtZXNoL2FuaW1hdGlvbiBjb250YWluZXIgZm9yIGEgZ2l2ZW4gbW9kZWwuXG4gICAqIEBwYXJhbSBtb2RlbCAgICAgICBtb2RlbCBrZXkgKGxvd2VyY2FzZWQpXG4gICAqIEBwYXJhbSBzY2VuZSAgICAgICBCYWJ5bG9uIHNjZW5lXG4gICAqIEBwYXJhbSBwYXJlbnROb2RlICBwYXJlbnQgdW5kZXIgd2hpY2ggdG8gYXR0YWNoOyBkZWZhdWx0cyB0byBzaGFyZWQgY29udGFpbmVyXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGFzeW5jIGdldENvbnRhaW5lcihcbiAgICBtb2RlbDogc3RyaW5nLFxuICAgIHNjZW5lOiBCSlMuU2NlbmUsXG4gICk6IFByb21pc2U8RW50aXR5Q29udGFpbmVyIHwgbnVsbD4ge1xuICAgIG1vZGVsID0gbW9kZWwudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCByZXF1ZXN0R2VuZXJhdGlvbiA9IEVudGl0eUNhY2hlLmdlbmVyYXRpb247XG4gICAgaWYgKCFFbnRpdHlDYWNoZS5jb21tb25CYXNpc0F0bGFzTG9hZGVkKSB7XG4gICAgICBpZiAoIUVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNQcm9taXNlKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSBFbnRpdHlDYWNoZS5sb2FkQ29tbW9uQmFzaXNBdGxhcyhcbiAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICByZXF1ZXN0R2VuZXJhdGlvbixcbiAgICAgICAgKTtcbiAgICAgICAgRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1Byb21pc2UgPSBwcm9taXNlO1xuICAgICAgICB2b2lkIHByb21pc2UudGhlbihcbiAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1Byb21pc2UgPT09IHByb21pc2UpIHtcbiAgICAgICAgICAgICAgRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1Byb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNQcm9taXNlID09PSBwcm9taXNlKSB7XG4gICAgICAgICAgICAgIEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgYXdhaXQgRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1Byb21pc2U7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHJlcXVlc3RHZW5lcmF0aW9uICE9PSBFbnRpdHlDYWNoZS5nZW5lcmF0aW9uIHx8XG4gICAgICAhRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc0xvYWRlZFxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgYnVja2V0ID0gRW50aXR5Q2FjaGUuZ2V0T3JDcmVhdGVOb2RlQ29udGFpbmVyKHNjZW5lKTtcbiAgICBjb25zdCBiYXNlTW9kZWwgPSBtb2RlbC5zbGljZSgwLCAzKTtcbiAgICBpZiAoIUVudGl0eUNhY2hlLmNvbnRhaW5lcnNbbW9kZWxdKSB7XG4gICAgICBjb25zdCBnZW5lcmF0aW9uID0gRW50aXR5Q2FjaGUuZ2VuZXJhdGlvbjtcbiAgICAgIEVudGl0eUNhY2hlLmNvbnRhaW5lcnNbbW9kZWxdID0gKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gTG9hZCAuYmFieWxvblxuICAgICAgICBjb25zdCBieXRlcyA9IGF3YWl0IEZpbGVTeXN0ZW0uZ2V0RmlsZUJ5dGVzKFxuICAgICAgICAgIFwiZXFyZXF1aWVtL2JhYnlsb25cIixcbiAgICAgICAgICBgJHttb2RlbH0uYmFieWxvbi5nemAsXG4gICAgICAgICk7XG4gICAgICAgIGlmICghYnl0ZXMpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgW0VudGl0eUNhY2hlXSBGYWlsZWQgdG8gbG9hZCBtb2RlbCAke21vZGVsfWApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGF3YWl0IEJBQllMT04ubG9hZEJhYnlsb25Bc3NldENvbnRhaW5lcihieXRlcywgc2NlbmUsIHtcbiAgICAgICAgICBuYW1lOiBgJHttb2RlbH0uYmFieWxvbmAsXG4gICAgICAgIH0pLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFtFbnRpdHlDYWNoZV0gRXJyb3IgbG9hZGluZyBtb2RlbCAke21vZGVsfTpgLCBlKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghY29udGFpbmVyKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBdHRhY2ggdG8gYnVja2V0XG4gICAgICAgIGNvbnN0IHJvb3QgPSBnZXRPckNyZWF0ZUFzc2V0Q29udGFpbmVyUm9vdChcbiAgICAgICAgICBjb250YWluZXIsXG4gICAgICAgICAgc2NlbmUsXG4gICAgICAgICAgYGNvbnRhaW5lcl8ke21vZGVsfWAsXG4gICAgICAgICk7XG4gICAgICAgIHJvb3Quc2V0UGFyZW50KGJ1Y2tldCk7XG5cbiAgICAgICAgLy8gVkFUIHNldHVwXG4gICAgICAgIGxldCBtYW5hZ2VyOiBCSlMuQmFrZWRWZXJ0ZXhBbmltYXRpb25NYW5hZ2VyIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBzaGFkZXJNYXRlcmlhbDogQkpTLlNoYWRlck1hdGVyaWFsIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBwaWNraW5nTWF0ZXJpYWw6IEJKUy5TaGFkZXJNYXRlcmlhbCB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgdGV4dHVyZUF0bGFzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBzaGFkb1Bvb2wgPSBhd2FpdCBTaGFkb0VudGl0eVBvb2wuY3JlYXRlKHNjZW5lLmdldEVuZ2luZSgpKTtcblxuICAgICAgICAvLyBWZXJ0ZXggYW5pbWF0aW9uIGRhdGFcbiAgICAgICAgY29uc3QgY2FuVXNlRmxvYXQxNiA9IHNjZW5lLmdldEVuZ2luZSgpLmdldENhcHMoKS50ZXh0dXJlSGFsZkZsb2F0O1xuICAgICAgICBjb25zdCB2YXQxNiA9IGAke21vZGVsfS5iaW4uZ3pgO1xuICAgICAgICBjb25zdCB2YXQzMiA9IGAke21vZGVsfV8zMi5iaW4uZ3pgO1xuICAgICAgICBjb25zdCB2YXRCeXRlcyA9IGF3YWl0IEZpbGVTeXN0ZW0uZ2V0RmlsZUJ5dGVzKFxuICAgICAgICAgIFwiZXFyZXF1aWVtL3ZhdFwiLFxuICAgICAgICAgIGNhblVzZUZsb2F0MTYgPyB2YXQxNiA6IHZhdDMyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXZhdEJ5dGVzKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBbRW50aXR5Q2FjaGVdIFZBVCBkYXRhIG1pc3NpbmcgZm9yICR7bW9kZWx9YCk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmF0RGF0YSA9IGNhblVzZUZsb2F0MTZcbiAgICAgICAgICA/IG5ldyBVaW50MTZBcnJheSh2YXRCeXRlcylcbiAgICAgICAgICA6IG5ldyBGbG9hdDMyQXJyYXkodmF0Qnl0ZXMpO1xuICAgICAgICBtYW5hZ2VyID0gbmV3IEJBQllMT04uQmFrZWRWZXJ0ZXhBbmltYXRpb25NYW5hZ2VyKHNjZW5lKTtcbiAgICAgICAgY29uc3QgYmFrZXIgPSBuZXcgQkFCWUxPTi5WZXJ0ZXhBbmltYXRpb25CYWtlcihcbiAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICBjb250YWluZXIuc2tlbGV0b25zWzBdLFxuICAgICAgICApO1xuICAgICAgICBtYW5hZ2VyLnRleHR1cmUgPSBiYWtlci50ZXh0dXJlRnJvbUJha2VkVmVydGV4RGF0YSh2YXREYXRhKTtcbiAgICAgICAgbWFuYWdlci50ZXh0dXJlLm5hbWUgPSBgdmF0VGV4dHVyZTE2XyR7bW9kZWx9YDtcbiAgICAgICAgY29udGFpbmVyLmFkZFRvU2NlbmUoKG0pID0+IHtcbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgKG0gaW5zdGFuY2VvZiBCQUJZTE9OLk1lc2ggJiYgbS5nZXRUb3RhbFZlcnRpY2VzKCkgPiAwKSB8fFxuICAgICAgICAgICAgbSBpbnN0YW5jZW9mIEJBQllMT04uR2VvbWV0cnkgfHxcbiAgICAgICAgICAgIG0gaW5zdGFuY2VvZiBCQUJZTE9OLlNrZWxldG9uIHx8XG4gICAgICAgICAgICBtIGluc3RhbmNlb2YgQkFCWUxPTi5UcmFuc2Zvcm1Ob2RlXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEJhc2lzIHRleHR1cmVzXG4gICAgICAgIGNvbnN0IGJhc2lzQnl0ZXMgPSBhd2FpdCBGaWxlU3lzdGVtLmdldEZpbGVCeXRlcyhcbiAgICAgICAgICBcImVxcmVxdWllbS9iYXNpc1wiLFxuICAgICAgICAgIGAke2Jhc2VNb2RlbH0uYmFzaXNgLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWJhc2lzQnl0ZXMpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYFtFbnRpdHlDYWNoZV0gQmFzaXMgdGV4dHVyZSBtaXNzaW5nIGZvciAke21vZGVsfWApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgZGF0YSwgbGF5ZXJDb3VudCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0IH0gPSBhd2FpdCBsb2FkQmFzaXNUZXh0dXJlKFxuICAgICAgICAgIHNjZW5lLmdldEVuZ2luZSgpLFxuICAgICAgICAgIGJhc2lzQnl0ZXMsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IHRleHR1cmVBcnJheSA9IG5ldyBCQUJZTE9OLlJhd1RleHR1cmUyREFycmF5KFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgIGxheWVyQ291bnQsXG4gICAgICAgICAgZm9ybWF0LFxuICAgICAgICAgIHNjZW5lLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIEJBQllMT04uQ29uc3RhbnRzLlRFWFRVUkVfVFJJTElORUFSX1NBTVBMSU5HTU9ERSxcbiAgICAgICAgKTtcbiAgICAgICAgdGV4dHVyZUFycmF5LnVwZGF0ZShkYXRhKTtcblxuICAgICAgICAvLyBTaGFkZXIgbWF0ZXJpYWxcbiAgICAgICAgc2hhZGVyTWF0ZXJpYWwgPSBjcmVhdGVWQVRTaGFkZXJNYXRlcmlhbChzY2VuZSwgc2hhZG9Qb29sLCBtb2RlbCk7XG4gICAgICAgIHBpY2tpbmdNYXRlcmlhbCA9IGNyZWF0ZVZBVFBpY2tpbmdNYXRlcmlhbChzY2VuZSwgc2hhZG9Qb29sLCBtb2RlbCk7XG5cbiAgICAgICAgLy8gQXRsYXNcbiAgICAgICAgdGV4dHVyZUF0bGFzID1cbiAgICAgICAgICAoYXdhaXQgRmlsZVN5c3RlbS5nZXRGaWxlSlNPTjxzdHJpbmdbXT4oXG4gICAgICAgICAgICBcImVxcmVxdWllbS9iYXNpc1wiLFxuICAgICAgICAgICAgYCR7YmFzZU1vZGVsfS5qc29uYCxcbiAgICAgICAgICApKSA/PyBbXTtcbiAgICAgICAgaWYgKCF0ZXh0dXJlQXRsYXMubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBbRW50aXR5Q2FjaGVdIFZBVCBhdGxhcyBtaXNzaW5nIGZvciAke21vZGVsfWApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQW5pbWF0ZVxuICAgICAgICBjb25zdCBmcmFtZVVwZGF0ZSA9ICgpID0+IHtcbiAgICAgICAgICBtYW5hZ2VyIS50aW1lICs9IHNjZW5lLmdldEVuZ2luZSgpLmdldERlbHRhVGltZSgpIC8gMTAwMDtcbiAgICAgICAgfTtcbiAgICAgICAgc2NlbmUucmVnaXN0ZXJCZWZvcmVSZW5kZXIoZnJhbWVVcGRhdGUpO1xuXG4gICAgICAgIGJ1Y2tldC5vbkRpc3Bvc2VPYnNlcnZhYmxlLmFkZCgoKSA9PlxuICAgICAgICAgIHNjZW5lLnVucmVnaXN0ZXJCZWZvcmVSZW5kZXIoZnJhbWVVcGRhdGUpLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEdhdGhlciBhbmltYXRpb25zXG4gICAgICAgIGxldCBhbmltYXRpb25zOiBBbmltYXRpb25FbnRyeVtdID0gW107XG4gICAgICAgIGNvbnN0IGluZm9Ob2RlID0gKHJvb3QgYXMgYW55KS5nZXRDaGlsZFRyYW5zZm9ybU5vZGVzKCk/LlswXTtcbiAgICAgICAgY29uc3QgYm91bmRpbmdCb3ggPVxuICAgICAgICAgIGluZm9Ob2RlPy5tZXRhZGF0YT8uZ2x0Zj8uZXh0cmFzPy5ib3VuZGluZ0JveCA/PyBudWxsO1xuICAgICAgICBjb25zdCBqc29uID0gKGF3YWl0IEZpbGVTeXN0ZW0uZ2V0RmlsZUpTT04oXG4gICAgICAgICAgXCJlcXJlcXVpZW0vdmF0XCIsXG4gICAgICAgICAgYCR7bW9kZWx9Lmpzb25gLFxuICAgICAgICApKSBhcyBhbnk7XG4gICAgICAgIGlmIChqc29uKSB7XG4gICAgICAgICAgYW5pbWF0aW9ucyA9IChqc29uLmFuaW1hdGlvbnMgYXMgQW5pbWF0aW9uRW50cnlbXSkubWFwKChhbmltYXRpb24pID0+ICh7XG4gICAgICAgICAgICAuLi5hbmltYXRpb24sXG4gICAgICAgICAgICBmcHM6IGFuaW1hdGlvbi5mcHMgPz8ganNvbi5mcHMgPz8gNjAsXG4gICAgICAgICAgfSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHJhbmdlcyA9XG4gICAgICAgICAgICBpbmZvTm9kZT8ubWV0YWRhdGE/LmdsdGY/LmV4dHJhcz8uYW5pbWF0aW9uUmFuZ2VzID8/IFtdO1xuICAgICAgICAgIGxldCBvZmZzZXQgPSAwO1xuICAgICAgICAgIGFuaW1hdGlvbnMgPSByYW5nZXMubWFwKChyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IHtcbiAgICAgICAgICAgICAgZnJvbTogci5mcm9tICsgb2Zmc2V0LFxuICAgICAgICAgICAgICB0bzogTWF0aC5tYXgoMCwgci50byArIG9mZnNldCksXG4gICAgICAgICAgICAgIG5hbWU6IHIubmFtZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBvZmZzZXQgKz0gci50bztcbiAgICAgICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgbWVzaGVzXG4gICAgICAgIGNvbnN0IG1lc2hlcyA9IGdldEFzc2V0Q29udGFpbmVyTWVzaGVzKGNvbnRhaW5lcik7XG4gICAgICAgIGlmICghbWVzaGVzLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgIGBbRW50aXR5Q2FjaGVdIE1vZGVsICR7bW9kZWx9IGNvbnRhaW5zIG5vIHJlbmRlcmFibGUgbWVzaGVzYCxcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnRhaW5lci5kaXNwb3NlKCk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdWJtZXNoUmFuZ2VzOiBNYXA8bnVtYmVyLCBTdWJtZXNoUmFuZ2U+ID0gbmV3IE1hcCgpO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgbWVzaCBvZiBtZXNoZXMpIHtcbiAgICAgICAgICBtZXNoLm1ldGFkYXRhID8/PSB7fTtcbiAgICAgICAgICBtZXNoLmNvbXB1dGVXb3JsZE1hdHJpeCh0cnVlKTtcbiAgICAgICAgICBtZXNoLmJha2VUcmFuc2Zvcm1JbnRvVmVydGljZXMobWVzaC5nZXRXb3JsZE1hdHJpeCgpKTtcbiAgICAgICAgICAvLyBUaGUgbGVnYWN5IFMzRCAtPiBCYWJ5bG9uIGV4cG9ydHMgdXNlIHRoZSBvcHBvc2l0ZSB3aW5kaW5nIGFuZFxuICAgICAgICAgIC8vIHN0aWxsIG5lZWQgdGhpcyBjb21wYXRpYmlsaXR5IGZsaXAuIE1vZGVybiBHTEItZGVyaXZlZCBidW5kbGVzXG4gICAgICAgICAgLy8gZGVjbGFyZSB0aGF0IHRoZWlyIGxvYWRlci1ub3JtYWxpemVkIHdpbmRpbmcgbXVzdCBiZSBwcmVzZXJ2ZWQuXG4gICAgICAgICAgaWYgKCFtZXNoLm1ldGFkYXRhLmdsdGY/LmV4dHJhcz8ucHJlc2VydmVSdW50aW1lV2luZGluZykge1xuICAgICAgICAgICAgbWVzaC5mbGlwRmFjZXModHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHsgbW9kZWwsIHZhcmlhdGlvbiwgdGV4TnVtIH0gPSBtZXNoLm1ldGFkYXRhLmdsdGYuZXh0cmFzIGFzIGFueTtcbiAgICAgICAgICBsZXQgcGllY2UgPSBtZXNoLm1ldGFkYXRhLmdsdGYuZXh0cmFzLnBpZWNlPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gICAgICAgICAgbGV0IGF0bGFzSW5kZXggPSAwO1xuICAgICAgICAgIGxldCBuYW1lID0gbWVzaC5tYXRlcmlhbD8ubmFtZT8udG9Mb3dlckNhc2UoKSA/PyBcIlwiO1xuICAgICAgICAgIGlmICghbmFtZSkge1xuICAgICAgICAgICAgbmFtZSA9IGAke21vZGVsfSR7cGllY2V9JHt2YXJpYXRpb259JHt0ZXhOdW19YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByYW5nZSA9IHtcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICB0ZXh0dXJlQXR0cmlidXRlc0J1ZmZlcjogbmV3IEZsb2F0MzJBcnJheSg0KSxcbiAgICAgICAgICAgIGlzUm9iZTogZmFsc2UsXG4gICAgICAgICAgICBpc0hlbG06IGZhbHNlLFxuICAgICAgICAgICAgYXRsYXNBcnJheTogdGV4dHVyZUF0bGFzLFxuICAgICAgICAgICAgbWV0YWRhdGE6IHsgbW9kZWwsIHBpZWNlOiBwaWVjZS50b0xvd2VyQ2FzZSgpLCB2YXJpYXRpb24sIHRleE51bSB9LFxuICAgICAgICAgIH0gYXMgU3VibWVzaFJhbmdlO1xuXG4gICAgICAgICAgaWYgKGlzUGxheWVyUmFjZShtb2RlbCkpIHtcbiAgICAgICAgICAgIGlmIChuYW1lPy50b0xvd2VyQ2FzZSgpPy5zdGFydHNXaXRoKFwiY2xrXCIpKSB7XG4gICAgICAgICAgICAgIGF0bGFzSW5kZXggPSAxO1xuICAgICAgICAgICAgICByYW5nZS5pc1JvYmUgPSB0cnVlO1xuICAgICAgICAgICAgICByYW5nZS5hdGxhc0FycmF5ID0gRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1tcImNsa1wiXS5hdGxhcztcbiAgICAgICAgICAgICAgcGllY2UgPSBcImNoXCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICB0ZXhOdW0gIT09IFwiMDFcIiAmJlxuICAgICAgICAgICAgICBwaWVjZSA9PT0gTWF0ZXJpYWxQcmVmaXhlcy5IZWxtICYmXG4gICAgICAgICAgICAgIChuYW1lPy50b0xvd2VyQ2FzZSgpPy5zdGFydHNXaXRoKFwiaGVsbVwiKSB8fFxuICAgICAgICAgICAgICAgIG5hbWU/LnRvTG93ZXJDYXNlKCk/LnN0YXJ0c1dpdGgoXCJjaGFpblwiKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBhdGxhc0luZGV4ID0gMjtcbiAgICAgICAgICAgICAgcmFuZ2UuaXNIZWxtID0gdHJ1ZTtcbiAgICAgICAgICAgICAgcmFuZ2UuYXRsYXNBcnJheSA9IEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNbXCJoZWxtXCJdLmF0bGFzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHN1Ym1lc2hSYW5nZXMuc2V0KGksIHJhbmdlKTtcblxuICAgICAgICAgIGNvbnN0IHZlcnRleENvdW50ID0gbWVzaC5nZXRUb3RhbFZlcnRpY2VzKCk7XG4gICAgICAgICAgY29uc3QgZGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkodmVydGV4Q291bnQgKiAyKTtcbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHZlcnRleENvdW50OyBqKyspIHtcbiAgICAgICAgICAgIGRhdGFbaiAqIDJdID0gYXRsYXNJbmRleDtcbiAgICAgICAgICAgIGRhdGFbaiAqIDIgKyAxXSA9IGk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG1lc2guc2V0VmVydGljZXNEYXRhKFwic3VibWVzaERhdGFcIiwgZGF0YSwgZmFsc2UsIDIpO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXh0dXJlQXR0cmlidXRlc0RpcnR5UmVmID0ge1xuICAgICAgICAgIHZhbHVlOiB0cnVlLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBhbGxTdWJtZXNoRGF0YUJ1ZmZlcnM6IEZsb2F0MzJBcnJheVtdID0gW107XG4gICAgICAgIG1lc2hlcy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICAgICAgY29uc3QgZCA9IG0uZ2V0VmVydGljZXNEYXRhKFwic3VibWVzaERhdGFcIikhO1xuICAgICAgICAgIGFsbFN1Ym1lc2hEYXRhQnVmZmVycy5wdXNoKGQgYXMgYW55KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG1lcmdlZE1lc2ggPSBCQUJZTE9OLk1lc2guTWVyZ2VNZXNoZXMoXG4gICAgICAgICAgbWVzaGVzLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICApITtcbiAgICAgICAgbWVyZ2VkTWVzaC5pc1BpY2thYmxlID0gdHJ1ZTtcbiAgICAgICAgbWVyZ2VkTWVzaC50aGluSW5zdGFuY2VFbmFibGVQaWNraW5nID0gZmFsc2U7XG4gICAgICAgIG1lcmdlZE1lc2gucG9pbnRlck92ZXJEaXNhYmxlTWVzaFRlc3RpbmcgPSB0cnVlO1xuICAgICAgICAvLyBob3cgbWFueSB0b3RhbCB2ZXJ0cz9cbiAgICAgICAgY29uc3QgdG90YWxWZXJ0cyA9IGFsbFN1Ym1lc2hEYXRhQnVmZmVyc1xuICAgICAgICAgIC5tYXAoKGJ1ZikgPT4gYnVmLmxlbmd0aCAvIDIgLyogc3RyaWRlKi8pXG4gICAgICAgICAgLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApO1xuXG4gICAgICAgIC8vIGZsYXR0ZW4gdGhlbSBpbnRvIG9uZSBiaWcgRmxvYXQzMkFycmF5IChzdHJpZGUgPSAyKVxuICAgICAgICBjb25zdCBtZXJnZWRTdWJtZXNoRGF0YSA9IG5ldyBGbG9hdDMyQXJyYXkodG90YWxWZXJ0cyAqIDIpO1xuICAgICAgICBsZXQgb2Zmc2V0VmVydGljZXMgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGJ1ZiBvZiBhbGxTdWJtZXNoRGF0YUJ1ZmZlcnMpIHtcbiAgICAgICAgICAvLyBidWYubGVuZ3RoIGlzICgjdmVydHMgKiAyKVxuICAgICAgICAgIG1lcmdlZFN1Ym1lc2hEYXRhLnNldChidWYsIG9mZnNldFZlcnRpY2VzICogMik7XG4gICAgICAgICAgb2Zmc2V0VmVydGljZXMgKz0gYnVmLmxlbmd0aCAvIDI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBfbm93XyByZS1hdHRhY2hcbiAgICAgICAgbWVyZ2VkTWVzaC5zZXRWZXJ0aWNlc0RhdGEoXG4gICAgICAgICAgXCJzdWJtZXNoRGF0YVwiLFxuICAgICAgICAgIG1lcmdlZFN1Ym1lc2hEYXRhLFxuICAgICAgICAgIC8qIHVwZGF0YWJsZSovIGZhbHNlLFxuICAgICAgICAgIC8qIHN0cmlkZSovIDIsXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3Qgc3VibWVzaENvdW50ID0gbWVzaGVzLmxlbmd0aDtcbiAgICAgICAgY29uc3QgZnJlZVRoaW5JbnN0YW5jZXM6IG51bWJlcltdID0gW107XG4gICAgICAgIGNvbnN0IGFkZFRoaW5JbnN0YW5jZSA9IChcbiAgICAgICAgICBtYXRyaXg6IEJKUy5NYXRyaXgsXG4gICAgICAgICAgZW50aXR5SWQ6IG51bWJlcixcbiAgICAgICAgKTogbnVtYmVyID0+IHtcbiAgICAgICAgICBjb25zdCBzaGFkb1Nsb3QgPSBzaGFkb1Bvb2wuYWNxdWlyZShlbnRpdHlJZCwgc3VibWVzaENvdW50KTtcbiAgICAgICAgICBjb25zdCByZXVzYWJsZUluZGV4ID0gZnJlZVRoaW5JbnN0YW5jZXMucG9wKCk7XG4gICAgICAgICAgaWYgKHJldXNhYmxlSW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaWYgKHJldXNhYmxlSW5kZXggIT09IHNoYWRvU2xvdC5pbmRleCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJTaGFkbyBhbmQgQmFieWxvbiBpbnN0YW5jZSBwb29scyBsb3N0IGluZGV4IGFsaWdubWVudFwiLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWVyZ2VkTWVzaC50aGluSW5zdGFuY2VTZXRNYXRyaXhBdChyZXVzYWJsZUluZGV4LCBtYXRyaXgsIHRydWUpO1xuICAgICAgICAgICAgcmV0dXJuIHNoYWRvU2xvdC5pbmRleDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgaW5zdGFuY2VJZHggPSBtZXJnZWRNZXNoLnRoaW5JbnN0YW5jZUFkZChtYXRyaXgsIHRydWUpO1xuICAgICAgICAgIGlmIChpbnN0YW5jZUlkeCAhPT0gc2hhZG9TbG90LmluZGV4KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgIFwiU2hhZG8gYW5kIEJhYnlsb24gaW5zdGFuY2UgcG9vbHMgbG9zdCBpbmRleCBhbGlnbm1lbnRcIixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzaGFkb1Nsb3QuaW5kZXg7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHJlbW92ZVRoaW5JbnN0YW5jZSA9IChpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgaWYgKGZyZWVUaGluSW5zdGFuY2VzLmluY2x1ZGVzKGluZGV4KSkgcmV0dXJuO1xuICAgICAgICAgIG1lcmdlZE1lc2gudGhpbkluc3RhbmNlU2V0TWF0cml4QXQoXG4gICAgICAgICAgICBpbmRleCxcbiAgICAgICAgICAgIEJBQllMT04uTWF0cml4Llplcm8oKSxcbiAgICAgICAgICAgIHRydWUsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBzaGFkb1Bvb2wucmVsZWFzZShpbmRleCk7XG4gICAgICAgICAgZnJlZVRoaW5JbnN0YW5jZXMucHVzaChpbmRleCk7XG4gICAgICAgIH07XG4gICAgICAgIG1lcmdlZE1lc2gubWV0YWRhdGEgPSB7XG4gICAgICAgICAgdGV4dHVyZUF0dHJpYnV0ZXNEaXJ0eVJlZixcbiAgICAgICAgICBzaGFkb1Bvb2wsXG4gICAgICAgICAgc3VibWVzaENvdW50LFxuICAgICAgICAgIGF0bGFzQXJyYXlUZXh0dXJlOiB0ZXh0dXJlQXJyYXksXG4gICAgICAgICAgY2xvYWtBdGxhc0FycmF5VGV4dHVyZTogRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1tcImNsa1wiXS50ZXh0dXJlLFxuICAgICAgICAgIGhlbG1BdGxhc0FycmF5VGV4dHVyZTogRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc1tcImhlbG1cIl0udGV4dHVyZSxcbiAgICAgICAgICB2YXRUZXh0dXJlOiBtYW5hZ2VyIS50ZXh0dXJlLFxuICAgICAgICAgIHZhdFRleHR1cmVTaXplSW52ZXJ0ZWQ6IG5ldyBCQUJZTE9OLlZlY3RvcjIoXG4gICAgICAgICAgICAxIC8gbWFuYWdlciEudGV4dHVyZS5nZXRTaXplKCkud2lkdGgsXG4gICAgICAgICAgICAxIC8gbWFuYWdlciEudGV4dHVyZS5nZXRTaXplKCkuaGVpZ2h0LFxuICAgICAgICAgICksXG4gICAgICAgICAgZ3B1UGlja2luZ01hdGVyaWFsOiBwaWNraW5nTWF0ZXJpYWwsXG4gICAgICAgIH0gYXMgRW50aXR5TWVzaE1ldGFkYXRhO1xuXG4gICAgICAgIG1lcmdlZE1lc2guc2tlbGV0b24gPSBjb250YWluZXIuc2tlbGV0b25zWzBdIHx8IG51bGw7XG4gICAgICAgIG1lcmdlZE1lc2gucGFyZW50ID0gYnVja2V0O1xuICAgICAgICBtZXJnZWRNZXNoLm5hbWUgPSBtb2RlbDtcbiAgICAgICAgbWVyZ2VkTWVzaC5iYWtlZFZlcnRleEFuaW1hdGlvbk1hbmFnZXIgPSBtYW5hZ2VyITtcbiAgICAgICAgbWVyZ2VkTWVzaC5wYXJlbnQgPSBudWxsO1xuXG4gICAgICAgIG1lcmdlZE1lc2gucG9zaXRpb24uc2V0KDAsIDAsIDApO1xuICAgICAgICBtZXJnZWRNZXNoLnJvdGF0aW9uLnNldCgwLCAwLCAwKTtcbiAgICAgICAgbWVyZ2VkTWVzaC5zY2FsaW5nLnNldCgxLCAxLCAxKTtcbiAgICAgICAgbWVyZ2VkTWVzaC50aGluSW5zdGFuY2VSZWdpc3RlckF0dHJpYnV0ZShcIm1hdHJpeFwiLCAxNik7XG4gICAgICAgIGNvbnN0IG1hdCA9IG1lcmdlZE1lc2gubWF0ZXJpYWw7XG4gICAgICAgIGlmICghbWF0KSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBbRW50aXR5Q2FjaGVdIE1lc2ggJHttZXJnZWRNZXNoLm5hbWV9IGhhcyBubyBtYXRlcmlhbGApO1xuICAgICAgICAgIC8vIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIG1hdD8uZGlzcG9zZSh0cnVlLCB0cnVlKTtcbiAgICAgICAgbWVyZ2VkTWVzaC5tYXRlcmlhbCA9IHNoYWRlck1hdGVyaWFsITtcbiAgICAgICAgbWVyZ2VkTWVzaC5wYXJlbnQgPSBidWNrZXQ7XG5cbiAgICAgICAgY29uc3QgYXR0YWNobWVudEJvbmVJbmRpY2VzID0gT2JqZWN0LmZyb21FbnRyaWVzKFxuICAgICAgICAgIChjb250YWluZXIuc2tlbGV0b25zWzBdPy5ib25lcyA/PyBbXSkubWFwKChib25lKSA9PiBbXG4gICAgICAgICAgICBib25lLm5hbWUsXG4gICAgICAgICAgICBib25lLmdldEluZGV4KCksXG4gICAgICAgICAgXSksXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGF0dGFjaG1lbnRHZW9tZXRyeVRyYW5zZm9ybXM6IFJlY29yZDxzdHJpbmcsIEJKUy5NYXRyaXg+ID0ge307XG4gICAgICAgIGlmIChtb2RlbCA9PT0gXCJodW1cIiB8fCBtb2RlbCA9PT0gXCJodWZcIikge1xuICAgICAgICAgIGNvbnN0IHNrZWxldG9uID0gY29udGFpbmVyLnNrZWxldG9uc1swXTtcbiAgICAgICAgICBjb25zdCBydW50aW1lU2NhbGUgPSBOdW1iZXIoXG4gICAgICAgICAgICBpbmZvTm9kZT8ubWV0YWRhdGE/LmdsdGY/LmV4dHJhcz8ucnVudGltZVNjYWxlLFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgYWxpYXNlcyA9IHtcbiAgICAgICAgICAgIHJfcG9pbnQ6IFwic29ja2V0X2hhbmQuUlwiLFxuICAgICAgICAgICAgbF9wb2ludDogXCJzb2NrZXRfaGFuZC5MXCIsXG4gICAgICAgICAgICBzaGllbGRfcG9pbnQ6IFwic29ja2V0X2hhbmQuTFwiLFxuICAgICAgICAgICAgaGVhZF9wb2ludDogXCJzb2NrZXRfaGVhZFwiLFxuICAgICAgICAgIH0gYXMgY29uc3Q7XG4gICAgICAgICAgaWYgKHNrZWxldG9uICYmIE51bWJlci5pc0Zpbml0ZShydW50aW1lU2NhbGUpICYmIHJ1bnRpbWVTY2FsZSA+IDApIHtcbiAgICAgICAgICAgIHNrZWxldG9uLnJldHVyblRvUmVzdCgpO1xuICAgICAgICAgICAgc2tlbGV0b24uY29tcHV0ZUFic29sdXRlTWF0cmljZXModHJ1ZSk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFthbGlhcywgc29ja2V0TmFtZV0gb2YgT2JqZWN0LmVudHJpZXMoYWxpYXNlcykpIHtcbiAgICAgICAgICAgICAgY29uc3Qgc29ja2V0ID0gc2tlbGV0b24uYm9uZXMuZmluZChcbiAgICAgICAgICAgICAgICAoYm9uZSkgPT4gYm9uZS5uYW1lID09PSBzb2NrZXROYW1lLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBpZiAoIXNvY2tldCkgY29udGludWU7XG4gICAgICAgICAgICAgIGF0dGFjaG1lbnRCb25lSW5kaWNlc1thbGlhc10gPSBzb2NrZXQuZ2V0SW5kZXgoKTtcbiAgICAgICAgICAgICAgLy8gVkFUIG1hdHJpY2VzIGFyZSBpbnZlcnNlQmluZCAqIGFuaW1hdGVkQWJzb2x1dGUsIGZvbGxvd2VkIGJ5XG4gICAgICAgICAgICAgIC8vIHRoZSBHTEItdG8tcnVudGltZSBhbGlnbm1lbnQuIEl0ZW0gZ2VvbWV0cnkgbXVzdCB0aGVyZWZvcmVcbiAgICAgICAgICAgICAgLy8gYmVnaW4gYXQgdGhlIHNvY2tldCdzIGFic29sdXRlIGJpbmQgdHJhbnNmb3JtLiBDb21wZW5zYXRlIGZvclxuICAgICAgICAgICAgICAvLyBydW50aW1lU2NhbGUgYmVjYXVzZSBFUSBpdGVtIGdlb21ldHJ5IGlzIGFscmVhZHkgYXV0aG9yZWQgaW5cbiAgICAgICAgICAgICAgLy8gc2l4LXVuaXQgZ2FtZSBzcGFjZSB3aGlsZSB0aGUgYm9keSBzb3VyY2UgaXMgYXV0aG9yZWQgaW5cbiAgICAgICAgICAgICAgLy8gbWV0ZXJzIGFuZCBzY2FsZWQgYnkgdGhlIFZBVCBhbGlnbm1lbnQuXG4gICAgICAgICAgICAgIGF0dGFjaG1lbnRHZW9tZXRyeVRyYW5zZm9ybXNbYWxpYXNdID1cbiAgICAgICAgICAgICAgICBjcmVhdGVIZWxkSXRlbUJpbmRUcmFuc2Zvcm0oXG4gICAgICAgICAgICAgICAgICBzb2NrZXQuZ2V0QWJzb2x1dGVUcmFuc2Zvcm0oKSxcbiAgICAgICAgICAgICAgICAgIHJ1bnRpbWVTY2FsZSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGl0ZW1Qb29sOiBSZWNvcmQ8c3RyaW5nLCBQcm9taXNlPEl0ZW1Db250YWluZXIgfCBudWxsPj4gPSB7fTtcbiAgICAgICAgY29uc3QgZ2V0SXRlbSA9IGFzeW5jIChcbiAgICAgICAgICBpdGVtTW9kZWw6IHN0cmluZyxcbiAgICAgICAgICBmbGlwOiBib29sZWFuID0gdHJ1ZSxcbiAgICAgICAgICBhdHRhY2htZW50Qm9uZUluZGV4PzogbnVtYmVyLFxuICAgICAgICAgIGF0dGFjaG1lbnRLZXk/OiBzdHJpbmcsXG4gICAgICAgICk6IFByb21pc2U8SXRlbUNvbnRhaW5lciB8IG51bGw+ID0+IHtcbiAgICAgICAgICBpdGVtTW9kZWwgPSBpdGVtTW9kZWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBjb25zdCBhdHRhY2htZW50Q2FjaGVLZXkgPVxuICAgICAgICAgICAgYXR0YWNobWVudEtleSA/P1xuICAgICAgICAgICAgKGF0dGFjaG1lbnRCb25lSW5kZXggPT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgICA/IFwidW5ib3VuZFwiXG4gICAgICAgICAgICAgIDogYGJvbmUtJHthdHRhY2htZW50Qm9uZUluZGV4fWApO1xuICAgICAgICAgIGNvbnN0IGl0ZW1LZXkgPSBgJHtpdGVtTW9kZWx9OiR7ZmxpcCA/IFwiZmxpcHBlZFwiIDogXCJyYXdcIn06JHthdHRhY2htZW50Q2FjaGVLZXl9YDtcbiAgICAgICAgICBpZiAoIWl0ZW1Qb29sW2l0ZW1LZXldKSB7XG4gICAgICAgICAgICBpdGVtUG9vbFtpdGVtS2V5XSA9IG5ldyBQcm9taXNlPEl0ZW1Db250YWluZXIgfCBudWxsPigocmVzKSA9PiB7XG4gICAgICAgICAgICAgIEl0ZW1DYWNoZS5nZXRDb250YWluZXIoXG4gICAgICAgICAgICAgICAgaXRlbU1vZGVsLFxuICAgICAgICAgICAgICAgIG1vZGVsLFxuICAgICAgICAgICAgICAgIHNjZW5lLFxuICAgICAgICAgICAgICAgIG1hbmFnZXIsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyLnNrZWxldG9uc1swXSA/PyBudWxsLFxuICAgICAgICAgICAgICAgIGZsaXAsXG4gICAgICAgICAgICAgICAgYXR0YWNobWVudEJvbmVJbmRleCxcbiAgICAgICAgICAgICAgICBhdHRhY2htZW50Q2FjaGVLZXksXG4gICAgICAgICAgICAgICAgYXR0YWNobWVudEdlb21ldHJ5VHJhbnNmb3Jtc1thdHRhY2htZW50Q2FjaGVLZXldLFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgLnRoZW4ocmVzKVxuICAgICAgICAgICAgICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgICAgICBgW0VudGl0eUNhY2hlXSBFcnJvciBsb2FkaW5nIGl0ZW0gbW9kZWwgJHtpdGVtTW9kZWx9OmAsXG4gICAgICAgICAgICAgICAgICAgIGUsXG4gICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICByZXMobnVsbCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGl0ZW1Qb29sW2l0ZW1LZXldO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJvb3QuZGlzcG9zZSgpO1xuXG4gICAgICAgIEVudGl0eUNhY2hlLmdhbWVNYW5hZ2VyLmFkZFRvUGlja2luZ0xpc3QobWVyZ2VkTWVzaCBhcyBCSlMuTWVzaCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjb250YWluZXIsXG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgdGV4dHVyZUF0dHJpYnV0ZXNEaXJ0eVJlZixcbiAgICAgICAgICBnZXRJdGVtLFxuICAgICAgICAgIHNoYWRvUG9vbCxcbiAgICAgICAgICBhZGRUaGluSW5zdGFuY2UsXG4gICAgICAgICAgcmVtb3ZlVGhpbkluc3RhbmNlLFxuICAgICAgICAgIHN1Ym1lc2hSYW5nZXMsXG4gICAgICAgICAgYXR0YWNobWVudEJvbmVJbmRpY2VzLFxuICAgICAgICAgIGF0dGFjaG1lbnRHZW9tZXRyeVRyYW5zZm9ybXMsXG4gICAgICAgICAgYW5pbWF0aW9ucyxcbiAgICAgICAgICBtZXNoOiBtZXJnZWRNZXNoLFxuICAgICAgICAgIHNrZWxldG9uOiBjb250YWluZXIuc2tlbGV0b25zWzBdLFxuICAgICAgICAgIG1hbmFnZXI6IG1hbmFnZXIhLFxuICAgICAgICAgIHNoYWRlck1hdGVyaWFsOiBzaGFkZXJNYXRlcmlhbCEsXG4gICAgICAgICAgcGlja2luZ01hdGVyaWFsOiBwaWNraW5nTWF0ZXJpYWwhLFxuICAgICAgICAgIGJvdW5kaW5nQm94LFxuICAgICAgICB9O1xuICAgICAgfSkoKVxuICAgICAgICAudGhlbigoYykgPT4ge1xuICAgICAgICAgIGlmIChnZW5lcmF0aW9uICE9PSBFbnRpdHlDYWNoZS5nZW5lcmF0aW9uKSB7XG4gICAgICAgICAgICBFbnRpdHlDYWNoZS5kaXNwb3NlQ29udGFpbmVyKGMpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgICBFbnRpdHlDYWNoZS5yZXNvbHZlZENvbnRhaW5lcnNbbW9kZWxdID0gYztcbiAgICAgICAgICAgIEVudGl0eUNhY2hlLmFjdGl2ZVBvb2xzLmFkZChjLnNoYWRvUG9vbCk7XG4gICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgICB9XG4gICAgICAgICAgZGVsZXRlIEVudGl0eUNhY2hlLmNvbnRhaW5lcnNbbW9kZWxdO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbRW50aXR5Q2FjaGVdIEVycm9yIGxvYWRpbmcgbW9kZWwgJHttb2RlbH06YCwgZSk7XG4gICAgICAgICAgZGVsZXRlIEVudGl0eUNhY2hlLmNvbnRhaW5lcnNbbW9kZWxdO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIEVudGl0eUNhY2hlLmNvbnRhaW5lcnNbbW9kZWxdO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBlbnRpdHlJbnN0YW5jZXMgPSBuZXcgU2V0PEVudGl0eT4oKTtcbiAgcHJpdmF0ZSBzdGF0aWMgcmVuZGVyT2JzZXJ2ZXI6IEJKUy5PYnNlcnZlcjxCSlMuQ2FtZXJhPiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyBjdWxsT2JzZXJ2ZXI6IEJKUy5PYnNlcnZlcjxCSlMuU2NlbmU+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgc3RhdGljIG9ic2VydmVyU2NlbmU6IEJKUy5TY2VuZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHN0YXRpYyBuYW1lcGxhdGVMYXllcjogU2hhZG9EeW5hbWljRW50aXR5TmFtZXBsYXRlTGF5ZXIgfCBudWxsID0gbnVsbDtcblxuICBwdWJsaWMgc3RhdGljIGluaXRpYWxpemUoc2NlbmU6IEJKUy5TY2VuZSk6IHZvaWQge1xuICAgIGlmIChFbnRpdHlDYWNoZS5yZW5kZXJPYnNlcnZlcikge1xuICAgICAgRW50aXR5Q2FjaGUub2JzZXJ2ZXJTY2VuZT8ub25BZnRlclJlbmRlckNhbWVyYU9ic2VydmFibGUucmVtb3ZlKFxuICAgICAgICBFbnRpdHlDYWNoZS5yZW5kZXJPYnNlcnZlcixcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChFbnRpdHlDYWNoZS5jdWxsT2JzZXJ2ZXIpIHtcbiAgICAgIEVudGl0eUNhY2hlLm9ic2VydmVyU2NlbmU/Lm9uQmVmb3JlUmVuZGVyT2JzZXJ2YWJsZS5yZW1vdmUoXG4gICAgICAgIEVudGl0eUNhY2hlLmN1bGxPYnNlcnZlcixcbiAgICAgICk7XG4gICAgfVxuICAgIEVudGl0eUNhY2hlLm9ic2VydmVyU2NlbmUgPSBzY2VuZTtcbiAgICBFbnRpdHlDYWNoZS5uYW1lcGxhdGVMYXllcj8uZGlzcG9zZSgpO1xuICAgIEVudGl0eUNhY2hlLm5hbWVwbGF0ZUxheWVyID0gbmV3IFNoYWRvRHluYW1pY0VudGl0eU5hbWVwbGF0ZUxheWVyKHNjZW5lLCB7XG4gICAgICBjb2xvcjogXCIjMDBmZmZmXCIsXG4gICAgICBkZXB0aFRlc3Q6IHRydWUsXG4gICAgICAvLyBBbHBoYS1ibGVuZGVkIG5hbWVwbGF0ZXMgcmVuZGVyIGFmdGVyIG9wYXF1ZSBnZW9tZXRyeSBpbiBncm91cCAwIGFuZFxuICAgICAgLy8gcmV0YWluIHRoYXQgZ3JvdXAncyBkZXB0aCBidWZmZXIuIExhdGVyIGdyb3VwcyBjbGVhciBkZXB0aCBieSBkZWZhdWx0LlxuICAgICAgcmVuZGVyaW5nR3JvdXBJZDogMCxcbiAgICAgIHdvcmxkU2NhbGU6IDEgLyAzMixcbiAgICB9KTtcbiAgICBFbnRpdHlDYWNoZS5jdWxsT2JzZXJ2ZXIgPSBzY2VuZS5vbkJlZm9yZVJlbmRlck9ic2VydmFibGUuYWRkKCgpID0+IHtcbiAgICAgIGNvbnN0IGNhbWVyYSA9IHNjZW5lLmFjdGl2ZUNhbWVyYTtcbiAgICAgIGlmICghY2FtZXJhKSByZXR1cm47XG4gICAgICBmb3IgKGNvbnN0IHBvb2wgb2YgRW50aXR5Q2FjaGUuYWN0aXZlUG9vbHMpIHtcbiAgICAgICAgcG9vbC5jdWxsKGNhbWVyYSwgNSwgRW50aXR5Q2FjaGUuaW5pdGlhbEVudGl0eUN1bGxEaXN0YW5jZSk7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBFbnRpdHlDYWNoZS5lbnRpdHlJbnN0YW5jZXMpIHtcbiAgICAgICAgZW50aXR5LmFwcGx5UmVkdWNlZFZpc2liaWxpdHkoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBFbnRpdHlDYWNoZS5yZW5kZXJPYnNlcnZlciA9IHNjZW5lLm9uQWZ0ZXJSZW5kZXJDYW1lcmFPYnNlcnZhYmxlLmFkZCgoKSA9PiB7XG4gICAgICBjb25zdCBub3cgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IG9mIEVudGl0eUNhY2hlLmVudGl0eUluc3RhbmNlcykge1xuICAgICAgICBpZiAoZW50aXR5LmxpZmVjeWNsZURpc3Bvc2VkIHx8IGVudGl0eS5pc0Rpc3Bvc2VkKCkpIHtcbiAgICAgICAgICBFbnRpdHlDYWNoZS5lbnRpdHlJbnN0YW5jZXMuZGVsZXRlKGVudGl0eSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBlbnRpdHkuc3luY01hdHJpeCgpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcIltFbnRpdHlDYWNoZV0gRW50aXR5IG1hdHJpeCBzeW5jIHNraXBwZWRcIiwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBFbnRpdHlDYWNoZS5uYW1lcGxhdGVMYXllcj8uc3luYyhcbiAgICAgICAgWy4uLkVudGl0eUNhY2hlLmVudGl0eUluc3RhbmNlc10ubWFwKChlbnRpdHkpID0+ICh7XG4gICAgICAgICAgaWQ6IGAke2VudGl0eS5zcGF3bi5uYW1lfTokeyhlbnRpdHkuc3Bhd24gYXMgU3Bhd24pLnNwYXduSWQgPz8gXCJwbGF5ZXJcIn1gLFxuICAgICAgICAgIHRleHQ6IGVudGl0eS5uYW1lcGxhdGVMaW5lcy5qb2luKFwiXFxuXCIpLFxuICAgICAgICAgIHg6IGVudGl0eS5zcGF3blBvc2l0aW9uLngsXG4gICAgICAgICAgeTogZW50aXR5LnNwYXduUG9zaXRpb24ueixcbiAgICAgICAgICB6OlxuICAgICAgICAgICAgZW50aXR5LnNwYXduUG9zaXRpb24ueSArXG4gICAgICAgICAgICAoNCArIGVudGl0eS5uYW1lcGxhdGVMaW5lcy5sZW5ndGggKiAxLjUpICogZW50aXR5LnNwYXduU2NhbGUsXG4gICAgICAgICAgdmlzaWJsZTpcbiAgICAgICAgICAgICFlbnRpdHkuaGlkZGVuICYmXG4gICAgICAgICAgICAhZW50aXR5LmxpZmVjeWNsZURpc3Bvc2VkICYmXG4gICAgICAgICAgICBCb29sZWFuKGVudGl0eS5tZXNoSW5zdGFuY2U/LmFjdG9yLnZpc2libGVGbGFnKSxcbiAgICAgICAgfSkpLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGRlbHRhID0gcGVyZm9ybWFuY2Uubm93KCkgLSBub3c7XG4gICAgICAod2luZG93IGFzIGFueSkucGVyZiA9IGRlbHRhO1xuICAgICAgLy8gY29uc29sZS5sb2coJ0RlbHRhIGZvciBlbnRpdHkgc3luYzonLCBkZWx0YSwgJ21zJyk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogSW5zdGFudGlhdGVzIGFuIEVudGl0eSB1bmRlciB0aGUgZ2l2ZW4gcGFyZW50IChvciBzaGFyZWQgY29udGFpbmVyKS5cbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgYXN5bmMgZ2V0SW5zdGFuY2UoXG4gICAgZ2FtZU1hbmFnZXI6IEdhbWVNYW5hZ2VyLFxuICAgIHNwYXduOiBTcGF3biB8IFBsYXllclByb2ZpbGUsXG4gICAgc2NlbmU6IEJKUy5TY2VuZSxcbiAgICBwYXJlbnROb2RlPzogQkpTLk5vZGUsXG4gICAgaXRlbVJlc29sdmVyPzogKHNsb3Q6IG51bWJlcikgPT4gTnVsbGFibGVJdGVtSW5zdGFuY2UsXG4gICk6IFByb21pc2U8RW50aXR5IHwgbnVsbD4ge1xuICAgIGNvbnN0IHJhY2UgPSBzcGF3bi5yYWNlID8/IDE7XG4gICAgY29uc3QgZW50cnkgPSBSQUNFX0RBVEFbcmFjZV0gPz8gUkFDRV9EQVRBW1JhY2VzLkhVTUFOXTtcbiAgICBsZXQgbW9kZWwgPSBlbnRyeVtzcGF3bi5nZW5kZXIgPz8gMF0gfHwgZW50cnlbMl07XG4gICAgbW9kZWwgPSBtb2RlbC50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGF3YWl0IEVudGl0eUNhY2hlLmdldENvbnRhaW5lcihtb2RlbCwgc2NlbmUpO1xuICAgIGlmICghY29udGFpbmVyKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgZW50aXR5ID0gbmV3IEVudGl0eShcbiAgICAgIGdhbWVNYW5hZ2VyLFxuICAgICAgc3Bhd24sXG4gICAgICBzY2VuZSxcbiAgICAgIGNvbnRhaW5lcixcbiAgICAgIHRoaXMsXG4gICAgICBwYXJlbnROb2RlISxcbiAgICAgIGVudHJ5LFxuICAgICAgaXRlbVJlc29sdmVyLFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGVudGl0eS5yZWFkeTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gc2V0dXAoKSBhY3F1aXJlcyBhIFNoYWRvL3RoaW4taW5zdGFuY2Ugc2xvdCBiZWZvcmUgbG9hZGluZyBvcHRpb25hbFxuICAgICAgLy8gYXBwZWFyYW5jZSBhc3NldHMuIE5ldmVyIGxlYXZlIGEgdmlzaWJsZSwgdW5yZWdpc3RlcmVkIHBhcnRpYWwgZW50aXR5LlxuICAgICAgZW50aXR5LmRpc3Bvc2UoKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgICBFbnRpdHlDYWNoZS5lbnRpdHlJbnN0YW5jZXMuYWRkKGVudGl0eSk7XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgdW5yZWdpc3RlcihlbnRpdHk6IEVudGl0eSk6IHZvaWQge1xuICAgIEVudGl0eUNhY2hlLmVudGl0eUluc3RhbmNlcy5kZWxldGUoZW50aXR5KTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgZGlzcG9zZShtb2RlbDogTW9kZWxLZXkpOiB2b2lkIHtcbiAgICBkZWxldGUgRW50aXR5Q2FjaGUuY29udGFpbmVyc1ttb2RlbF07XG4gIH1cblxuICBwdWJsaWMgc3RhdGljIGRpc3Bvc2VBbGwoc2NlbmU6IEJKUy5TY2VuZSk6IHZvaWQge1xuICAgIEVudGl0eUNhY2hlLmdlbmVyYXRpb24rKztcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBvZiBbLi4uRW50aXR5Q2FjaGUuZW50aXR5SW5zdGFuY2VzXSkgZW50aXR5LmRpc3Bvc2UoKTtcbiAgICBFbnRpdHlDYWNoZS5lbnRpdHlJbnN0YW5jZXMuY2xlYXIoKTtcbiAgICBFbnRpdHkuZGlzcG9zZVN0YXRpY3MoKTtcbiAgICBpZiAoRW50aXR5Q2FjaGUucmVuZGVyT2JzZXJ2ZXIpIHtcbiAgICAgIEVudGl0eUNhY2hlLm9ic2VydmVyU2NlbmU/Lm9uQWZ0ZXJSZW5kZXJDYW1lcmFPYnNlcnZhYmxlLnJlbW92ZShcbiAgICAgICAgRW50aXR5Q2FjaGUucmVuZGVyT2JzZXJ2ZXIsXG4gICAgICApO1xuICAgICAgRW50aXR5Q2FjaGUucmVuZGVyT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoRW50aXR5Q2FjaGUuY3VsbE9ic2VydmVyKSB7XG4gICAgICBFbnRpdHlDYWNoZS5vYnNlcnZlclNjZW5lPy5vbkJlZm9yZVJlbmRlck9ic2VydmFibGUucmVtb3ZlKFxuICAgICAgICBFbnRpdHlDYWNoZS5jdWxsT2JzZXJ2ZXIsXG4gICAgICApO1xuICAgICAgRW50aXR5Q2FjaGUuY3VsbE9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gICAgRW50aXR5Q2FjaGUub2JzZXJ2ZXJTY2VuZSA9IG51bGw7XG4gICAgRW50aXR5Q2FjaGUuY29tbW9uQmFzaXNBdGxhc0xvYWRlZCA9IGZhbHNlO1xuICAgIEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNQcm9taXNlID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBFbnRpdHlDYWNoZS5jb21tb25CYXNpc0F0bGFzKSB7XG4gICAgICBjb25zdCBhdGxhcyA9IEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXNba2V5XTtcbiAgICAgIGlmIChhdGxhcy50ZXh0dXJlKSB7XG4gICAgICAgIGF0bGFzLnRleHR1cmUuZGlzcG9zZSgpO1xuICAgICAgfVxuICAgIH1cbiAgICBFbnRpdHlDYWNoZS5jb21tb25CYXNpc0F0bGFzID0ge307XG4gICAgRW50aXR5Q2FjaGUubmFtZXBsYXRlTGF5ZXI/LmRpc3Bvc2UoKTtcbiAgICBFbnRpdHlDYWNoZS5uYW1lcGxhdGVMYXllciA9IG51bGw7XG4gICAgT2JqZWN0LmtleXMoRW50aXR5Q2FjaGUucmVzb2x2ZWRDb250YWluZXJzKS5mb3JFYWNoKChtKSA9PiB7XG4gICAgICBjb25zdCBjID0gRW50aXR5Q2FjaGUucmVzb2x2ZWRDb250YWluZXJzW21dO1xuICAgICAgaWYgKCFjKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIEVudGl0eUNhY2hlLmRpc3Bvc2VDb250YWluZXIoYyk7XG4gICAgICBkZWxldGUgRW50aXR5Q2FjaGUucmVzb2x2ZWRDb250YWluZXJzW21dO1xuICAgIH0pO1xuICAgIE9iamVjdC5rZXlzKEVudGl0eUNhY2hlLmNvbnRhaW5lcnMpLmZvckVhY2goKG0pID0+IHtcbiAgICAgIGRlbGV0ZSBFbnRpdHlDYWNoZS5jb250YWluZXJzW21dO1xuICAgIH0pO1xuICAgIEVudGl0eS5pbnN0YW50aWF0ZVN0YXRpY3Moc2NlbmUpO1xuICAgIEVudGl0eUNhY2hlLnJlc29sdmVkQ29udGFpbmVycyA9IHt9O1xuICAgIEVudGl0eUNhY2hlLmFjdGl2ZVBvb2xzLmNsZWFyKCk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBkaXNwb3NlQ29udGFpbmVyKGM6IEVudGl0eUNvbnRhaW5lciB8IG51bGwpOiB2b2lkIHtcbiAgICBpZiAoIWMpIHJldHVybjtcbiAgICBFbnRpdHlDYWNoZS5hY3RpdmVQb29scy5kZWxldGUoYy5zaGFkb1Bvb2wpO1xuICAgIGMubWFuYWdlcj8uZGlzcG9zZSgpO1xuICAgIGMuc2hhZG9Qb29sLmRpc3Bvc2UoKTtcbiAgICBjLnNoYWRlck1hdGVyaWFsPy5kaXNwb3NlKHRydWUsIHRydWUpO1xuICAgIGMucGlja2luZ01hdGVyaWFsPy5kaXNwb3NlKHRydWUsIHRydWUpO1xuICAgIGlmICghYy5tZXNoLmlzRGlzcG9zZWQoKSkgYy5tZXNoLmRpc3Bvc2UoKTtcbiAgICBjLmNvbnRhaW5lci5kaXNwb3NlKCk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyBhc3luYyBsb2FkQ29tbW9uQmFzaXNBdGxhcyhcbiAgICBzY2VuZTogQkpTLlNjZW5lLFxuICAgIGdlbmVyYXRpb246IG51bWJlcixcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgbG9hZGVkOiBSZWNvcmQ8c3RyaW5nLCBCYXNpc0F0bGFzPiA9IHt9O1xuICAgIGxldCBwdWJsaXNoZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBbXCJjbGtcIiwgXCJoZWxtXCJdKSB7XG4gICAgICAgIGNvbnN0IGJ5dGVzID0gYXdhaXQgRmlsZVN5c3RlbS5nZXRGaWxlQnl0ZXMoXG4gICAgICAgICAgXCJlcXJlcXVpZW0vYmFzaXNcIixcbiAgICAgICAgICBgJHtlbnRyeX0uYmFzaXNgLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWJ5dGVzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb21tb24gYmFzaXMgdGV4dHVyZSBtaXNzaW5nIGZvciAke2VudHJ5fWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgZGF0YSwgbGF5ZXJDb3VudCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0IH0gPSBhd2FpdCBsb2FkQmFzaXNUZXh0dXJlKFxuICAgICAgICAgIHNjZW5lLmdldEVuZ2luZSgpLFxuICAgICAgICAgIGJ5dGVzLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IEJBQllMT04uUmF3VGV4dHVyZTJEQXJyYXkoXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICB3aWR0aCxcbiAgICAgICAgICBoZWlnaHQsXG4gICAgICAgICAgbGF5ZXJDb3VudCxcbiAgICAgICAgICBmb3JtYXQsXG4gICAgICAgICAgc2NlbmUsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgQkFCWUxPTi5Db25zdGFudHMuVEVYVFVSRV9UUklMSU5FQVJfU0FNUExJTkdNT0RFLFxuICAgICAgICApO1xuICAgICAgICB0ZXh0dXJlLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgY29uc3QgYXRsYXMgPVxuICAgICAgICAgIChhd2FpdCBGaWxlU3lzdGVtLmdldEZpbGVKU09OPHN0cmluZ1tdPihcbiAgICAgICAgICAgIFwiZXFyZXF1aWVtL2Jhc2lzXCIsXG4gICAgICAgICAgICBgJHtlbnRyeX0uanNvbmAsXG4gICAgICAgICAgKSkgPz8gW107XG4gICAgICAgIGlmICghYXRsYXMubGVuZ3RoKSB7XG4gICAgICAgICAgdGV4dHVyZS5kaXNwb3NlKCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb21tb24gYmFzaXMgYXRsYXMgbWlzc2luZyBmb3IgJHtlbnRyeX1gKTtcbiAgICAgICAgfVxuICAgICAgICBsb2FkZWRbZW50cnldID0geyB0ZXh0dXJlLCBhdGxhcyB9O1xuICAgICAgfVxuICAgICAgaWYgKGdlbmVyYXRpb24gIT09IEVudGl0eUNhY2hlLmdlbmVyYXRpb24pIHJldHVybjtcbiAgICAgIEVudGl0eUNhY2hlLmNvbW1vbkJhc2lzQXRsYXMgPSBsb2FkZWQ7XG4gICAgICBFbnRpdHlDYWNoZS5jb21tb25CYXNpc0F0bGFzTG9hZGVkID0gdHJ1ZTtcbiAgICAgIHB1Ymxpc2hlZCA9IHRydWU7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICghcHVibGlzaGVkKSB7XG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgT2JqZWN0LnZhbHVlcyhsb2FkZWQpKSBlbnRyeS50ZXh0dXJlLmRpc3Bvc2UoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgRW50aXR5Q2FjaGU7XG5cbih3aW5kb3cgYXMgYW55KS5lYyA9IEVudGl0eUNhY2hlO1xuIl19