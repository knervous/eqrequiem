import BABYLON from "@bjs";
import { FileSystem } from "@game/FileSystem/filesystem";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";
import { getAssetContainerMeshes, getOrCreateAssetContainerRoot, } from "./asset-container";
import { swapMaterialTexture } from "./bjs-utils";
export default class ObjectCache {
    dataContainers = {};
    objectContainer = null;
    animatedMaterialNames = [];
    managerCallbacks = [];
    promotedMeshes = new Map();
    constructor(zoneContainer = null) {
        if (zoneContainer) {
            this.objectContainer = zoneContainer;
        }
    }
    async getContainer(model, scene, promotedSource) {
        if (!this.dataContainers[model]) {
            let fileName = promotedSource ? "final.glb" : `${model}.babylon`;
            let bytes;
            if (promotedSource) {
                try {
                    bytes = await fetchShadoBytes(promotedSource);
                }
                catch {
                    fileName = `${model}.glb`;
                }
            }
            bytes ??= await FileSystem.getFileBytes("eqrequiem/objects", fileName);
            if (!bytes && promotedSource) {
                fileName = `${model}.babylon`;
                bytes = await FileSystem.getFileBytes("eqrequiem/objects", fileName);
            }
            if (!bytes) {
                console.warn(`[ObjectCache] Failed to load model ${model}`);
                return null;
            }
            let result;
            try {
                result = fileName.endsWith(".glb")
                    ? await BABYLON.LoadAssetContainerAsync(new File([bytes], fileName, { type: "model/gltf-binary" }), scene)
                    : await BABYLON.loadBabylonAssetContainer(bytes, scene, {
                        name: fileName,
                    });
            }
            catch (error) {
                if (!promotedSource || fileName.endsWith(".babylon"))
                    throw error;
                const legacyFileName = `${model}.babylon`;
                const legacyBytes = await FileSystem.getFileBytes("eqrequiem/objects", legacyFileName);
                if (!legacyBytes)
                    throw error;
                result = await BABYLON.loadBabylonAssetContainer(legacyBytes, scene, { name: legacyFileName });
            }
            if (!result) {
                console.error(`Failed to load model ${model}`);
                return null;
            }
            result.addAllToScene();
            const root = getOrCreateAssetContainerRoot(result, scene, `container_${model}`);
            const modelMeshes = getAssetContainerMeshes(result);
            if (!modelMeshes.length) {
                console.warn(`[ObjectCache] Model ${model} contains no renderable meshes`);
                result.dispose();
                return null;
            }
            const { animationGroups, skeletons } = result;
            const hasAnimations = animationGroups.length > 0;
            const animationRanges = [];
            root.setEnabled(false);
            let manager = null;
            let morphTargetManager = undefined;
            const hasMorphTargets = modelMeshes.some((m) => m.morphTargetManager);
            if (hasMorphTargets) {
                console.log("[ObjectCache] Model has morph targets:", animationGroups, model);
                animationGroups[0]?.play?.(true);
                morphTargetManager = modelMeshes.find((m) => m.morphTargetManager)?.morphTargetManager ?? undefined;
                console.log("Setting morph target manager", morphTargetManager);
            }
            if (hasAnimations && !hasMorphTargets && skeletons.length) {
                for (const ag of animationGroups) {
                    const animationRange = new BABYLON.AnimationRange(ag.name, ag.from, ag.to);
                    animationRanges.push(animationRange);
                    ag.stop();
                    ag.dispose();
                }
                result.animationGroups = [];
                const canUseFloat16 = scene.getEngine().getCaps().textureHalfFloat;
                const vat16 = `${model}.bin.gz`;
                const vat32 = `${model}_32.bin.gz`;
                const vatBytes = await FileSystem.getFileBytes("eqrequiem/vat", canUseFloat16 ? vat16 : vat32);
                if (!vatBytes) {
                    console.warn(`[EntityCache] VAT data missing for ${model}`);
                    return null;
                }
                const vatData = (canUseFloat16 ? new Uint16Array(vatBytes) : new Float32Array(vatBytes));
                if (vatData) {
                    const baker = new BABYLON.VertexAnimationBaker(scene, result.skeletons[0]);
                    manager = new BABYLON.BakedVertexAnimationManager(scene);
                    // result.skeletons[0].dispose();
                    // scene.removeSkeleton(result.skeletons[0]);
                    manager.texture = baker.textureFromBakedVertexData(vatData);
                    const cb = () => {
                        if (!manager || !manager.texture) {
                            return;
                        }
                        manager.time += scene.getEngine().getDeltaTime() / 1000.0;
                    };
                    this.managerCallbacks.push(cb);
                    scene.registerBeforeRender(cb);
                }
            }
            // result.rootNodes[0].dispose();
            this.dataContainers[model] = Promise.resolve({
                container: result,
                morphTargetManager,
                hasAnimations,
                animationRanges,
                manager,
                physicsBodies: [],
            });
        }
        return this.dataContainers[model];
    }
    async addThinInstances(model, scene, instanceTranslations) {
        const dataContainer = await this.getContainer(model, scene);
        if (!dataContainer) {
            return [];
        }
        const { container, hasAnimations, animationRanges, manager, morphTargetManager, } = dataContainer;
        const root = getOrCreateAssetContainerRoot(container, scene, `container_${model}`);
        const transforms = instanceTranslations;
        const count = transforms.length;
        const matrixData = new Float32Array(16 * count);
        const animParameters = hasAnimations ? new Float32Array(count * 4) : null;
        // Store physics bodies for this model
        const physicsBodies = [];
        const meshes = getAssetContainerMeshes(container);
        const params = new BABYLON.Vector4();
        for (let i = 0; i < count; i++) {
            transforms[i].rotateY *= -1; // Invert Y rotation for correct orientation
            const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
            if (x === 0 && y === 0 && z === 0) {
                continue;
            }
            const translation = BABYLON.Matrix.Translation(x, y, z);
            const rotation = BABYLON.Matrix.RotationYawPitchRoll(BABYLON.Tools.ToRadians(rotateY), BABYLON.Tools.ToRadians(rotateX), BABYLON.Tools.ToRadians(rotateZ));
            const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
            const transform = scaling.multiply(rotation).multiply(translation);
            transform.copyToArray(matrixData, i * 16);
            if (animParameters && animationRanges.length) {
                const [firstAnimationRange] = animationRanges;
                params.set(firstAnimationRange?.from ?? 0, firstAnimationRange?.to ?? 0, 0, 60);
                animParameters.set(params.asArray(), i * 4);
            }
        }
        if (!morphTargetManager) {
            const objectMesh = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (!objectMesh) {
                console.warn(`[ObjectCache] No meshes found for model ${model}`);
                return [];
            }
            if (morphTargetManager) {
                console.log("Setting morph target manager", morphTargetManager, "MESH", objectMesh);
                objectMesh.morphTargetManager = morphTargetManager;
            }
            objectMesh.skeleton = container.skeletons[0] || null;
            objectMesh.setParent(this.objectContainer);
            objectMesh.isPickable = false;
            objectMesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
            objectMesh.alwaysSelectAsActiveMesh = true;
            objectMesh.thinInstanceRefreshBoundingInfo(true, false, false);
            if (manager) {
                objectMesh.bakedVertexAnimationManager = manager;
                objectMesh.thinInstanceSetBuffer("bakedVertexAnimationSettingsInstanced", animParameters, 4);
            }
            if (!objectMesh.name?.endsWith("-passthrough")) {
                // Create a physics shape for the mesh (shared across instances)
                const physicsShape = new BABYLON.PhysicsShapeMesh(objectMesh, scene);
                // Create a new transform node for the physics body to hold its position
                const physicsTransformNode = new BABYLON.TransformNode(`${objectMesh.name}_physics_${model}`, scene);
                physicsTransformNode.setParent(this.objectContainer);
                // Create individual physics bodies for each instance
                for (let i = 0; i < count; i++) {
                    const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
                    if (x === 0 && y === 0 && z === 0) {
                        continue; // Skip invalid transforms
                    }
                    // Apply the transformation to the transform node
                    const translation = BABYLON.Matrix.Translation(x, y, z);
                    const rotation = BABYLON.Matrix.RotationYawPitchRoll(BABYLON.Tools.ToRadians(rotateY), BABYLON.Tools.ToRadians(rotateX), BABYLON.Tools.ToRadians(rotateZ));
                    const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
                    const transformMatrix = scaling
                        .multiply(rotation)
                        .multiply(translation);
                    physicsTransformNode.setPreTransformMatrix(transformMatrix);
                    // Create a new physics body for this instance
                    const physicsBody = new BABYLON.PhysicsBody(physicsTransformNode, BABYLON.PhysicsMotionType.STATIC, false, scene);
                    physicsBody.shape = physicsShape; // Reuse the same shape for efficiency
                    physicsBody.setMassProperties({ mass: 0 }); // Static body
                    // Store the physics body
                    physicsBodies.push(physicsBody);
                }
            }
            for (const mesh of objectMesh.subMeshes) {
                const materialExtras = mesh.getMaterial()?.metadata?.gltf?.extras;
                if (materialExtras?.frames?.length &&
                    materialExtras?.animationDelay &&
                    !this.animatedMaterialNames.includes(mesh.getMaterial().name)) {
                    const textures = mesh.getMaterial()?.getActiveTextures();
                    textures?.forEach((tex) => scene.removeTexture(tex));
                    const { frames, animationDelay } = materialExtras;
                    let currentFrameIndex = 0;
                    let elapsedMs = 0;
                    const callback = () => {
                        try {
                            elapsedMs += scene.getEngine().getDeltaTime();
                            if (elapsedMs < animationDelay * 2)
                                return;
                            elapsedMs %= animationDelay * 2;
                            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
                            const selectedFrame = frames[currentFrameIndex];
                            swapMaterialTexture(mesh.getMaterial(), selectedFrame, true);
                        }
                        catch (error) {
                            console.error(`[ObjectCache] Failed to swap texture for mesh ${mesh}:`, mesh, error);
                            scene.unregisterBeforeRender(callback);
                        }
                    };
                    scene.registerBeforeRender(callback);
                    this.managerCallbacks.push(callback);
                    this.animatedMaterialNames.push(mesh.getMaterial().name);
                }
            }
        }
        else {
            for (const mesh of meshes) {
                mesh.setParent(this.objectContainer); // put it under an enabled node
                mesh.setEnabled(true);
                mesh.isPickable = false;
                mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
                mesh.alwaysSelectAsActiveMesh = false;
                mesh.thinInstanceRefreshBoundingInfo(true, false, false);
            }
        }
        root.dispose();
        // Store physics bodies for this model in the cache
        dataContainer.physicsBodies =
            physicsBodies.length > 0 ? physicsBodies : null;
        return meshes;
    }
    /**
     * Upload final Babylon-space matrices produced by a Shado world package.
     * Unlike the legacy Transform path, these matrices must not receive any
     * coordinate-system or yaw correction in the client.
     */
    async setPromotedThinInstances(model, source, scene, matrixData) {
        let renderMeshes = this.promotedMeshes.get(model);
        if (!renderMeshes) {
            const dataContainer = await this.getContainer(model, scene, source);
            if (!dataContainer)
                return [];
            const { container, manager, morphTargetManager } = dataContainer;
            const root = getOrCreateAssetContainerRoot(container, scene, `container_${model}`);
            const sourceMeshes = getAssetContainerMeshes(container);
            if (morphTargetManager) {
                renderMeshes = sourceMeshes;
            }
            else {
                const merged = BABYLON.Mesh.MergeMeshes(sourceMeshes, true, true, undefined, false, true);
                if (!merged) {
                    console.warn(`[ObjectCache] No meshes found for promoted model ${model}`);
                    return [];
                }
                merged.skeleton = container.skeletons[0] || null;
                if (manager)
                    merged.bakedVertexAnimationManager = manager;
                renderMeshes = [merged];
            }
            for (const mesh of renderMeshes) {
                mesh.setParent(this.objectContainer);
                mesh.setEnabled(true);
                mesh.isPickable = false;
                mesh.alwaysSelectAsActiveMesh = true;
            }
            this.promotedMeshes.set(model, renderMeshes);
            root.dispose();
        }
        for (const mesh of renderMeshes) {
            mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
            mesh.thinInstanceRefreshBoundingInfo(true, false, false);
        }
        return renderMeshes;
    }
    dispose(model) {
        if (model in this.dataContainers) {
            this.dataContainers[model].then((container) => {
                // Dispose of physics body if it exists
                if (container.physicsBodies) {
                    container.physicsBodies[model]?.forEach?.((p) => p.dispose());
                    container.physicsBodies = [];
                }
                // Dispose of the container
                container.container.dispose();
            });
            // Remove from cache
            delete this.dataContainers[model];
        }
    }
    disposeAll() {
        const scene = BABYLON.EngineStore.LastCreatedScene;
        if (scene) {
            for (const cb of this.managerCallbacks) {
                scene.unregisterBeforeRender(cb);
            }
        }
        for (const meshes of this.promotedMeshes.values()) {
            for (const mesh of meshes) {
                if (!mesh.isDisposed())
                    mesh.dispose();
            }
        }
        Object.keys(this.dataContainers).forEach((model) => this.dispose(model));
        this.managerCallbacks = [];
        this.animatedMaterialNames = [];
        this.promotedMeshes.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0LWNhY2hlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsib2JqZWN0LWNhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUMzQixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFDTCx1QkFBdUIsRUFDdkIsNkJBQTZCLEdBQzlCLE1BQU0sbUJBQW1CLENBQUM7QUFDM0IsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBWWxELE1BQU0sQ0FBQyxPQUFPLE9BQU8sV0FBVztJQUN2QixjQUFjLEdBQTZDLEVBQUUsQ0FBQztJQUM3RCxlQUFlLEdBQTZCLElBQUksQ0FBQztJQUNqRCxxQkFBcUIsR0FBYSxFQUFFLENBQUM7SUFDckMsZ0JBQWdCLEdBQW1CLEVBQUUsQ0FBQztJQUN0QyxjQUFjLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7SUFDekQsWUFBWSxhQUFhLEdBQTZCLElBQUk7UUFDeEQsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsZUFBZSxHQUFHLGFBQWEsQ0FBQztRQUN2QyxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQ2hCLEtBQWEsRUFDYixLQUFnQixFQUNoQixjQUF1QjtRQUV2QixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2hDLElBQUksUUFBUSxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssVUFBVSxDQUFDO1lBQ2pFLElBQUksS0FBOEIsQ0FBQztZQUNuQyxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNuQixJQUFJLENBQUM7b0JBQ0gsS0FBSyxHQUFHLE1BQU0sZUFBZSxDQUFD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QyxjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM5QixDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvZ2FtZS9Nb2RlbC9vYmplY3QtY2FjaGUudHNcbmltcG9ydCB0eXBlICogYXMgQkpTIGZyb20gXCJAYmFieWxvbmpzL2NvcmVcIjtcbmltcG9ydCBCQUJZTE9OIGZyb20gXCJAYmpzXCI7XG5pbXBvcnQgeyBGaWxlU3lzdGVtIH0gZnJvbSBcIkBnYW1lL0ZpbGVTeXN0ZW0vZmlsZXN5c3RlbVwiO1xuaW1wb3J0IHsgVHJhbnNmb3JtIH0gZnJvbSBcIkBnYW1lL1pvbmUvem9uZS10eXBlc1wiO1xuaW1wb3J0IHsgZmV0Y2hTaGFkb0J5dGVzIH0gZnJvbSBcIkBrbmVydm91cy9zaGFkby9wcmVwcm9jZXNzL3J1bnRpbWVcIjtcbmltcG9ydCB7XG4gIGdldEFzc2V0Q29udGFpbmVyTWVzaGVzLFxuICBnZXRPckNyZWF0ZUFzc2V0Q29udGFpbmVyUm9vdCxcbn0gZnJvbSBcIi4vYXNzZXQtY29udGFpbmVyXCI7XG5pbXBvcnQgeyBzd2FwTWF0ZXJpYWxUZXh0dXJlIH0gZnJvbSBcIi4vYmpzLXV0aWxzXCI7XG5cbnR5cGUgTW9kZWxLZXkgPSBzdHJpbmc7XG5cbnR5cGUgQ29udGFpbmVyRGF0YSA9IHtcbiAgY29udGFpbmVyOiBCSlMuQXNzZXRDb250YWluZXI7XG4gIGhhc0FuaW1hdGlvbnM6IGJvb2xlYW47XG4gIGFuaW1hdGlvblJhbmdlczogQkpTLk51bGxhYmxlPEJKUy5BbmltYXRpb25SYW5nZT5bXTtcbiAgcGh5c2ljc0JvZGllczogQkpTLlBoeXNpY3NCb2R5W10gfCBudWxsO1xuICBtYW5hZ2VyOiBCSlMuQmFrZWRWZXJ0ZXhBbmltYXRpb25NYW5hZ2VyIHwgbnVsbDtcbiAgbW9ycGhUYXJnZXRNYW5hZ2VyOiBCSlMuTW9ycGhUYXJnZXRNYW5hZ2VyIHwgdW5kZWZpbmVkO1xufTtcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE9iamVjdENhY2hlIHtcbiAgcHVibGljIGRhdGFDb250YWluZXJzOiBSZWNvcmQ8TW9kZWxLZXksIFByb21pc2U8Q29udGFpbmVyRGF0YT4+ID0ge307XG4gIHByaXZhdGUgb2JqZWN0Q29udGFpbmVyOiBCSlMuVHJhbnNmb3JtTm9kZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGFuaW1hdGVkTWF0ZXJpYWxOYW1lczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSBtYW5hZ2VyQ2FsbGJhY2tzOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuICBwcml2YXRlIHByb21vdGVkTWVzaGVzID0gbmV3IE1hcDxNb2RlbEtleSwgQkpTLk1lc2hbXT4oKTtcbiAgY29uc3RydWN0b3Ioem9uZUNvbnRhaW5lcjogQkpTLlRyYW5zZm9ybU5vZGUgfCBudWxsID0gbnVsbCkge1xuICAgIGlmICh6b25lQ29udGFpbmVyKSB7XG4gICAgICB0aGlzLm9iamVjdENvbnRhaW5lciA9IHpvbmVDb250YWluZXI7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0Q29udGFpbmVyKFxuICAgIG1vZGVsOiBzdHJpbmcsXG4gICAgc2NlbmU6IEJKUy5TY2VuZSxcbiAgICBwcm9tb3RlZFNvdXJjZT86IHN0cmluZyxcbiAgKTogUHJvbWlzZTxDb250YWluZXJEYXRhIHwgbnVsbD4ge1xuICAgIGlmICghdGhpcy5kYXRhQ29udGFpbmVyc1ttb2RlbF0pIHtcbiAgICAgIGxldCBmaWxlTmFtZSA9IHByb21vdGVkU291cmNlID8gXCJmaW5hbC5nbGJcIiA6IGAke21vZGVsfS5iYWJ5bG9uYDtcbiAgICAgIGxldCBieXRlczogQXJyYXlCdWZmZXIgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAocHJvbW90ZWRTb3VyY2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBieXRlcyA9IGF3YWl0IGZldGNoU2hhZG9CeXRlcyhwcm9tb3RlZFNvdXJjZSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIGZpbGVOYW1lID0gYCR7bW9kZWx9LmdsYmA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGJ5dGVzID8/PSBhd2FpdCBGaWxlU3lzdGVtLmdldEZpbGVCeXRlcyhcImVxcmVxdWllbS9vYmplY3RzXCIsIGZpbGVOYW1lKTtcbiAgICAgIGlmICghYnl0ZXMgJiYgcHJvbW90ZWRTb3VyY2UpIHtcbiAgICAgICAgZmlsZU5hbWUgPSBgJHttb2RlbH0uYmFieWxvbmA7XG4gICAgICAgIGJ5dGVzID0gYXdhaXQgRmlsZVN5c3RlbS5nZXRGaWxlQnl0ZXMoXCJlcXJlcXVpZW0vb2JqZWN0c1wiLCBmaWxlTmFtZSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJ5dGVzKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW09iamVjdENhY2hlXSBGYWlsZWQgdG8gbG9hZCBtb2RlbCAke21vZGVsfWApO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGxldCByZXN1bHQ6IEJKUy5Bc3NldENvbnRhaW5lcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGZpbGVOYW1lLmVuZHNXaXRoKFwiLmdsYlwiKVxuICAgICAgICAgID8gYXdhaXQgQkFCWUxPTi5Mb2FkQXNzZXRDb250YWluZXJBc3luYyhcbiAgICAgICAgICAgICAgbmV3IEZpbGUoW2J5dGVzXSwgZmlsZU5hbWUsIHsgdHlwZTogXCJtb2RlbC9nbHRmLWJpbmFyeVwiIH0pLFxuICAgICAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICAgIClcbiAgICAgICAgICA6IGF3YWl0IEJBQllMT04ubG9hZEJhYnlsb25Bc3NldENvbnRhaW5lcihieXRlcywgc2NlbmUsIHtcbiAgICAgICAgICAgICAgbmFtZTogZmlsZU5hbWUsXG4gICAgICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmICghcHJvbW90ZWRTb3VyY2UgfHwgZmlsZU5hbWUuZW5kc1dpdGgoXCIuYmFieWxvblwiKSkgdGhyb3cgZXJyb3I7XG4gICAgICAgIGNvbnN0IGxlZ2FjeUZpbGVOYW1lID0gYCR7bW9kZWx9LmJhYnlsb25gO1xuICAgICAgICBjb25zdCBsZWdhY3lCeXRlcyA9IGF3YWl0IEZpbGVTeXN0ZW0uZ2V0RmlsZUJ5dGVzKFxuICAgICAgICAgIFwiZXFyZXF1aWVtL29iamVjdHNcIixcbiAgICAgICAgICBsZWdhY3lGaWxlTmFtZSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFsZWdhY3lCeXRlcykgdGhyb3cgZXJyb3I7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IEJBQllMT04ubG9hZEJhYnlsb25Bc3NldENvbnRhaW5lcihcbiAgICAgICAgICBsZWdhY3lCeXRlcyxcbiAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICB7IG5hbWU6IGxlZ2FjeUZpbGVOYW1lIH0sXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBtb2RlbCAke21vZGVsfWApO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5hZGRBbGxUb1NjZW5lKCk7XG5cbiAgICAgIGNvbnN0IHJvb3QgPSBnZXRPckNyZWF0ZUFzc2V0Q29udGFpbmVyUm9vdChcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBzY2VuZSxcbiAgICAgICAgYGNvbnRhaW5lcl8ke21vZGVsfWAsXG4gICAgICApO1xuICAgICAgY29uc3QgbW9kZWxNZXNoZXMgPSBnZXRBc3NldENvbnRhaW5lck1lc2hlcyhyZXN1bHQpO1xuICAgICAgaWYgKCFtb2RlbE1lc2hlcy5sZW5ndGgpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBbT2JqZWN0Q2FjaGVdIE1vZGVsICR7bW9kZWx9IGNvbnRhaW5zIG5vIHJlbmRlcmFibGUgbWVzaGVzYCk7XG4gICAgICAgIHJlc3VsdC5kaXNwb3NlKCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgY29uc3QgeyBhbmltYXRpb25Hcm91cHMsIHNrZWxldG9ucyB9ID0gcmVzdWx0O1xuICAgICAgY29uc3QgaGFzQW5pbWF0aW9ucyA9IGFuaW1hdGlvbkdyb3Vwcy5sZW5ndGggPiAwO1xuXG4gICAgICBjb25zdCBhbmltYXRpb25SYW5nZXM6IEJKUy5BbmltYXRpb25SYW5nZVtdID0gW107XG4gICAgICByb290LnNldEVuYWJsZWQoZmFsc2UpO1xuXG4gICAgICBsZXQgbWFuYWdlcjogQkpTLkJha2VkVmVydGV4QW5pbWF0aW9uTWFuYWdlciB8IG51bGwgPSBudWxsO1xuICAgICAgbGV0IG1vcnBoVGFyZ2V0TWFuYWdlcjogQkpTLk1vcnBoVGFyZ2V0TWFuYWdlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgaGFzTW9ycGhUYXJnZXRzID0gbW9kZWxNZXNoZXMuc29tZSgobSkgPT4gbS5tb3JwaFRhcmdldE1hbmFnZXIpO1xuICAgICAgaWYgKGhhc01vcnBoVGFyZ2V0cykge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBcIltPYmplY3RDYWNoZV0gTW9kZWwgaGFzIG1vcnBoIHRhcmdldHM6XCIsXG4gICAgICAgICAgYW5pbWF0aW9uR3JvdXBzLFxuICAgICAgICAgIG1vZGVsLFxuICAgICAgICApO1xuICAgICAgICBhbmltYXRpb25Hcm91cHNbMF0/LnBsYXk/Lih0cnVlKTtcbiAgICAgICAgbW9ycGhUYXJnZXRNYW5hZ2VyID0gbW9kZWxNZXNoZXMuZmluZChcbiAgICAgICAgICAobSkgPT4gbS5tb3JwaFRhcmdldE1hbmFnZXIsXG4gICAgICAgICk/Lm1vcnBoVGFyZ2V0TWFuYWdlciA/PyB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU2V0dGluZyBtb3JwaCB0YXJnZXQgbWFuYWdlclwiLCBtb3JwaFRhcmdldE1hbmFnZXIpO1xuICAgICAgfVxuXG4gICAgICBpZiAoaGFzQW5pbWF0aW9ucyAmJiAhaGFzTW9ycGhUYXJnZXRzICYmIHNrZWxldG9ucy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCBhZyBvZiBhbmltYXRpb25Hcm91cHMpIHtcbiAgICAgICAgICBjb25zdCBhbmltYXRpb25SYW5nZSA9IG5ldyBCQUJZTE9OLkFuaW1hdGlvblJhbmdlKFxuICAgICAgICAgICAgYWcubmFtZSxcbiAgICAgICAgICAgIGFnLmZyb20sXG4gICAgICAgICAgICBhZy50byxcbiAgICAgICAgICApO1xuICAgICAgICAgIGFuaW1hdGlvblJhbmdlcy5wdXNoKGFuaW1hdGlvblJhbmdlKTtcbiAgICAgICAgICBhZy5zdG9wKCk7XG4gICAgICAgICAgYWcuZGlzcG9zZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5hbmltYXRpb25Hcm91cHMgPSBbXTtcbiAgICAgICAgY29uc3QgY2FuVXNlRmxvYXQxNiA9IHNjZW5lLmdldEVuZ2luZSgpLmdldENhcHMoKS50ZXh0dXJlSGFsZkZsb2F0O1xuICAgICAgICBjb25zdCB2YXQxNiA9IGAke21vZGVsfS5iaW4uZ3pgO1xuICAgICAgICBjb25zdCB2YXQzMiA9IGAke21vZGVsfV8zMi5iaW4uZ3pgO1xuICAgICAgICBjb25zdCB2YXRCeXRlcyA9IGF3YWl0IEZpbGVTeXN0ZW0uZ2V0RmlsZUJ5dGVzKFxuICAgICAgICAgIFwiZXFyZXF1aWVtL3ZhdFwiLFxuICAgICAgICAgIGNhblVzZUZsb2F0MTYgPyB2YXQxNiA6IHZhdDMyLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXZhdEJ5dGVzKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBbRW50aXR5Q2FjaGVdIFZBVCBkYXRhIG1pc3NpbmcgZm9yICR7bW9kZWx9YCk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmF0RGF0YSA9IChcbiAgICAgICAgICBjYW5Vc2VGbG9hdDE2ID8gbmV3IFVpbnQxNkFycmF5KHZhdEJ5dGVzKSA6IG5ldyBGbG9hdDMyQXJyYXkodmF0Qnl0ZXMpXG4gICAgICAgICkgYXMgVWludDE2QXJyYXkgfCBGbG9hdDMyQXJyYXk7XG5cbiAgICAgICAgaWYgKHZhdERhdGEpIHtcbiAgICAgICAgICBjb25zdCBiYWtlciA9IG5ldyBCQUJZTE9OLlZlcnRleEFuaW1hdGlvbkJha2VyKFxuICAgICAgICAgICAgc2NlbmUsXG4gICAgICAgICAgICByZXN1bHQuc2tlbGV0b25zWzBdLFxuICAgICAgICAgICk7XG4gICAgICAgICAgbWFuYWdlciA9IG5ldyBCQUJZTE9OLkJha2VkVmVydGV4QW5pbWF0aW9uTWFuYWdlcihzY2VuZSk7XG4gICAgICAgICAgLy8gcmVzdWx0LnNrZWxldG9uc1swXS5kaXNwb3NlKCk7XG4gICAgICAgICAgLy8gc2NlbmUucmVtb3ZlU2tlbGV0b24ocmVzdWx0LnNrZWxldG9uc1swXSk7XG4gICAgICAgICAgbWFuYWdlci50ZXh0dXJlID0gYmFrZXIudGV4dHVyZUZyb21CYWtlZFZlcnRleERhdGEodmF0RGF0YSk7XG4gICAgICAgICAgY29uc3QgY2IgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIW1hbmFnZXIgfHwgIW1hbmFnZXIudGV4dHVyZSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYW5hZ2VyLnRpbWUgKz0gc2NlbmUuZ2V0RW5naW5lKCkuZ2V0RGVsdGFUaW1lKCkgLyAxMDAwLjA7XG4gICAgICAgICAgfTtcbiAgICAgICAgICB0aGlzLm1hbmFnZXJDYWxsYmFja3MucHVzaChjYik7XG4gICAgICAgICAgc2NlbmUucmVnaXN0ZXJCZWZvcmVSZW5kZXIoY2IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyByZXN1bHQucm9vdE5vZGVzWzBdLmRpc3Bvc2UoKTtcblxuICAgICAgdGhpcy5kYXRhQ29udGFpbmVyc1ttb2RlbF0gPSBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb250YWluZXI6IHJlc3VsdCxcbiAgICAgICAgbW9ycGhUYXJnZXRNYW5hZ2VyLFxuICAgICAgICBoYXNBbmltYXRpb25zLFxuICAgICAgICBhbmltYXRpb25SYW5nZXMsXG4gICAgICAgIG1hbmFnZXIsXG4gICAgICAgIHBoeXNpY3NCb2RpZXM6IFtdLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmRhdGFDb250YWluZXJzW21vZGVsXSE7XG4gIH1cblxuICBhc3luYyBhZGRUaGluSW5zdGFuY2VzKFxuICAgIG1vZGVsOiBzdHJpbmcsXG4gICAgc2NlbmU6IEJKUy5TY2VuZSxcbiAgICBpbnN0YW5jZVRyYW5zbGF0aW9uczogVHJhbnNmb3JtW10sXG4gICk6IFByb21pc2U8QkpTLkFic3RyYWN0TWVzaFtdPiB7XG4gICAgY29uc3QgZGF0YUNvbnRhaW5lciA9IGF3YWl0IHRoaXMuZ2V0Q29udGFpbmVyKG1vZGVsLCBzY2VuZSk7XG4gICAgaWYgKCFkYXRhQ29udGFpbmVyKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGNvbnN0IHtcbiAgICAgIGNvbnRhaW5lcixcbiAgICAgIGhhc0FuaW1hdGlvbnMsXG4gICAgICBhbmltYXRpb25SYW5nZXMsXG4gICAgICBtYW5hZ2VyLFxuICAgICAgbW9ycGhUYXJnZXRNYW5hZ2VyLFxuICAgIH0gPSBkYXRhQ29udGFpbmVyO1xuXG4gICAgY29uc3Qgcm9vdCA9IGdldE9yQ3JlYXRlQXNzZXRDb250YWluZXJSb290KFxuICAgICAgY29udGFpbmVyLFxuICAgICAgc2NlbmUsXG4gICAgICBgY29udGFpbmVyXyR7bW9kZWx9YCxcbiAgICApO1xuICAgIGNvbnN0IHRyYW5zZm9ybXMgPSBpbnN0YW5jZVRyYW5zbGF0aW9ucztcbiAgICBjb25zdCBjb3VudCA9IHRyYW5zZm9ybXMubGVuZ3RoO1xuICAgIGNvbnN0IG1hdHJpeERhdGEgPSBuZXcgRmxvYXQzMkFycmF5KDE2ICogY291bnQpO1xuICAgIGNvbnN0IGFuaW1QYXJhbWV0ZXJzID0gaGFzQW5pbWF0aW9ucyA/IG5ldyBGbG9hdDMyQXJyYXkoY291bnQgKiA0KSA6IG51bGw7XG5cbiAgICAvLyBTdG9yZSBwaHlzaWNzIGJvZGllcyBmb3IgdGhpcyBtb2RlbFxuICAgIGNvbnN0IHBoeXNpY3NCb2RpZXM6IEJKUy5QaHlzaWNzQm9keVtdID0gW107XG5cbiAgICBjb25zdCBtZXNoZXMgPSBnZXRBc3NldENvbnRhaW5lck1lc2hlcyhjb250YWluZXIpO1xuXG4gICAgY29uc3QgcGFyYW1zID0gbmV3IEJBQllMT04uVmVjdG9yNCgpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICB0cmFuc2Zvcm1zW2ldLnJvdGF0ZVkgKj0gLTE7IC8vIEludmVydCBZIHJvdGF0aW9uIGZvciBjb3JyZWN0IG9yaWVudGF0aW9uXG5cbiAgICAgIGNvbnN0IHsgeCwgeSwgeiwgcm90YXRlWCwgcm90YXRlWSwgcm90YXRlWiwgc2NhbGUgfSA9IHRyYW5zZm9ybXNbaV07XG4gICAgICBpZiAoeCA9PT0gMCAmJiB5ID09PSAwICYmIHogPT09IDApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gQkFCWUxPTi5NYXRyaXguVHJhbnNsYXRpb24oeCwgeSwgeik7XG4gICAgICBjb25zdCByb3RhdGlvbiA9IEJBQllMT04uTWF0cml4LlJvdGF0aW9uWWF3UGl0Y2hSb2xsKFxuICAgICAgICBCQUJZTE9OLlRvb2xzLlRvUmFkaWFucyhyb3RhdGVZKSxcbiAgICAgICAgQkFCWUxPTi5Ub29scy5Ub1JhZGlhbnMocm90YXRlWCksXG4gICAgICAgIEJBQllMT04uVG9vbHMuVG9SYWRpYW5zKHJvdGF0ZVopLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHNjYWxpbmcgPSBCQUJZTE9OLk1hdHJpeC5TY2FsaW5nKHNjYWxlLCBzY2FsZSwgc2NhbGUpO1xuICAgICAgY29uc3QgdHJhbnNmb3JtID0gc2NhbGluZy5tdWx0aXBseShyb3RhdGlvbikubXVsdGlwbHkodHJhbnNsYXRpb24pO1xuICAgICAgdHJhbnNmb3JtLmNvcHlUb0FycmF5KG1hdHJpeERhdGEsIGkgKiAxNik7XG5cbiAgICAgIGlmIChhbmltUGFyYW1ldGVycyAmJiBhbmltYXRpb25SYW5nZXMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IFtmaXJzdEFuaW1hdGlvblJhbmdlXSA9IGFuaW1hdGlvblJhbmdlcztcbiAgICAgICAgcGFyYW1zLnNldChcbiAgICAgICAgICBmaXJzdEFuaW1hdGlvblJhbmdlPy5mcm9tID8/IDAsXG4gICAgICAgICAgZmlyc3RBbmltYXRpb25SYW5nZT8udG8gPz8gMCxcbiAgICAgICAgICAwLFxuICAgICAgICAgIDYwLFxuICAgICAgICApO1xuICAgICAgICBhbmltUGFyYW1ldGVycy5zZXQocGFyYW1zLmFzQXJyYXkoKSwgaSAqIDQpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIW1vcnBoVGFyZ2V0TWFuYWdlcikge1xuICAgICAgY29uc3Qgb2JqZWN0TWVzaCA9IEJBQllMT04uTWVzaC5NZXJnZU1lc2hlcyhcbiAgICAgICAgbWVzaGVzLFxuICAgICAgICB0cnVlLFxuICAgICAgICB0cnVlLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB0cnVlLFxuICAgICAgKSBhcyBCSlMuTWVzaDtcbiAgICAgIGlmICghb2JqZWN0TWVzaCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYFtPYmplY3RDYWNoZV0gTm8gbWVzaGVzIGZvdW5kIGZvciBtb2RlbCAke21vZGVsfWApO1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBpZiAobW9ycGhUYXJnZXRNYW5hZ2VyKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIFwiU2V0dGluZyBtb3JwaCB0YXJnZXQgbWFuYWdlclwiLFxuICAgICAgICAgIG1vcnBoVGFyZ2V0TWFuYWdlcixcbiAgICAgICAgICBcIk1FU0hcIixcbiAgICAgICAgICBvYmplY3RNZXNoLFxuICAgICAgICApO1xuICAgICAgICBvYmplY3RNZXNoLm1vcnBoVGFyZ2V0TWFuYWdlciA9IG1vcnBoVGFyZ2V0TWFuYWdlcjtcbiAgICAgIH1cbiAgICAgIG9iamVjdE1lc2guc2tlbGV0b24gPSBjb250YWluZXIuc2tlbGV0b25zWzBdIHx8IG51bGw7XG4gICAgICBvYmplY3RNZXNoLnNldFBhcmVudCh0aGlzLm9iamVjdENvbnRhaW5lcik7XG4gICAgICBvYmplY3RNZXNoLmlzUGlja2FibGUgPSBmYWxzZTtcbiAgICAgIG9iamVjdE1lc2gudGhpbkluc3RhbmNlU2V0QnVmZmVyKFwibWF0cml4XCIsIG1hdHJpeERhdGEsIDE2LCBmYWxzZSk7XG4gICAgICBvYmplY3RNZXNoLmFsd2F5c1NlbGVjdEFzQWN0aXZlTWVzaCA9IHRydWU7XG4gICAgICBvYmplY3RNZXNoLnRoaW5JbnN0YW5jZVJlZnJlc2hCb3VuZGluZ0luZm8odHJ1ZSwgZmFsc2UsIGZhbHNlKTtcbiAgICAgIGlmIChtYW5hZ2VyKSB7XG4gICAgICAgIG9iamVjdE1lc2guYmFrZWRWZXJ0ZXhBbmltYXRpb25NYW5hZ2VyID0gbWFuYWdlcjtcbiAgICAgICAgb2JqZWN0TWVzaC50aGluSW5zdGFuY2VTZXRCdWZmZXIoXG4gICAgICAgICAgXCJiYWtlZFZlcnRleEFuaW1hdGlvblNldHRpbmdzSW5zdGFuY2VkXCIsXG4gICAgICAgICAgYW5pbVBhcmFtZXRlcnMsXG4gICAgICAgICAgNCxcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFvYmplY3RNZXNoLm5hbWU/LmVuZHNXaXRoKFwiLXBhc3N0aHJvdWdoXCIpKSB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHBoeXNpY3Mgc2hhcGUgZm9yIHRoZSBtZXNoIChzaGFyZWQgYWNyb3NzIGluc3RhbmNlcylcbiAgICAgICAgY29uc3QgcGh5c2ljc1NoYXBlID0gbmV3IEJBQllMT04uUGh5c2ljc1NoYXBlTWVzaChcbiAgICAgICAgICBvYmplY3RNZXNoIGFzIEJKUy5NZXNoLFxuICAgICAgICAgIHNjZW5lISxcbiAgICAgICAgKTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IHRyYW5zZm9ybSBub2RlIGZvciB0aGUgcGh5c2ljcyBib2R5IHRvIGhvbGQgaXRzIHBvc2l0aW9uXG4gICAgICAgIGNvbnN0IHBoeXNpY3NUcmFuc2Zvcm1Ob2RlID0gbmV3IEJBQllMT04uVHJhbnNmb3JtTm9kZShcbiAgICAgICAgICBgJHtvYmplY3RNZXNoLm5hbWV9X3BoeXNpY3NfJHttb2RlbH1gLFxuICAgICAgICAgIHNjZW5lISxcbiAgICAgICAgKTtcbiAgICAgICAgcGh5c2ljc1RyYW5zZm9ybU5vZGUuc2V0UGFyZW50KHRoaXMub2JqZWN0Q29udGFpbmVyKTtcbiAgICAgICAgLy8gQ3JlYXRlIGluZGl2aWR1YWwgcGh5c2ljcyBib2RpZXMgZm9yIGVhY2ggaW5zdGFuY2VcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgeyB4LCB5LCB6LCByb3RhdGVYLCByb3RhdGVZLCByb3RhdGVaLCBzY2FsZSB9ID0gdHJhbnNmb3Jtc1tpXTtcbiAgICAgICAgICBpZiAoeCA9PT0gMCAmJiB5ID09PSAwICYmIHogPT09IDApIHtcbiAgICAgICAgICAgIGNvbnRpbnVlOyAvLyBTa2lwIGludmFsaWQgdHJhbnNmb3Jtc1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEFwcGx5IHRoZSB0cmFuc2Zvcm1hdGlvbiB0byB0aGUgdHJhbnNmb3JtIG5vZGVcbiAgICAgICAgICBjb25zdCB0cmFuc2xhdGlvbiA9IEJBQllMT04uTWF0cml4LlRyYW5zbGF0aW9uKHgsIHksIHopO1xuICAgICAgICAgIGNvbnN0IHJvdGF0aW9uID0gQkFCWUxPTi5NYXRyaXguUm90YXRpb25ZYXdQaXRjaFJvbGwoXG4gICAgICAgICAgICBCQUJZTE9OLlRvb2xzLlRvUmFkaWFucyhyb3RhdGVZKSxcbiAgICAgICAgICAgIEJBQllMT04uVG9vbHMuVG9SYWRpYW5zKHJvdGF0ZVgpLFxuICAgICAgICAgICAgQkFCWUxPTi5Ub29scy5Ub1JhZGlhbnMocm90YXRlWiksXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzY2FsaW5nID0gQkFCWUxPTi5NYXRyaXguU2NhbGluZyhzY2FsZSwgc2NhbGUsIHNjYWxlKTtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1NYXRyaXggPSBzY2FsaW5nXG4gICAgICAgICAgICAubXVsdGlwbHkocm90YXRpb24pXG4gICAgICAgICAgICAubXVsdGlwbHkodHJhbnNsYXRpb24pO1xuICAgICAgICAgIHBoeXNpY3NUcmFuc2Zvcm1Ob2RlLnNldFByZVRyYW5zZm9ybU1hdHJpeCh0cmFuc2Zvcm1NYXRyaXgpO1xuXG4gICAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IHBoeXNpY3MgYm9keSBmb3IgdGhpcyBpbnN0YW5jZVxuICAgICAgICAgIGNvbnN0IHBoeXNpY3NCb2R5ID0gbmV3IEJBQllMT04uUGh5c2ljc0JvZHkoXG4gICAgICAgICAgICBwaHlzaWNzVHJhbnNmb3JtTm9kZSxcbiAgICAgICAgICAgIEJBQllMT04uUGh5c2ljc01vdGlvblR5cGUuU1RBVElDLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICBzY2VuZSEsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBwaHlzaWNzQm9keS5zaGFwZSA9IHBoeXNpY3NTaGFwZTsgLy8gUmV1c2UgdGhlIHNhbWUgc2hhcGUgZm9yIGVmZmljaWVuY3lcbiAgICAgICAgICBwaHlzaWNzQm9keS5zZXRNYXNzUHJvcGVydGllcyh7IG1hc3M6IDAgfSk7IC8vIFN0YXRpYyBib2R5XG5cbiAgICAgICAgICAvLyBTdG9yZSB0aGUgcGh5c2ljcyBib2R5XG4gICAgICAgICAgcGh5c2ljc0JvZGllcy5wdXNoKHBoeXNpY3NCb2R5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBtZXNoIG9mIG9iamVjdE1lc2guc3ViTWVzaGVzKSB7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFsRXh0cmFzID0gbWVzaC5nZXRNYXRlcmlhbCgpPy5tZXRhZGF0YT8uZ2x0Zj8uZXh0cmFzO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgbWF0ZXJpYWxFeHRyYXM/LmZyYW1lcz8ubGVuZ3RoICYmXG4gICAgICAgICAgbWF0ZXJpYWxFeHRyYXM/LmFuaW1hdGlvbkRlbGF5ICYmXG4gICAgICAgICAgIXRoaXMuYW5pbWF0ZWRNYXRlcmlhbE5hbWVzLmluY2x1ZGVzKG1lc2guZ2V0TWF0ZXJpYWwoKSEubmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgY29uc3QgdGV4dHVyZXMgPSBtZXNoLmdldE1hdGVyaWFsKCk/LmdldEFjdGl2ZVRleHR1cmVzKCk7XG4gICAgICAgICAgdGV4dHVyZXM/LmZvckVhY2goKHRleCkgPT4gc2NlbmUucmVtb3ZlVGV4dHVyZSh0ZXgpKTtcbiAgICAgICAgICBjb25zdCB7IGZyYW1lcywgYW5pbWF0aW9uRGVsYXkgfSA9IG1hdGVyaWFsRXh0cmFzO1xuICAgICAgICAgIGxldCBjdXJyZW50RnJhbWVJbmRleCA9IDA7XG4gICAgICAgICAgbGV0IGVsYXBzZWRNcyA9IDA7XG4gICAgICAgICAgY29uc3QgY2FsbGJhY2sgPSAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBlbGFwc2VkTXMgKz0gc2NlbmUuZ2V0RW5naW5lKCkuZ2V0RGVsdGFUaW1lKCk7XG4gICAgICAgICAgICAgIGlmIChlbGFwc2VkTXMgPCBhbmltYXRpb25EZWxheSAqIDIpIHJldHVybjtcbiAgICAgICAgICAgICAgZWxhcHNlZE1zICU9IGFuaW1hdGlvbkRlbGF5ICogMjtcbiAgICAgICAgICAgICAgY3VycmVudEZyYW1lSW5kZXggPSAoY3VycmVudEZyYW1lSW5kZXggKyAxKSAlIGZyYW1lcy5sZW5ndGg7XG4gICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRnJhbWUgPSBmcmFtZXNbY3VycmVudEZyYW1lSW5kZXhdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgc3dhcE1hdGVyaWFsVGV4dHVyZShtZXNoLmdldE1hdGVyaWFsKCkhLCBzZWxlY3RlZEZyYW1lLCB0cnVlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgICAgYFtPYmplY3RDYWNoZV0gRmFpbGVkIHRvIHN3YXAgdGV4dHVyZSBmb3IgbWVzaCAke21lc2h9OmAsXG4gICAgICAgICAgICAgICAgbWVzaCxcbiAgICAgICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgc2NlbmUudW5yZWdpc3RlckJlZm9yZVJlbmRlcihjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHNjZW5lLnJlZ2lzdGVyQmVmb3JlUmVuZGVyKGNhbGxiYWNrKTtcbiAgICAgICAgICB0aGlzLm1hbmFnZXJDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG4gICAgICAgICAgdGhpcy5hbmltYXRlZE1hdGVyaWFsTmFtZXMucHVzaChtZXNoLmdldE1hdGVyaWFsKCkhLm5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAoY29uc3QgbWVzaCBvZiBtZXNoZXMpIHtcbiAgICAgICAgbWVzaC5zZXRQYXJlbnQodGhpcy5vYmplY3RDb250YWluZXIpOyAvLyBwdXQgaXQgdW5kZXIgYW4gZW5hYmxlZCBub2RlXG4gICAgICAgIG1lc2guc2V0RW5hYmxlZCh0cnVlKTtcbiAgICAgICAgbWVzaC5pc1BpY2thYmxlID0gZmFsc2U7XG4gICAgICAgIG1lc2gudGhpbkluc3RhbmNlU2V0QnVmZmVyKFwibWF0cml4XCIsIG1hdHJpeERhdGEsIDE2LCBmYWxzZSk7XG4gICAgICAgIG1lc2guYWx3YXlzU2VsZWN0QXNBY3RpdmVNZXNoID0gZmFsc2U7XG4gICAgICAgIG1lc2gudGhpbkluc3RhbmNlUmVmcmVzaEJvdW5kaW5nSW5mbyh0cnVlLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJvb3QuZGlzcG9zZSgpO1xuICAgIC8vIFN0b3JlIHBoeXNpY3MgYm9kaWVzIGZvciB0aGlzIG1vZGVsIGluIHRoZSBjYWNoZVxuICAgIGRhdGFDb250YWluZXIucGh5c2ljc0JvZGllcyA9XG4gICAgICBwaHlzaWNzQm9kaWVzLmxlbmd0aCA+IDAgPyBwaHlzaWNzQm9kaWVzIDogbnVsbDtcblxuICAgIHJldHVybiBtZXNoZXM7XG4gIH1cblxuICAvKipcbiAgICogVXBsb2FkIGZpbmFsIEJhYnlsb24tc3BhY2UgbWF0cmljZXMgcHJvZHVjZWQgYnkgYSBTaGFkbyB3b3JsZCBwYWNrYWdlLlxuICAgKiBVbmxpa2UgdGhlIGxlZ2FjeSBUcmFuc2Zvcm0gcGF0aCwgdGhlc2UgbWF0cmljZXMgbXVzdCBub3QgcmVjZWl2ZSBhbnlcbiAgICogY29vcmRpbmF0ZS1zeXN0ZW0gb3IgeWF3IGNvcnJlY3Rpb24gaW4gdGhlIGNsaWVudC5cbiAgICovXG4gIGFzeW5jIHNldFByb21vdGVkVGhpbkluc3RhbmNlcyhcbiAgICBtb2RlbDogc3RyaW5nLFxuICAgIHNvdXJjZTogc3RyaW5nLFxuICAgIHNjZW5lOiBCSlMuU2NlbmUsXG4gICAgbWF0cml4RGF0YTogRmxvYXQzMkFycmF5LFxuICApOiBQcm9taXNlPEJKUy5NZXNoW10+IHtcbiAgICBsZXQgcmVuZGVyTWVzaGVzID0gdGhpcy5wcm9tb3RlZE1lc2hlcy5nZXQobW9kZWwpO1xuICAgIGlmICghcmVuZGVyTWVzaGVzKSB7XG4gICAgICBjb25zdCBkYXRhQ29udGFpbmVyID0gYXdhaXQgdGhpcy5nZXRDb250YWluZXIobW9kZWwsIHNjZW5lLCBzb3VyY2UpO1xuICAgICAgaWYgKCFkYXRhQ29udGFpbmVyKSByZXR1cm4gW107XG5cbiAgICAgIGNvbnN0IHsgY29udGFpbmVyLCBtYW5hZ2VyLCBtb3JwaFRhcmdldE1hbmFnZXIgfSA9IGRhdGFDb250YWluZXI7XG4gICAgICBjb25zdCByb290ID0gZ2V0T3JDcmVhdGVBc3NldENvbnRhaW5lclJvb3QoXG4gICAgICAgIGNvbnRhaW5lcixcbiAgICAgICAgc2NlbmUsXG4gICAgICAgIGBjb250YWluZXJfJHttb2RlbH1gLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHNvdXJjZU1lc2hlcyA9IGdldEFzc2V0Q29udGFpbmVyTWVzaGVzKGNvbnRhaW5lcik7XG5cbiAgICAgIGlmIChtb3JwaFRhcmdldE1hbmFnZXIpIHtcbiAgICAgICAgcmVuZGVyTWVzaGVzID0gc291cmNlTWVzaGVzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbWVyZ2VkID0gQkFCWUxPTi5NZXNoLk1lcmdlTWVzaGVzKFxuICAgICAgICAgIHNvdXJjZU1lc2hlcyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICkgYXMgQkpTLk1lc2ggfCBudWxsO1xuICAgICAgICBpZiAoIW1lcmdlZCkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgW09iamVjdENhY2hlXSBObyBtZXNoZXMgZm91bmQgZm9yIHByb21vdGVkIG1vZGVsICR7bW9kZWx9YCk7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIG1lcmdlZC5za2VsZXRvbiA9IGNvbnRhaW5lci5za2VsZXRvbnNbMF0gfHwgbnVsbDtcbiAgICAgICAgaWYgKG1hbmFnZXIpIG1lcmdlZC5iYWtlZFZlcnRleEFuaW1hdGlvbk1hbmFnZXIgPSBtYW5hZ2VyO1xuICAgICAgICByZW5kZXJNZXNoZXMgPSBbbWVyZ2VkXTtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBtZXNoIG9mIHJlbmRlck1lc2hlcykge1xuICAgICAgICBtZXNoLnNldFBhcmVudCh0aGlzLm9iamVjdENvbnRhaW5lcik7XG4gICAgICAgIG1lc2guc2V0RW5hYmxlZCh0cnVlKTtcbiAgICAgICAgbWVzaC5pc1BpY2thYmxlID0gZmFsc2U7XG4gICAgICAgIG1lc2guYWx3YXlzU2VsZWN0QXNBY3RpdmVNZXNoID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHRoaXMucHJvbW90ZWRNZXNoZXMuc2V0KG1vZGVsLCByZW5kZXJNZXNoZXMpO1xuICAgICAgcm9vdC5kaXNwb3NlKCk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtZXNoIG9mIHJlbmRlck1lc2hlcykge1xuICAgICAgbWVzaC50aGluSW5zdGFuY2VTZXRCdWZmZXIoXCJtYXRyaXhcIiwgbWF0cml4RGF0YSwgMTYsIGZhbHNlKTtcbiAgICAgIG1lc2gudGhpbkluc3RhbmNlUmVmcmVzaEJvdW5kaW5nSW5mbyh0cnVlLCBmYWxzZSwgZmFsc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcmVuZGVyTWVzaGVzO1xuICB9XG4gIGRpc3Bvc2UobW9kZWw6IE1vZGVsS2V5KTogdm9pZCB7XG4gICAgaWYgKG1vZGVsIGluIHRoaXMuZGF0YUNvbnRhaW5lcnMpIHtcbiAgICAgIHRoaXMuZGF0YUNvbnRhaW5lcnNbbW9kZWxdLnRoZW4oKGNvbnRhaW5lcikgPT4ge1xuICAgICAgICAvLyBEaXNwb3NlIG9mIHBoeXNpY3MgYm9keSBpZiBpdCBleGlzdHNcbiAgICAgICAgaWYgKGNvbnRhaW5lci5waHlzaWNzQm9kaWVzKSB7XG4gICAgICAgICAgY29udGFpbmVyLnBoeXNpY3NCb2RpZXNbbW9kZWxdPy5mb3JFYWNoPy4oKHApID0+IHAuZGlzcG9zZSgpKTtcbiAgICAgICAgICBjb250YWluZXIucGh5c2ljc0JvZGllcyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIC8vIERpc3Bvc2Ugb2YgdGhlIGNvbnRhaW5lclxuICAgICAgICBjb250YWluZXIuY29udGFpbmVyLmRpc3Bvc2UoKTtcbiAgICAgIH0pO1xuICAgICAgLy8gUmVtb3ZlIGZyb20gY2FjaGVcbiAgICAgIGRlbGV0ZSB0aGlzLmRhdGFDb250YWluZXJzW21vZGVsXTtcbiAgICB9XG4gIH1cblxuICBkaXNwb3NlQWxsKCk6IHZvaWQge1xuICAgIGNvbnN0IHNjZW5lID0gQkFCWUxPTi5FbmdpbmVTdG9yZS5MYXN0Q3JlYXRlZFNjZW5lO1xuICAgIGlmIChzY2VuZSkge1xuICAgICAgZm9yIChjb25zdCBjYiBvZiB0aGlzLm1hbmFnZXJDYWxsYmFja3MpIHtcbiAgICAgICAgc2NlbmUudW5yZWdpc3RlckJlZm9yZVJlbmRlcihjYik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtZXNoZXMgb2YgdGhpcy5wcm9tb3RlZE1lc2hlcy52YWx1ZXMoKSkge1xuICAgICAgZm9yIChjb25zdCBtZXNoIG9mIG1lc2hlcykge1xuICAgICAgICBpZiAoIW1lc2guaXNEaXNwb3NlZCgpKSBtZXNoLmRpc3Bvc2UoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgT2JqZWN0LmtleXModGhpcy5kYXRhQ29udGFpbmVycykuZm9yRWFjaCgobW9kZWwpID0+IHRoaXMuZGlzcG9zZShtb2RlbCkpO1xuICAgIHRoaXMubWFuYWdlckNhbGxiYWNrcyA9IFtdO1xuICAgIHRoaXMuYW5pbWF0ZWRNYXRlcmlhbE5hbWVzID0gW107XG4gICAgdGhpcy5wcm9tb3RlZE1lc2hlcy5jbGVhcigpO1xuICB9XG59XG4iXX0=