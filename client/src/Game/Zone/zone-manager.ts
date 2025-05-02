import { FileSystem } from "@game/FileSystem/filesystem";
import { BaseGltfModel } from "@game/GLTF/base";
import type GameManager from "@game/Manager/game-manager";
import { RegionManager } from "@game/Regions/region-manager";
import { Node3D } from "godot";
import ZoneObjects from "./object-pool";
import LightManager from "@game/Lights/light-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import ZoneMesh from "./zone-geometry";


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
  get ZoneContainer (): Node3D | null {
    return this.zoneContainer;
  }
  private zoneContainer: Node3D | null = null;
  private zoneObjects: ZoneObjects | null = null;
  private metadata: any = {};
  private usePhysics: boolean = true;
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
    this.lightManager = new LightManager(this);
    this.skyManager = new DayNightSkyManager(this);
  }

  dispose() {
    // Clean up resources if needed.
    if (this.zoneContainer) {
      this.zoneContainer.queue_free();
      this.zoneContainer = null;
    }
    this.regionManager.dispose();
    this.lightManager.dispose();
    this.skyManager.dispose();
  }

  public async loadZone(zoneName: string, usePhysics: boolean): Promise<void> {
    this.dispose();
    this.zoneName = zoneName;
    this.zoneContainer = new Node3D();
    this.zoneContainer.set_name(zoneName);
    this.parent.add_child(this.zoneContainer);
    this.usePhysics = usePhysics;
    this.instantiateZone();
  }

  public async instantiateZone() {
    console.log('Inst zone');
    if (!this.zoneContainer) {
      return;
    }
    this.parent.setLoading(true);
    const zoneModel = new ZoneMesh("zones", this.zoneName, this.usePhysics);
    zoneModel.LoaderOptions.doCull = false;
    const rootNode = await zoneModel.instantiate();
    if (rootNode) {
      this.zoneContainer.add_child(rootNode);
      rootNode.set_physics_process(true);
    }
    console.log('Zone name', this.zoneName);
    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones`, `${this.zoneName}.json`,
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str);
        console.log("Got metadata", metadata);
        this.metadata = metadata;
        console.log("Version: ", metadata.version);
        console.log('Current zone', this.CurrentZone);
        this.regionManager.instantiateRegions(metadata.regions, this.CurrentZone?.zonePoints);
        this.zoneObjects = new ZoneObjects(this.zoneContainer, metadata.objects, this.usePhysics);
        this.zoneObjects.Load().catch((e) => {
          console.log("Failed to load zone objects", e);
        });

        this.lightManager.instantiateLights(metadata.lights);
        this.skyManager.createSky("sky1");

      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    //await this.instantiatePlayer("bam");
    this.parent.setLoading(false);
  }

  public tick(delta: number) {
    if (!this.zoneContainer) {
      return;
    }
    this.lightManager.tick(delta);
    this.skyManager.tick(delta);

  }
}