import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import type GameManager from "@game/Manager/game-manager";
import { RegionManager } from "@game/Regions/region-manager";
import { LightManager } from "@game/Lights/light-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import { Spawns } from "@game/Net/internal/api/capnp/common";
import EntityPool from "./entity-pool";
import ObjectCache from "@/Game/Model/object-cache";
import { ZoneMetadata } from "./zone-types";

export class ZoneManager {
  get RegionManager(): RegionManager {
    return this.regionManager;
  }

  get LightManager(): LightManager{
    return this.lightManager;
  }
  private lightManager: LightManager;

  get SkyManager(): DayNightSkyManager{
    return this.skyManager;
  }
  private skyManager: DayNightSkyManager;

  private regionManager: RegionManager;
  get ZoneContainer (): BJS.TransformNode | null {
    return this.zoneContainer;
  }
  private zoneContainer: BJS.TransformNode | null = null;
  private objectContainer: BJS.TransformNode | null = null;
  private lightContainer: BJS.TransformNode | null = null;

  get EntityPool(): EntityPool | null {
    return this.entityPool;
  }
  private entityPool: EntityPool | null = null;
  private zoneObjects: ObjectCache | null = null;
  private metadata: ZoneMetadata | null = null;
  private usePhysics: boolean = true;

  private disableWorldEnv: boolean = false;
  public zoneName = "qeynos2";
  public get CurrentZone() {
    return this.parent.CurrentZone;
  }

  get GameManager(): GameManager {
    return this.parent;
  }
  private parent: GameManager;

  constructor(parent: GameManager) {
    this.parent = parent;
    this.zoneContainer = null;
    this.regionManager = new RegionManager(this);
    this.lightManager = new LightManager();
    this.skyManager = new DayNightSkyManager(this);
  }

  dispose() {
    // Clean up resources if needed.
    if (this.zoneContainer) {
      this.zoneContainer.dispose();
      this.zoneContainer = null;
    }
    if (this.objectContainer) {
      this.objectContainer.dispose();
      this.objectContainer = null;
    }
    if (this.lightContainer) {
      this.lightContainer.dispose();
      this.lightContainer = null;
    }
    this.zoneObjects?.disposeAll();
    this.regionManager.dispose();
    this.lightManager.dispose();
    this.skyManager.dispose();
    this.parent.scene?.onBeforeRenderObservable.remove(this.tick.bind(this));
  }

  public async loadZone(zoneName: string, usePhysics: boolean, disableWorldEnv: boolean = false): Promise<void> {
    console.log('[ZoneManager] Loading zone:', zoneName);
    this.dispose();
    this.zoneName = zoneName;
    this.disableWorldEnv = disableWorldEnv;
    this.zoneContainer = new BABYLON.TransformNode('ZoneContainer', this.parent.scene);
    this.objectContainer = new BABYLON.TransformNode('ZoneObjectContainer', this.parent.scene);
    this.lightContainer = new BABYLON.TransformNode('LightContainer', this.parent.scene);
    this.usePhysics = usePhysics;

    if (this.zoneObjects) {
      this.zoneObjects.disposeAll();
    }
    this.zoneObjects = new ObjectCache(usePhysics, this.objectContainer);
    this.instantiateZone();
  }

  public async loadSpawns(spawns: Spawns) {
    console.log('Got spawns', spawns);
    if (!this.zoneContainer) {
      return;
    }
    
  }
  public async instantiateZone() {
    console.log('Inst zone');
    if (!this.zoneContainer) {
      return;
    }
    this.parent.scene?.onBeforeRenderObservable.add(this.tick.bind(this));
    this.parent.setLoading(true); 
    const bytes = await FileSystem.getFileBytes(`eqrequiem/zones`, `${this.zoneName}.glb`);
    const file = new File([bytes!], `${this.zoneName}.glb`, {
      type: "model/gltf-binary",
    });
    const result = await BABYLON.ImportMeshAsync(
      file, // Pass ArrayBuffer directly
      this.parent.scene!,
    );
    result.meshes.forEach((mesh) => {
      mesh.checkCollisions = true;
    });
    result.transformNodes[0].parent = this.zoneContainer;
    result.transformNodes[0].name = this.zoneName;
    
    console.log('res', result);
    this.skyManager.createSky("sky1", this.disableWorldEnv);
    this.parent.setLoading(false); 
    
    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones`, `${this.zoneName}.json`,
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str) as ZoneMetadata;
        this.metadata = metadata;
        console.log("Got metadata", metadata);
        console.log("Version: ", metadata.version);
        console.log('Current zone', this.CurrentZone);
        await this.instantiateObjects(metadata);
        this.lightManager.loadLights(this.lightContainer!, this.parent.scene!, metadata.lights);
        // this.regionManager.instantiateRegions(metadata.regions, this.CurrentZone?.zonePoints);
        // this.zoneObjects = new ZoneObjects(this.zoneContainer, metadata.objects, this.usePhysics);

        // this.zoneObjects.Load().catch((e) => {
        //   console.log("Failed to load zone objects", e);
        // });


      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    
  }

  private async instantiateObjects(metadata: ZoneMetadata) {
    if (!this.zoneObjects) {
      return;
    }
    for (const [key, values] of Object.entries(metadata.objects)) {
      this.zoneObjects.addThinInstances(key, this.parent.scene!, values);
    }
  }

  public tick() {
    if (!this.zoneContainer) {
      return;
    }
    const delta = this.parent.scene?.getEngine().getDeltaTime() ?? 0;
    this.skyManager.tick(delta);
    this.entityPool?.process(delta);
    this.lightManager.updateLights(delta);

  }
}