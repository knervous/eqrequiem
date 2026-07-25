import BABYLON from "@bjs";
import { supportedZones } from "@game/Constants/supportedZones";
import emitter from "@game/Events/events";
import { FileSystem } from "@game/FileSystem/filesystem";
import { LightManager } from "@game/Lights/light-manager";
import { swapMaterialTexture } from "@game/Model/bjs-utils";
import EntityCache from "@game/Model/entity-cache";
import { RegionManager } from "@game/Regions/region-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import EntityPool from "./entity-pool";
import { ShadoWorldObjectLayer } from "./shado-world-object-layer";
import { Grid } from "./zone-grid";
import ObjectCache from "@/Game/Model/object-cache";
export class ZoneManager {
    get RegionManager() {
        return this.regionManager;
    }
    get LightManager() {
        return this.lightManager;
    }
    lightManager;
    get SkyManager() {
        return this.skyManager;
    }
    skyManager;
    regionManager;
    get ZoneContainer() {
        return this.zoneContainer;
    }
    zoneContainer = null;
    objectContainer = null;
    lightContainer = null;
    entityContainerNode = null;
    grid = null;
    tickObservable = null;
    get EntityPool() {
        return this.entityPool;
    }
    entityPool = null;
    zoneObjects = null;
    shadoWorldObjects = null;
    disableWorldEnv = false;
    zoneName = "";
    get CurrentZone() {
        return this.parent.CurrentZone;
    }
    get GameManager() {
        return this.parent;
    }
    parent;
    animatedTextures = [];
    worldTickElapsedMs = 0;
    loadGeneration = 0;
    constructor(parent) {
        this.parent = parent;
        this.zoneContainer = null;
        this.regionManager = new RegionManager(this.GameManager);
        this.lightManager = new LightManager();
        this.skyManager = new DayNightSkyManager(this);
        this.zoneContainer =
            this.parent.scene?.getTransformNodeByName("ZoneContainer") ??
                new BABYLON.TransformNode("ZoneContainer", this.parent.scene);
        this.objectContainer =
            this.parent.scene?.getTransformNodeByName("ZoneObjectContainer") ??
                new BABYLON.TransformNode("ZoneObjectContainer", this.parent.scene);
        this.lightContainer =
            this.parent.scene?.getTransformNodeByName("LightContainer") ??
                new BABYLON.TransformNode("LightContainer", this.parent.scene);
        this.entityContainerNode =
            this.parent.scene?.getTransformNodeByName("EntityContainer") ??
                new BABYLON.TransformNode("EntityContainer", this.parent.scene);
        this.entityPool = new EntityPool(this.GameManager, this.entityContainerNode, this.parent.scene);
    }
    dispose(destroy = false) {
        this.loadGeneration++;
        // Clean up resources if needed.
        if (this.zoneContainer) {
            this.zoneContainer.getChildren().forEach((child) => {
                if (child instanceof BABYLON.AbstractMesh) {
                    child.dispose();
                }
                else if (child instanceof BABYLON.TransformNode) {
                    child.getChildren().forEach((grandChild) => {
                        if (grandChild instanceof BABYLON.AbstractMesh) {
                            grandChild.dispose();
                        }
                    });
                }
            });
        }
        if (this.entityPool) {
            this.entityPool.dispose();
        }
        if (this.grid) {
            this.grid.dispose();
            this.grid = null;
        }
        this.animatedTextures = [];
        this.worldTickElapsedMs = 0;
        this.zoneObjects?.disposeAll();
        this.shadoWorldObjects?.dispose();
        this.shadoWorldObjects = null;
        this.regionManager.dispose();
        this.lightManager.dispose();
        this.skyManager.dispose();
        if (destroy) {
            this.zoneContainer?.dispose();
            this.objectContainer?.dispose();
            this.lightContainer?.dispose();
            this.entityContainerNode?.dispose();
        }
        if (this.tickObservable) {
            this.parent.scene?.onBeforeRenderObservable.remove(this.tickObservable);
            this.tickObservable = null;
        }
    }
    async loadZone(zoneName) {
        console.log("[ZoneManager] Loading zone:", zoneName);
        this.dispose();
        const generation = this.loadGeneration;
        const longName = Object.values(supportedZones).find((z) => z.shortName.toLowerCase() === zoneName.toLowerCase())?.longName;
        const msg = {
            message: `You have entered ${longName}`,
            chanNum: 0,
            type: 0,
        };
        setTimeout(() => {
            emitter.emit("chatMessage", msg);
        }, 500);
        this.zoneName = zoneName;
        if (this.zoneObjects) {
            this.zoneObjects.disposeAll();
        }
        this.zoneObjects = new ObjectCache(this.objectContainer);
        await this.instantiateZone(generation);
        if (generation !== this.loadGeneration)
            return;
        EntityCache.initialize(this.GameManager.scene);
    }
    async loadSpawns(spawns) {
        console.log("Got spawns", spawns);
        if (!this.zoneContainer) {
        }
    }
    cleanupUnusedMaterials() {
        const scene = this.parent.scene;
        if (!scene) {
            return;
        }
        // Make a copy since disposing will mutate scene.materials
        for (const mat of scene.materials.slice()) {
            // check if any mesh or subMaterial is referencing it
            const used = scene.meshes.some((mesh) => {
                if (mesh.material === mat) {
                    return true;
                }
                if (mesh.material instanceof BABYLON.MultiMaterial) {
                    return mesh.material.subMaterials.some((sub) => sub === mat);
                }
                return false;
            });
            if (!used) {
                // dispose material and force-dispose its textures
                mat.dispose(true, true);
                scene.removeMaterial(mat);
                console.log(`[ZoneManager] Disposed unused material: ${mat.name}`);
            }
        }
    }
    async instantiateZone(generation = this.loadGeneration) {
        console.log("Inst zone");
        if (!this.zoneContainer) {
            return;
        }
        // this.parent.scene!.performancePriority =
        //   BABYLON.ScenePerformancePriority.Aggressive;
        if (!this.parent.scene) {
            console.error("[ZoneManager] No scene available to instantiate zone.");
            return;
        }
        // Zone Grid
        this.grid = new Grid(300.0, this.parent.scene);
        this.tickObservable = this.parent.scene.onBeforeRenderObservable.add(this.tick.bind(this));
        this.parent.setLoading(true);
        const bytes = await FileSystem.getFileBytes("eqrequiem/zones", `${this.zoneName}.babylon`);
        if (generation !== this.loadGeneration)
            return;
        if (!bytes) {
            console.log(`[ZoneManager] Failed to load zone file: ${this.zoneName}`);
            this.parent.setLoading(false);
            return;
        }
        const result = await BABYLON.loadBabylonAssetContainer(bytes, this.parent.scene, { name: `${this.zoneName}.babylon` }).catch((error) => {
            console.error(`[ZoneManager] Error importing zone mesh: ${error}`);
            this.parent.setLoading(false);
            return null;
        });
        if (generation !== this.loadGeneration) {
            result?.dispose();
            return;
        }
        if (!result) {
            console.error(`[ZoneManager] Failed to import zone mesh: ${this.zoneName}`);
            this.parent.setLoading(false);
            return;
        }
        // result.addAllToScene();
        this.zoneContainer.scaling.x = -1;
        const renderableMeshes = result.meshes.filter((mesh) => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0);
        if (!renderableMeshes.length) {
            console.error(`[ZoneManager] Zone ${this.zoneName} contains no renderable meshes`);
            result.dispose();
            this.parent.setLoading(false);
            return;
        }
        const staticMeshes = [];
        const passthroughMeshes = [];
        renderableMeshes.forEach((mesh) => {
            mesh.isPickable = true;
            mesh.collisionMask = 0x0000dad1;
            let canMerged = true;
            const materialExtras = mesh?.material?.metadata?.gltf?.extras;
            if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
                canMerged = false;
                const { frames, animationDelay } = materialExtras;
                this.animatedTextures.push({
                    mesh,
                    frames,
                    delayMs: animationDelay * 2,
                    elapsedMs: 0,
                    frame: 0,
                });
            }
            else {
                mesh.material?.freeze();
            }
            mesh.parent = this.zoneContainer;
            const passThrough = mesh.metadata?.gltf?.extras?.passThrough ?? false;
            if (!passThrough) {
                if (canMerged) {
                    staticMeshes.push(mesh);
                }
                // Disable the cloud mdf always
                if (mesh.name === "CLOUD_MDF") {
                    mesh.setEnabled(false);
                }
            }
            else {
                passthroughMeshes.push(mesh);
            }
        });
        const mergeablePassthroughMeshes = passthroughMeshes.filter((mesh) => mesh.getTotalVertices() > 0);
        const passThroughMesh = mergeablePassthroughMeshes.length
            ? BABYLON.Mesh.MergeMeshes(mergeablePassthroughMeshes, true, true, undefined, false, true)
            : null;
        const zoneMesh = BABYLON.Mesh.MergeMeshes(staticMeshes.filter((m) => m.getTotalVertices() > 0), true, true, undefined, false, true);
        if (!zoneMesh) {
            console.error("[ZoneManager] Failed to merge zone meshes");
            this.parent.setLoading(false);
            return;
        }
        zoneMesh.material?.freeze();
        zoneMesh.freezeWorldMatrix();
        zoneMesh.physicsBody = new BABYLON.PhysicsBody(zoneMesh, BABYLON.PhysicsMotionType.STATIC, false, this.parent.scene);
        zoneMesh.physicsBody.shape = new BABYLON.PhysicsShapeMesh(zoneMesh, this.parent.scene);
        zoneMesh.physicsBody.shape.material.friction = 1;
        zoneMesh.physicsBody.shape.material.restitution = 0;
        zoneMesh.physicsBody.setMassProperties({ mass: 0 }); // Static
        zoneMesh.setParent(this.zoneContainer);
        passThroughMesh?.setParent(this.zoneContainer);
        this.skyManager.createSky("sky1", this.disableWorldEnv);
        this.parent.setLoading(false);
        const metadataByte = await FileSystem.getFileBytes("eqrequiem/zones", `${this.zoneName}.json`);
        if (generation !== this.loadGeneration)
            return;
        if (metadataByte) {
            try {
                const str = new TextDecoder("utf-8").decode(metadataByte);
                const metadata = JSON.parse(str);
                console.log("Got metadata", metadata);
                console.log("Version: ", metadata.version);
                console.log("Current zone", this.CurrentZone);
                this.lightManager.loadLights(this.lightContainer, this.parent.scene, metadata.lights, this.zoneName);
                this.instantiatePromotedObjects(metadata, generation).then(() => {
                    if (generation !== this.loadGeneration)
                        return;
                    this.dedupeMaterialsByName();
                    this.cleanupUnusedMaterials();
                });
                setTimeout(() => {
                    if (generation !== this.loadGeneration)
                        return;
                    this.GameManager.scene?.textures.forEach((t) => {
                        if (t.name === "" &&
                            !(t instanceof BABYLON.RawTexture) &&
                            !(t instanceof BABYLON.RawTexture2DArray)) {
                            t.dispose();
                            this.GameManager.scene?.removeTexture(t);
                        }
                    });
                }, 2000);
                // this.bakeZoneVertexColors(metadata.lights);
            }
            catch (e) {
                console.log("Error parsing zone metadata", e);
            }
        }
    }
    dedupeMaterialsByName() {
        if (!this.GameManager.scene) {
            return;
        }
        const meshes = this.GameManager.scene.meshes;
        const materials = this.GameManager.scene.materials;
        const nameMap = new Map();
        for (const mat of materials.slice()) {
            if (!mat.name) {
                continue;
            }
            const key = mat.name;
            if (!nameMap.has(key)) {
                // first time we see this name → keep it
                nameMap.set(key, mat);
                // mat.freeze();
            }
            else {
                // duplicate name → remap all references, then dispose
                const canonical = nameMap.get(key);
                for (const mesh of meshes) {
                    // mesh.isPickable = false;
                    if (mesh.material === mat) {
                        mesh.material = canonical;
                    }
                    else if (mesh.material instanceof BABYLON.MultiMaterial) {
                        const mm = mesh.material;
                        mm.subMaterials = mm.subMaterials.map((sub) => {
                            if (sub === mat) {
                                return canonical;
                            }
                            return sub;
                        });
                    }
                }
                mat.dispose(true, true);
            }
        }
    }
    async instantiateObjects(metadata) {
        if (!this.zoneObjects) {
            return;
        }
        for (const [key, values] of Object.entries(metadata.objects)) {
            this.zoneObjects.addThinInstances(key, this.parent.scene, values);
        }
    }
    async instantiatePromotedObjects(metadata, generation) {
        if (!this.zoneObjects || !this.parent.scene)
            return;
        try {
            this.shadoWorldObjects = await ShadoWorldObjectLayer.load(this.zoneName, this.zoneObjects, this.parent.scene);
        }
        catch (error) {
            console.warn(`[ZoneManager] Promoted world bootstrap failed for ${this.zoneName}; ` +
                "using legacy metadata", error);
            this.shadoWorldObjects = null;
        }
        if (generation !== this.loadGeneration)
            return;
        if (this.shadoWorldObjects) {
            if (this.CurrentZone?.zonePoints) {
                this.regionManager.instantiateShadoRegions(this.parent.scene, this.shadoWorldObjects.world, this.CurrentZone.zonePoints);
            }
        }
        else {
            if (this.CurrentZone?.zonePoints) {
                this.regionManager.instantiateRegions(this.parent.scene, metadata, this.CurrentZone.zonePoints);
            }
            await this.instantiateObjects(metadata);
            console.info(`[ZoneManager] No promoted world package for ${this.zoneName}; ` +
                "using legacy object metadata");
        }
    }
    tick() {
        if (!this.zoneContainer) {
            return;
        }
        const delta = this.parent.scene?.getEngine().getDeltaTime() ?? 0;
        this.worldTickElapsedMs += delta;
        if (this.worldTickElapsedMs >= 1000) {
            this.worldTickElapsedMs %= 1000;
            this.skyManager.worldTick?.();
        }
        for (const animation of this.animatedTextures) {
            if (animation.mesh.isDisposed())
                continue;
            animation.elapsedMs += delta;
            if (animation.elapsedMs < animation.delayMs)
                continue;
            animation.elapsedMs %= animation.delayMs;
            animation.frame = (animation.frame + 1) % animation.frames.length;
            swapMaterialTexture(animation.mesh.material, animation.frames[animation.frame], true);
        }
        this.skyManager.tick(delta);
        this.shadoWorldObjects?.tick(delta);
        this.entityPool?.process();
        this.lightManager.updateLights(delta);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiem9uZS1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiem9uZS1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUMzQixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDaEUsT0FBTyxPQUF3QixNQUFNLHFCQUFxQixDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFMUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxXQUFXLE1BQU0sMEJBQTBCLENBQUM7QUFFbkQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzdELE9BQU8sa0JBQWtCLE1BQU0sdUJBQXVCLENBQUM7QUFDdkQsT0FBTyxVQUFVLE1BQU0sZUFBZSxDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFFbkMsT0FBTyxXQUFXLE1BQU0sMkJBQTJCLENBQUM7QUFFcEQsTUFBTSxPQUFPLFdBQVc7SUFDdEIsSUFBSSxhQUFhO1FBQ2YsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzVCLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDM0IsQ0FBQztJQUNPLFlBQVksQ0FBZTtJQUVuQyxJQUFJLFVBQVU7UUFDWixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDekIsQ0FBQztJQUNPLFVBQVUsQ0FBcUI7SUFFL0IsYUFBYSxDQUFnQjtJQUNyQyxJQUFJLGFBQWE7UUFDZixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDNUIsQ0FB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QztZQUNoQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7UUFDaEMsQ0FBQztRQUNELEtBQUssTUFBTSxTQUFTLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDOUMsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtnQkFBRSxTQUFTO1lBQzFDLFNBQVMsQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDO1lBQzdCLElBQUksU0FBUyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsT0FBTztnQkFBRSxTQUFTO1lBQ3RELFNBQVMsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUN6QyxTQUFTLENBQUMsS0FBSyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsRSxtQkFBbUIsQ0FDakIsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFTLEVBQ3hCLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUNqQyxJQUFJLENBQ0wsQ0FBQztRQUNKLENBQUM7UUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEMsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgKiBhcyBCSlMgZnJvbSBcIkBiYWJ5bG9uanMvY29yZVwiO1xuaW1wb3J0IEJBQllMT04gZnJvbSBcIkBianNcIjtcbmltcG9ydCB7IHN1cHBvcnRlZFpvbmVzIH0gZnJvbSBcIkBnYW1lL0NvbnN0YW50cy9zdXBwb3J0ZWRab25lc1wiO1xuaW1wb3J0IGVtaXR0ZXIsIHsgQ2hhdE1lc3NhZ2UgfSBmcm9tIFwiQGdhbWUvRXZlbnRzL2V2ZW50c1wiO1xuaW1wb3J0IHsgRmlsZVN5c3RlbSB9IGZyb20gXCJAZ2FtZS9GaWxlU3lzdGVtL2ZpbGVzeXN0ZW1cIjtcbmltcG9ydCB7IExpZ2h0TWFuYWdlciB9IGZyb20gXCJAZ2FtZS9MaWdodHMvbGlnaHQtbWFuYWdlclwiO1xuaW1wb3J0IHR5cGUgR2FtZU1hbmFnZXIgZnJvbSBcIkBnYW1lL01hbmFnZXIvZ2FtZS1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBzd2FwTWF0ZXJpYWxUZXh0dXJlIH0gZnJvbSBcIkBnYW1lL01vZGVsL2Jqcy11dGlsc1wiO1xuaW1wb3J0IEVudGl0eUNhY2hlIGZyb20gXCJAZ2FtZS9Nb2RlbC9lbnRpdHktY2FjaGVcIjtcbmltcG9ydCB7IFNwYXducyB9IGZyb20gXCJAZ2FtZS9OZXQvbWVzc2FnZXNcIjtcbmltcG9ydCB7IFJlZ2lvbk1hbmFnZXIgfSBmcm9tIFwiQGdhbWUvUmVnaW9ucy9yZWdpb24tbWFuYWdlclwiO1xuaW1wb3J0IERheU5pZ2h0U2t5TWFuYWdlciBmcm9tIFwiQGdhbWUvU2t5L3NreS1tYW5hZ2VyXCI7XG5pbXBvcnQgRW50aXR5UG9vbCBmcm9tIFwiLi9lbnRpdHktcG9vbFwiO1xuaW1wb3J0IHsgU2hhZG9Xb3JsZE9iamVjdExheWVyIH0gZnJvbSBcIi4vc2hhZG8td29ybGQtb2JqZWN0LWxheWVyXCI7XG5pbXBvcnQgeyBHcmlkIH0gZnJvbSBcIi4vem9uZS1ncmlkXCI7XG5pbXBvcnQgeyBab25lTWV0YWRhdGEgfSBmcm9tIFwiLi96b25lLXR5cGVzXCI7XG5pbXBvcnQgT2JqZWN0Q2FjaGUgZnJvbSBcIkAvR2FtZS9Nb2RlbC9vYmplY3QtY2FjaGVcIjtcblxuZXhwb3J0IGNsYXNzIFpvbmVNYW5hZ2VyIHtcbiAgZ2V0IFJlZ2lvbk1hbmFnZXIoKTogUmVnaW9uTWFuYWdlciB7XG4gICAgcmV0dXJuIHRoaXMucmVnaW9uTWFuYWdlcjtcbiAgfVxuXG4gIGdldCBMaWdodE1hbmFnZXIoKTogTGlnaHRNYW5hZ2VyIHtcbiAgICByZXR1cm4gdGhpcy5saWdodE1hbmFnZXI7XG4gIH1cbiAgcHJpdmF0ZSBsaWdodE1hbmFnZXI6IExpZ2h0TWFuYWdlcjtcblxuICBnZXQgU2t5TWFuYWdlcigpOiBEYXlOaWdodFNreU1hbmFnZXIge1xuICAgIHJldHVybiB0aGlzLnNreU1hbmFnZXI7XG4gIH1cbiAgcHJpdmF0ZSBza3lNYW5hZ2VyOiBEYXlOaWdodFNreU1hbmFnZXI7XG5cbiAgcHJpdmF0ZSByZWdpb25NYW5hZ2VyOiBSZWdpb25NYW5hZ2VyO1xuICBnZXQgWm9uZUNvbnRhaW5lcigpOiBCSlMuVHJhbnNmb3JtTm9kZSB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLnpvbmVDb250YWluZXI7XG4gIH1cbiAgcHJpdmF0ZSB6b25lQ29udGFpbmVyOiBCSlMuVHJhbnNmb3JtTm9kZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIG9iamVjdENvbnRhaW5lcjogQkpTLlRyYW5zZm9ybU5vZGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsaWdodENvbnRhaW5lcjogQkpTLlRyYW5zZm9ybU5vZGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBlbnRpdHlDb250YWluZXJOb2RlOiBCSlMuVHJhbnNmb3JtTm9kZSB8IG51bGwgPSBudWxsO1xuICBwdWJsaWMgZ3JpZDogR3JpZCB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgdGlja09ic2VydmFibGU6IEJKUy5OdWxsYWJsZTxCSlMuT2JzZXJ2ZXI8QkpTLlNjZW5lPj4gPSBudWxsO1xuICBnZXQgRW50aXR5UG9vbCgpOiBFbnRpdHlQb29sIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuZW50aXR5UG9vbDtcbiAgfVxuICBwcml2YXRlIGVudGl0eVBvb2w6IEVudGl0eVBvb2wgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB6b25lT2JqZWN0czogT2JqZWN0Q2FjaGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBzaGFkb1dvcmxkT2JqZWN0czogU2hhZG9Xb3JsZE9iamVjdExheWVyIHwgbnVsbCA9IG51bGw7XG5cbiAgcHJpdmF0ZSBkaXNhYmxlV29ybGRFbnY6IGJvb2xlYW4gPSBmYWxzZTtcbiAgcHVibGljIHpvbmVOYW1lID0gXCJcIjtcbiAgcHVibGljIGdldCBDdXJyZW50Wm9uZSgpIHtcbiAgICByZXR1cm4gdGhpcy5wYXJlbnQuQ3VycmVudFpvbmU7XG4gIH1cblxuICBnZXQgR2FtZU1hbmFnZXIoKTogR2FtZU1hbmFnZXIge1xuICAgIHJldHVybiB0aGlzLnBhcmVudDtcbiAgfVxuICBwcml2YXRlIHBhcmVudDogR2FtZU1hbmFnZXI7XG5cbiAgcHJpdmF0ZSBhbmltYXRlZFRleHR1cmVzOiBBcnJheTx7XG4gICAgbWVzaDogQkpTLkFic3RyYWN0TWVzaDtcbiAgICBmcmFtZXM6IHN0cmluZ1tdO1xuICAgIGRlbGF5TXM6IG51bWJlcjtcbiAgICBlbGFwc2VkTXM6IG51bWJlcjtcbiAgICBmcmFtZTogbnVtYmVyO1xuICB9PiA9IFtdO1xuICBwcml2YXRlIHdvcmxkVGlja0VsYXBzZWRNcyA9IDA7XG4gIHByaXZhdGUgbG9hZEdlbmVyYXRpb24gPSAwO1xuXG4gIGNvbnN0cnVjdG9yKHBhcmVudDogR2FtZU1hbmFnZXIpIHtcbiAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcbiAgICB0aGlzLnpvbmVDb250YWluZXIgPSBudWxsO1xuICAgIHRoaXMucmVnaW9uTWFuYWdlciA9IG5ldyBSZWdpb25NYW5hZ2VyKHRoaXMuR2FtZU1hbmFnZXIpO1xuICAgIHRoaXMubGlnaHRNYW5hZ2VyID0gbmV3IExpZ2h0TWFuYWdlcigpO1xuICAgIHRoaXMuc2t5TWFuYWdlciA9IG5ldyBEYXlOaWdodFNreU1hbmFnZXIodGhpcyk7XG4gICAgdGhpcy56b25lQ29udGFpbmVyID1cbiAgICAgIHRoaXMucGFyZW50LnNjZW5lPy5nZXRUcmFuc2Zvcm1Ob2RlQnlOYW1lKFwiWm9uZUNvbnRhaW5lclwiKSA/P1xuICAgICAgbmV3IEJBQllMT04uVHJhbnNmb3JtTm9kZShcIlpvbmVDb250YWluZXJcIiwgdGhpcy5wYXJlbnQuc2NlbmUpO1xuICAgIHRoaXMub2JqZWN0Q29udGFpbmVyID1cbiAgICAgIHRoaXMucGFyZW50LnNjZW5lPy5nZXRUcmFuc2Zvcm1Ob2RlQnlOYW1lKFwiWm9uZU9iamVjdENvbnRhaW5lclwiKSA/P1xuICAgICAgbmV3IEJBQllMT04uVHJhbnNmb3JtTm9kZShcIlpvbmVPYmplY3RDb250YWluZXJcIiwgdGhpcy5wYXJlbnQuc2NlbmUpO1xuICAgIHRoaXMubGlnaHRDb250YWluZXIgPVxuICAgICAgdGhpcy5wYXJlbnQuc2NlbmU/LmdldFRyYW5zZm9ybU5vZGVCeU5hbWUoXCJMaWdodENvbnRhaW5lclwiKSA/P1xuICAgICAgbmV3IEJBQllMT04uVHJhbnNmb3JtTm9kZShcIkxpZ2h0Q29udGFpbmVyXCIsIHRoaXMucGFyZW50LnNjZW5lKTtcbiAgICB0aGlzLmVudGl0eUNvbnRhaW5lck5vZGUgPVxuICAgICAgdGhpcy5wYXJlbnQuc2NlbmU/LmdldFRyYW5zZm9ybU5vZGVCeU5hbWUoXCJFbnRpdHlDb250YWluZXJcIikgPz9cbiAgICAgIG5ldyBCQUJZTE9OLlRyYW5zZm9ybU5vZGUoXCJFbnRpdHlDb250YWluZXJcIiwgdGhpcy5wYXJlbnQuc2NlbmUpO1xuICAgIHRoaXMuZW50aXR5UG9vbCA9IG5ldyBFbnRpdHlQb29sKFxuICAgICAgdGhpcy5HYW1lTWFuYWdlcixcbiAgICAgIHRoaXMuZW50aXR5Q29udGFpbmVyTm9kZSxcbiAgICAgIHRoaXMucGFyZW50LnNjZW5lISxcbiAgICApO1xuICB9XG5cbiAgZGlzcG9zZShkZXN0cm95ID0gZmFsc2UpIHtcbiAgICB0aGlzLmxvYWRHZW5lcmF0aW9uKys7XG4gICAgLy8gQ2xlYW4gdXAgcmVzb3VyY2VzIGlmIG5lZWRlZC5cbiAgICBpZiAodGhpcy56b25lQ29udGFpbmVyKSB7XG4gICAgICB0aGlzLnpvbmVDb250YWluZXIuZ2V0Q2hpbGRyZW4oKS5mb3JFYWNoKChjaGlsZCkgPT4ge1xuICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBCQUJZTE9OLkFic3RyYWN0TWVzaCkge1xuICAgICAgICAgIGNoaWxkLmRpc3Bvc2UoKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGlsZCBpbnN0YW5jZW9mIEJBQllMT04uVHJhbnNmb3JtTm9kZSkge1xuICAgICAgICAgIGNoaWxkLmdldENoaWxkcmVuKCkuZm9yRWFjaCgoZ3JhbmRDaGlsZCkgPT4ge1xuICAgICAgICAgICAgaWYgKGdyYW5kQ2hpbGQgaW5zdGFuY2VvZiBCQUJZTE9OLkFic3RyYWN0TWVzaCkge1xuICAgICAgICAgICAgICBncmFuZENoaWxkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmVudGl0eVBvb2wpIHtcbiAgICAgIHRoaXMuZW50aXR5UG9vbC5kaXNwb3NlKCk7XG4gICAgfVxuICAgIGlmICh0aGlzLmdyaWQpIHtcbiAgICAgIHRoaXMuZ3JpZC5kaXNwb3NlKCk7XG4gICAgICB0aGlzLmdyaWQgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLmFuaW1hdGVkVGV4dHVyZXMgPSBbXTtcbiAgICB0aGlzLndvcmxkVGlja0VsYXBzZWRNcyA9IDA7XG4gICAgdGhpcy56b25lT2JqZWN0cz8uZGlzcG9zZUFsbCgpO1xuICAgIHRoaXMuc2hhZG9Xb3JsZE9iamVjdHM/LmRpc3Bvc2UoKTtcbiAgICB0aGlzLnNoYWRvV29ybGRPYmplY3RzID0gbnVsbDtcbiAgICB0aGlzLnJlZ2lvbk1hbmFnZXIuZGlzcG9zZSgpO1xuICAgIHRoaXMubGlnaHRNYW5hZ2VyLmRpc3Bvc2UoKTtcbiAgICB0aGlzLnNreU1hbmFnZXIuZGlzcG9zZSgpO1xuICAgIGlmIChkZXN0cm95KSB7XG4gICAgICB0aGlzLnpvbmVDb250YWluZXI/LmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMub2JqZWN0Q29udGFpbmVyPy5kaXNwb3NlKCk7XG4gICAgICB0aGlzLmxpZ2h0Q29udGFpbmVyPy5kaXNwb3NlKCk7XG4gICAgICB0aGlzLmVudGl0eUNvbnRhaW5lck5vZGU/LmRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaWYgKHRoaXMudGlja09ic2VydmFibGUpIHtcbiAgICAgIHRoaXMucGFyZW50LnNjZW5lPy5vbkJlZm9yZVJlbmRlck9ic2VydmFibGUucmVtb3ZlKHRoaXMudGlja09ic2VydmFibGUpO1xuICAgICAgdGhpcy50aWNrT2JzZXJ2YWJsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGxvYWRab25lKHpvbmVOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zb2xlLmxvZyhcIltab25lTWFuYWdlcl0gTG9hZGluZyB6b25lOlwiLCB6b25lTmFtZSk7XG4gICAgdGhpcy5kaXNwb3NlKCk7XG4gICAgY29uc3QgZ2VuZXJhdGlvbiA9IHRoaXMubG9hZEdlbmVyYXRpb247XG4gICAgY29uc3QgbG9uZ05hbWUgPSBPYmplY3QudmFsdWVzKHN1cHBvcnRlZFpvbmVzKS5maW5kKFxuICAgICAgKHopID0+IHouc2hvcnROYW1lLnRvTG93ZXJDYXNlKCkgPT09IHpvbmVOYW1lLnRvTG93ZXJDYXNlKCksXG4gICAgKT8ubG9uZ05hbWU7XG4gICAgY29uc3QgbXNnOiBDaGF0TWVzc2FnZSA9IHtcbiAgICAgIG1lc3NhZ2U6IGBZb3UgaGF2ZSBlbnRlcmVkICR7bG9uZ05hbWV9YCxcbiAgICAgIGNoYW5OdW06IDAsXG4gICAgICB0eXBlOiAwLFxuICAgIH07XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBlbWl0dGVyLmVtaXQoXCJjaGF0TWVzc2FnZVwiLCBtc2cpO1xuICAgIH0sIDUwMCk7XG4gICAgdGhpcy56b25lTmFtZSA9IHpvbmVOYW1lO1xuXG4gICAgaWYgKHRoaXMuem9uZU9iamVjdHMpIHtcbiAgICAgIHRoaXMuem9uZU9iamVjdHMuZGlzcG9zZUFsbCgpO1xuICAgIH1cbiAgICB0aGlzLnpvbmVPYmplY3RzID0gbmV3IE9iamVjdENhY2hlKHRoaXMub2JqZWN0Q29udGFpbmVyKTtcbiAgICBhd2FpdCB0aGlzLmluc3RhbnRpYXRlWm9uZShnZW5lcmF0aW9uKTtcbiAgICBpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5sb2FkR2VuZXJhdGlvbikgcmV0dXJuO1xuICAgIEVudGl0eUNhY2hlLmluaXRpYWxpemUodGhpcy5HYW1lTWFuYWdlci5zY2VuZSEpO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGxvYWRTcGF3bnMoc3Bhd25zOiBTcGF3bnMpIHtcbiAgICBjb25zb2xlLmxvZyhcIkdvdCBzcGF3bnNcIiwgc3Bhd25zKTtcbiAgICBpZiAoIXRoaXMuem9uZUNvbnRhaW5lcikge1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY2xlYW51cFVudXNlZE1hdGVyaWFscygpIHtcbiAgICBjb25zdCBzY2VuZSA9IHRoaXMucGFyZW50LnNjZW5lO1xuICAgIGlmICghc2NlbmUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBNYWtlIGEgY29weSBzaW5jZSBkaXNwb3Npbmcgd2lsbCBtdXRhdGUgc2NlbmUubWF0ZXJpYWxzXG4gICAgZm9yIChjb25zdCBtYXQgb2Ygc2NlbmUubWF0ZXJpYWxzLnNsaWNlKCkpIHtcbiAgICAgIC8vIGNoZWNrIGlmIGFueSBtZXNoIG9yIHN1Yk1hdGVyaWFsIGlzIHJlZmVyZW5jaW5nIGl0XG4gICAgICBjb25zdCB1c2VkID0gc2NlbmUubWVzaGVzLnNvbWUoKG1lc2gpID0+IHtcbiAgICAgICAgaWYgKG1lc2gubWF0ZXJpYWwgPT09IG1hdCkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtZXNoLm1hdGVyaWFsIGluc3RhbmNlb2YgQkFCWUxPTi5NdWx0aU1hdGVyaWFsKSB7XG4gICAgICAgICAgcmV0dXJuIChtZXNoLm1hdGVyaWFsIGFzIEJKUy5NdWx0aU1hdGVyaWFsKS5zdWJNYXRlcmlhbHMuc29tZShcbiAgICAgICAgICAgIChzdWIpID0+IHN1YiA9PT0gbWF0LFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSk7XG5cbiAgICAgIGlmICghdXNlZCkge1xuICAgICAgICAvLyBkaXNwb3NlIG1hdGVyaWFsIGFuZCBmb3JjZS1kaXNwb3NlIGl0cyB0ZXh0dXJlc1xuICAgICAgICBtYXQuZGlzcG9zZSh0cnVlLCB0cnVlKTtcbiAgICAgICAgc2NlbmUucmVtb3ZlTWF0ZXJpYWwobWF0KTtcbiAgICAgICAgY29uc29sZS5sb2coYFtab25lTWFuYWdlcl0gRGlzcG9zZWQgdW51c2VkIG1hdGVyaWFsOiAke21hdC5uYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBpbnN0YW50aWF0ZVpvbmUoZ2VuZXJhdGlvbiA9IHRoaXMubG9hZEdlbmVyYXRpb24pIHtcbiAgICBjb25zb2xlLmxvZyhcIkluc3Qgem9uZVwiKTtcbiAgICBpZiAoIXRoaXMuem9uZUNvbnRhaW5lcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyB0aGlzLnBhcmVudC5zY2VuZSEucGVyZm9ybWFuY2VQcmlvcml0eSA9XG4gICAgLy8gICBCQUJZTE9OLlNjZW5lUGVyZm9ybWFuY2VQcmlvcml0eS5BZ2dyZXNzaXZlO1xuICAgIGlmICghdGhpcy5wYXJlbnQuc2NlbmUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbWm9uZU1hbmFnZXJdIE5vIHNjZW5lIGF2YWlsYWJsZSB0byBpbnN0YW50aWF0ZSB6b25lLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBab25lIEdyaWRcbiAgICB0aGlzLmdyaWQgPSBuZXcgR3JpZCgzMDAuMCwgdGhpcy5wYXJlbnQuc2NlbmUpO1xuXG4gICAgdGhpcy50aWNrT2JzZXJ2YWJsZSA9IHRoaXMucGFyZW50LnNjZW5lLm9uQmVmb3JlUmVuZGVyT2JzZXJ2YWJsZS5hZGQoXG4gICAgICB0aGlzLnRpY2suYmluZCh0aGlzKSxcbiAgICApO1xuICAgIHRoaXMucGFyZW50LnNldExvYWRpbmcodHJ1ZSk7XG4gICAgY29uc3QgYnl0ZXMgPSBhd2FpdCBGaWxlU3lzdGVtLmdldEZpbGVCeXRlcyhcbiAgICAgIFwiZXFyZXF1aWVtL3pvbmVzXCIsXG4gICAgICBgJHt0aGlzLnpvbmVOYW1lfS5iYWJ5bG9uYCxcbiAgICApO1xuICAgIGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLmxvYWRHZW5lcmF0aW9uKSByZXR1cm47XG4gICAgaWYgKCFieXRlcykge1xuICAgICAgY29uc29sZS5sb2coYFtab25lTWFuYWdlcl0gRmFpbGVkIHRvIGxvYWQgem9uZSBmaWxlOiAke3RoaXMuem9uZU5hbWV9YCk7XG4gICAgICB0aGlzLnBhcmVudC5zZXRMb2FkaW5nKGZhbHNlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgQkFCWUxPTi5sb2FkQmFieWxvbkFzc2V0Q29udGFpbmVyKFxuICAgICAgYnl0ZXMsXG4gICAgICB0aGlzLnBhcmVudC5zY2VuZSEsXG4gICAgICB7IG5hbWU6IGAke3RoaXMuem9uZU5hbWV9LmJhYnlsb25gIH0sXG4gICAgKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYFtab25lTWFuYWdlcl0gRXJyb3IgaW1wb3J0aW5nIHpvbmUgbWVzaDogJHtlcnJvcn1gKTtcbiAgICAgIHRoaXMucGFyZW50LnNldExvYWRpbmcoZmFsc2UpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSk7XG4gICAgaWYgKGdlbmVyYXRpb24gIT09IHRoaXMubG9hZEdlbmVyYXRpb24pIHtcbiAgICAgIHJlc3VsdD8uZGlzcG9zZSgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtab25lTWFuYWdlcl0gRmFpbGVkIHRvIGltcG9ydCB6b25lIG1lc2g6ICR7dGhpcy56b25lTmFtZX1gLFxuICAgICAgKTtcbiAgICAgIHRoaXMucGFyZW50LnNldExvYWRpbmcoZmFsc2UpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyByZXN1bHQuYWRkQWxsVG9TY2VuZSgpO1xuICAgIHRoaXMuem9uZUNvbnRhaW5lciEuc2NhbGluZy54ID0gLTE7XG4gICAgY29uc3QgcmVuZGVyYWJsZU1lc2hlcyA9IHJlc3VsdC5tZXNoZXMuZmlsdGVyKFxuICAgICAgKG1lc2gpOiBtZXNoIGlzIEJKUy5NZXNoID0+XG4gICAgICAgIG1lc2ggaW5zdGFuY2VvZiBCQUJZTE9OLk1lc2ggJiYgbWVzaC5nZXRUb3RhbFZlcnRpY2VzKCkgPiAwLFxuICAgICk7XG4gICAgaWYgKCFyZW5kZXJhYmxlTWVzaGVzLmxlbmd0aCkge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYFtab25lTWFuYWdlcl0gWm9uZSAke3RoaXMuem9uZU5hbWV9IGNvbnRhaW5zIG5vIHJlbmRlcmFibGUgbWVzaGVzYCxcbiAgICAgICk7XG4gICAgICByZXN1bHQuZGlzcG9zZSgpO1xuICAgICAgdGhpcy5wYXJlbnQuc2V0TG9hZGluZyhmYWxzZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXRpY01lc2hlczogQkpTLk1lc2hbXSA9IFtdO1xuICAgIGNvbnN0IHBhc3N0aHJvdWdoTWVzaGVzOiBCSlMuTWVzaFtdID0gW107XG5cbiAgICByZW5kZXJhYmxlTWVzaGVzLmZvckVhY2goKG1lc2gpID0+IHtcbiAgICAgIG1lc2guaXNQaWNrYWJsZSA9IHRydWU7XG4gICAgICBtZXNoLmNvbGxpc2lvbk1hc2sgPSAweDAwMDBkYWQxO1xuICAgICAgbGV0IGNhbk1lcmdlZCA9IHRydWU7XG4gICAgICBjb25zdCBtYXRlcmlhbEV4dHJhcyA9IG1lc2g/Lm1hdGVyaWFsPy5tZXRhZGF0YT8uZ2x0Zj8uZXh0cmFzO1xuICAgICAgaWYgKG1hdGVyaWFsRXh0cmFzPy5mcmFtZXM/Lmxlbmd0aCAmJiBtYXRlcmlhbEV4dHJhcz8uYW5pbWF0aW9uRGVsYXkpIHtcbiAgICAgICAgY2FuTWVyZ2VkID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHsgZnJhbWVzLCBhbmltYXRpb25EZWxheSB9ID0gbWF0ZXJpYWxFeHRyYXM7XG4gICAgICAgIHRoaXMuYW5pbWF0ZWRUZXh0dXJlcy5wdXNoKHtcbiAgICAgICAgICBtZXNoLFxuICAgICAgICAgIGZyYW1lcyxcbiAgICAgICAgICBkZWxheU1zOiBhbmltYXRpb25EZWxheSAqIDIsXG4gICAgICAgICAgZWxhcHNlZE1zOiAwLFxuICAgICAgICAgIGZyYW1lOiAwLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1lc2gubWF0ZXJpYWw/LmZyZWV6ZSgpO1xuICAgICAgfVxuXG4gICAgICBtZXNoLnBhcmVudCA9IHRoaXMuem9uZUNvbnRhaW5lcjtcblxuICAgICAgY29uc3QgcGFzc1Rocm91Z2ggPSBtZXNoLm1ldGFkYXRhPy5nbHRmPy5leHRyYXM/LnBhc3NUaHJvdWdoID8/IGZhbHNlO1xuICAgICAgaWYgKCFwYXNzVGhyb3VnaCkge1xuICAgICAgICBpZiAoY2FuTWVyZ2VkKSB7XG4gICAgICAgICAgc3RhdGljTWVzaGVzLnB1c2gobWVzaCBhcyBCSlMuTWVzaCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGlzYWJsZSB0aGUgY2xvdWQgbWRmIGFsd2F5c1xuICAgICAgICBpZiAobWVzaC5uYW1lID09PSBcIkNMT1VEX01ERlwiKSB7XG4gICAgICAgICAgbWVzaC5zZXRFbmFibGVkKGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFzc3Rocm91Z2hNZXNoZXMucHVzaChtZXNoIGFzIEJKUy5NZXNoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IG1lcmdlYWJsZVBhc3N0aHJvdWdoTWVzaGVzID0gcGFzc3Rocm91Z2hNZXNoZXMuZmlsdGVyKFxuICAgICAgKG1lc2gpID0+IG1lc2guZ2V0VG90YWxWZXJ0aWNlcygpID4gMCxcbiAgICApO1xuICAgIGNvbnN0IHBhc3NUaHJvdWdoTWVzaCA9IG1lcmdlYWJsZVBhc3N0aHJvdWdoTWVzaGVzLmxlbmd0aFxuICAgICAgPyBCQUJZTE9OLk1lc2guTWVyZ2VNZXNoZXMoXG4gICAgICAgICAgbWVyZ2VhYmxlUGFzc3Rocm91Z2hNZXNoZXMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICApXG4gICAgICA6IG51bGw7XG4gICAgY29uc3Qgem9uZU1lc2ggPSBCQUJZTE9OLk1lc2guTWVyZ2VNZXNoZXMoXG4gICAgICBzdGF0aWNNZXNoZXMuZmlsdGVyKChtKSA9PiBtLmdldFRvdGFsVmVydGljZXMoKSA+IDApLFxuICAgICAgdHJ1ZSxcbiAgICAgIHRydWUsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgKTtcbiAgICBpZiAoIXpvbmVNZXNoKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiW1pvbmVNYW5hZ2VyXSBGYWlsZWQgdG8gbWVyZ2Ugem9uZSBtZXNoZXNcIik7XG4gICAgICB0aGlzLnBhcmVudC5zZXRMb2FkaW5nKGZhbHNlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgem9uZU1lc2gubWF0ZXJpYWw/LmZyZWV6ZSgpO1xuICAgIHpvbmVNZXNoLmZyZWV6ZVdvcmxkTWF0cml4KCk7XG4gICAgem9uZU1lc2gucGh5c2ljc0JvZHkgPSBuZXcgQkFCWUxPTi5QaHlzaWNzQm9keShcbiAgICAgIHpvbmVNZXNoLFxuICAgICAgQkFCWUxPTi5QaHlzaWNzTW90aW9uVHlwZS5TVEFUSUMsXG4gICAgICBmYWxzZSxcbiAgICAgIHRoaXMucGFyZW50LnNjZW5lISxcbiAgICApO1xuICAgIHpvbmVNZXNoLnBoeXNpY3NCb2R5LnNoYXBlID0gbmV3IEJBQllMT04uUGh5c2ljc1NoYXBlTWVzaChcbiAgICAgIHpvbmVNZXNoIGFzIEJKUy5NZXNoLFxuICAgICAgdGhpcy5wYXJlbnQuc2NlbmUhLFxuICAgICk7XG4gICAgem9uZU1lc2gucGh5c2ljc0JvZHkuc2hhcGUubWF0ZXJpYWwuZnJpY3Rpb24gPSAxO1xuICAgIHpvbmVNZXNoLnBoeXNpY3NCb2R5LnNoYXBlLm1hdGVyaWFsLnJlc3RpdHV0aW9uID0gMDtcbiAgICB6b25lTWVzaC5waHlzaWNzQm9keS5zZXRNYXNzUHJvcGVydGllcyh7IG1hc3M6IDAgfSk7IC8vIFN0YXRpY1xuICAgIHpvbmVNZXNoLnNldFBhcmVudCh0aGlzLnpvbmVDb250YWluZXIpO1xuICAgIHBhc3NUaHJvdWdoTWVzaD8uc2V0UGFyZW50KHRoaXMuem9uZUNvbnRhaW5lcik7XG4gICAgdGhpcy5za3lNYW5hZ2VyLmNyZWF0ZVNreShcInNreTFcIiwgdGhpcy5kaXNhYmxlV29ybGRFbnYpO1xuICAgIHRoaXMucGFyZW50LnNldExvYWRpbmcoZmFsc2UpO1xuXG4gICAgY29uc3QgbWV0YWRhdGFCeXRlID0gYXdhaXQgRmlsZVN5c3RlbS5nZXRGaWxlQnl0ZXMoXG4gICAgICBcImVxcmVxdWllbS96b25lc1wiLFxuICAgICAgYCR7dGhpcy56b25lTmFtZX0uanNvbmAsXG4gICAgKTtcbiAgICBpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5sb2FkR2VuZXJhdGlvbikgcmV0dXJuO1xuICAgIGlmIChtZXRhZGF0YUJ5dGUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN0ciA9IG5ldyBUZXh0RGVjb2RlcihcInV0Zi04XCIpLmRlY29kZShtZXRhZGF0YUJ5dGUpO1xuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IEpTT04ucGFyc2Uoc3RyKSBhcyBab25lTWV0YWRhdGE7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiR290IG1ldGFkYXRhXCIsIG1ldGFkYXRhKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJWZXJzaW9uOiBcIiwgbWV0YWRhdGEudmVyc2lvbik7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQ3VycmVudCB6b25lXCIsIHRoaXMuQ3VycmVudFpvbmUpO1xuICAgICAgICB0aGlzLmxpZ2h0TWFuYWdlci5sb2FkTGlnaHRzKFxuICAgICAgICAgIHRoaXMubGlnaHRDb250YWluZXIhLFxuICAgICAgICAgIHRoaXMucGFyZW50LnNjZW5lISxcbiAgICAgICAgICBtZXRhZGF0YS5saWdodHMsXG4gICAgICAgICAgdGhpcy56b25lTmFtZSxcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5pbnN0YW50aWF0ZVByb21vdGVkT2JqZWN0cyhtZXRhZGF0YSwgZ2VuZXJhdGlvbikudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKGdlbmVyYXRpb24gIT09IHRoaXMubG9hZEdlbmVyYXRpb24pIHJldHVybjtcbiAgICAgICAgICB0aGlzLmRlZHVwZU1hdGVyaWFsc0J5TmFtZSgpO1xuICAgICAgICAgIHRoaXMuY2xlYW51cFVudXNlZE1hdGVyaWFscygpO1xuICAgICAgICB9KTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgaWYgKGdlbmVyYXRpb24gIT09IHRoaXMubG9hZEdlbmVyYXRpb24pIHJldHVybjtcbiAgICAgICAgICB0aGlzLkdhbWVNYW5hZ2VyLnNjZW5lPy50ZXh0dXJlcy5mb3JFYWNoKCh0KSA9PiB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHQubmFtZSA9PT0gXCJcIiAmJlxuICAgICAgICAgICAgICAhKHQgaW5zdGFuY2VvZiBCQUJZTE9OLlJhd1RleHR1cmUpICYmXG4gICAgICAgICAgICAgICEodCBpbnN0YW5jZW9mIEJBQllMT04uUmF3VGV4dHVyZTJEQXJyYXkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgdC5kaXNwb3NlKCk7XG4gICAgICAgICAgICAgIHRoaXMuR2FtZU1hbmFnZXIuc2NlbmU/LnJlbW92ZVRleHR1cmUodCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sIDIwMDApO1xuXG4gICAgICAgIC8vIHRoaXMuYmFrZVpvbmVWZXJ0ZXhDb2xvcnMobWV0YWRhdGEubGlnaHRzKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJFcnJvciBwYXJzaW5nIHpvbmUgbWV0YWRhdGFcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZWR1cGVNYXRlcmlhbHNCeU5hbWUoKSB7XG4gICAgaWYgKCF0aGlzLkdhbWVNYW5hZ2VyLnNjZW5lKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG1lc2hlczogQkpTLkFic3RyYWN0TWVzaFtdID0gdGhpcy5HYW1lTWFuYWdlci5zY2VuZS5tZXNoZXM7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBCSlMuTWF0ZXJpYWxbXSA9IHRoaXMuR2FtZU1hbmFnZXIuc2NlbmUubWF0ZXJpYWxzO1xuXG4gICAgY29uc3QgbmFtZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBCSlMuTWF0ZXJpYWw+KCk7XG5cbiAgICBmb3IgKGNvbnN0IG1hdCBvZiBtYXRlcmlhbHMuc2xpY2UoKSkge1xuICAgICAgaWYgKCFtYXQubmFtZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGtleSA9IG1hdC5uYW1lO1xuXG4gICAgICBpZiAoIW5hbWVNYXAuaGFzKGtleSkpIHtcbiAgICAgICAgLy8gZmlyc3QgdGltZSB3ZSBzZWUgdGhpcyBuYW1lIOKGkiBrZWVwIGl0XG4gICAgICAgIG5hbWVNYXAuc2V0KGtleSwgbWF0KTtcbiAgICAgICAgLy8gbWF0LmZyZWV6ZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZHVwbGljYXRlIG5hbWUg4oaSIHJlbWFwIGFsbCByZWZlcmVuY2VzLCB0aGVuIGRpc3Bvc2VcbiAgICAgICAgY29uc3QgY2Fub25pY2FsID0gbmFtZU1hcC5nZXQoa2V5KSE7XG5cbiAgICAgICAgZm9yIChjb25zdCBtZXNoIG9mIG1lc2hlcykge1xuICAgICAgICAgIC8vIG1lc2guaXNQaWNrYWJsZSA9IGZhbHNlO1xuICAgICAgICAgIGlmIChtZXNoLm1hdGVyaWFsID09PSBtYXQpIHtcbiAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwgPSBjYW5vbmljYWw7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXNoLm1hdGVyaWFsIGluc3RhbmNlb2YgQkFCWUxPTi5NdWx0aU1hdGVyaWFsKSB7XG4gICAgICAgICAgICBjb25zdCBtbSA9IG1lc2gubWF0ZXJpYWwgYXMgQkpTLk11bHRpTWF0ZXJpYWw7XG4gICAgICAgICAgICBtbS5zdWJNYXRlcmlhbHMgPSBtbS5zdWJNYXRlcmlhbHMubWFwKChzdWIpID0+IHtcbiAgICAgICAgICAgICAgaWYgKHN1YiA9PT0gbWF0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbm9uaWNhbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gc3ViO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbWF0LmRpc3Bvc2UodHJ1ZSwgdHJ1ZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnN0YW50aWF0ZU9iamVjdHMobWV0YWRhdGE6IFpvbmVNZXRhZGF0YSkge1xuICAgIGlmICghdGhpcy56b25lT2JqZWN0cykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlc10gb2YgT2JqZWN0LmVudHJpZXMobWV0YWRhdGEub2JqZWN0cykpIHtcbiAgICAgIHRoaXMuem9uZU9iamVjdHMuYWRkVGhpbkluc3RhbmNlcyhrZXksIHRoaXMucGFyZW50LnNjZW5lISwgdmFsdWVzKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGluc3RhbnRpYXRlUHJvbW90ZWRPYmplY3RzKFxuICAgIG1ldGFkYXRhOiBab25lTWV0YWRhdGEsXG4gICAgZ2VuZXJhdGlvbjogbnVtYmVyLFxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuem9uZU9iamVjdHMgfHwgIXRoaXMucGFyZW50LnNjZW5lKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuc2hhZG9Xb3JsZE9iamVjdHMgPSBhd2FpdCBTaGFkb1dvcmxkT2JqZWN0TGF5ZXIubG9hZChcbiAgICAgICAgdGhpcy56b25lTmFtZSxcbiAgICAgICAgdGhpcy56b25lT2JqZWN0cyxcbiAgICAgICAgdGhpcy5wYXJlbnQuc2NlbmUsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbWm9uZU1hbmFnZXJdIFByb21vdGVkIHdvcmxkIGJvb3RzdHJhcCBmYWlsZWQgZm9yICR7dGhpcy56b25lTmFtZX07IGAgK1xuICAgICAgICAgIFwidXNpbmcgbGVnYWN5IG1ldGFkYXRhXCIsXG4gICAgICAgIGVycm9yLFxuICAgICAgKTtcbiAgICAgIHRoaXMuc2hhZG9Xb3JsZE9iamVjdHMgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5sb2FkR2VuZXJhdGlvbikgcmV0dXJuO1xuICAgIGlmICh0aGlzLnNoYWRvV29ybGRPYmplY3RzKSB7XG4gICAgICBpZiAodGhpcy5DdXJyZW50Wm9uZT8uem9uZVBvaW50cykge1xuICAgICAgICB0aGlzLnJlZ2lvbk1hbmFnZXIuaW5zdGFudGlhdGVTaGFkb1JlZ2lvbnMoXG4gICAgICAgICAgdGhpcy5wYXJlbnQuc2NlbmUsXG4gICAgICAgICAgdGhpcy5zaGFkb1dvcmxkT2JqZWN0cy53b3JsZCxcbiAgICAgICAgICB0aGlzLkN1cnJlbnRab25lLnpvbmVQb2ludHMsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0aGlzLkN1cnJlbnRab25lPy56b25lUG9pbnRzKSB7XG4gICAgICAgIHRoaXMucmVnaW9uTWFuYWdlci5pbnN0YW50aWF0ZVJlZ2lvbnMoXG4gICAgICAgICAgdGhpcy5wYXJlbnQuc2NlbmUsXG4gICAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgICAgdGhpcy5DdXJyZW50Wm9uZS56b25lUG9pbnRzLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5pbnN0YW50aWF0ZU9iamVjdHMobWV0YWRhdGEpO1xuICAgICAgY29uc29sZS5pbmZvKFxuICAgICAgICBgW1pvbmVNYW5hZ2VyXSBObyBwcm9tb3RlZCB3b3JsZCBwYWNrYWdlIGZvciAke3RoaXMuem9uZU5hbWV9OyBgICtcbiAgICAgICAgICBcInVzaW5nIGxlZ2FjeSBvYmplY3QgbWV0YWRhdGFcIixcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHRpY2soKSB7XG4gICAgaWYgKCF0aGlzLnpvbmVDb250YWluZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZGVsdGEgPSB0aGlzLnBhcmVudC5zY2VuZT8uZ2V0RW5naW5lKCkuZ2V0RGVsdGFUaW1lKCkgPz8gMDtcbiAgICB0aGlzLndvcmxkVGlja0VsYXBzZWRNcyArPSBkZWx0YTtcbiAgICBpZiAodGhpcy53b3JsZFRpY2tFbGFwc2VkTXMgPj0gMTAwMCkge1xuICAgICAgdGhpcy53b3JsZFRpY2tFbGFwc2VkTXMgJT0gMTAwMDtcbiAgICAgIHRoaXMuc2t5TWFuYWdlci53b3JsZFRpY2s/LigpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGFuaW1hdGlvbiBvZiB0aGlzLmFuaW1hdGVkVGV4dHVyZXMpIHtcbiAgICAgIGlmIChhbmltYXRpb24ubWVzaC5pc0Rpc3Bvc2VkKCkpIGNvbnRpbnVlO1xuICAgICAgYW5pbWF0aW9uLmVsYXBzZWRNcyArPSBkZWx0YTtcbiAgICAgIGlmIChhbmltYXRpb24uZWxhcHNlZE1zIDwgYW5pbWF0aW9uLmRlbGF5TXMpIGNvbnRpbnVlO1xuICAgICAgYW5pbWF0aW9uLmVsYXBzZWRNcyAlPSBhbmltYXRpb24uZGVsYXlNcztcbiAgICAgIGFuaW1hdGlvbi5mcmFtZSA9IChhbmltYXRpb24uZnJhbWUgKyAxKSAlIGFuaW1hdGlvbi5mcmFtZXMubGVuZ3RoO1xuICAgICAgc3dhcE1hdGVyaWFsVGV4dHVyZShcbiAgICAgICAgYW5pbWF0aW9uLm1lc2gubWF0ZXJpYWwhLFxuICAgICAgICBhbmltYXRpb24uZnJhbWVzW2FuaW1hdGlvbi5mcmFtZV0sXG4gICAgICAgIHRydWUsXG4gICAgICApO1xuICAgIH1cbiAgICB0aGlzLnNreU1hbmFnZXIudGljayhkZWx0YSk7XG4gICAgdGhpcy5zaGFkb1dvcmxkT2JqZWN0cz8udGljayhkZWx0YSk7XG4gICAgdGhpcy5lbnRpdHlQb29sPy5wcm9jZXNzKCk7XG4gICAgdGhpcy5saWdodE1hbmFnZXIudXBkYXRlTGlnaHRzKGRlbHRhKTtcbiAgfVxufVxuIl19