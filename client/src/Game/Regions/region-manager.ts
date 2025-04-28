import { supportedZones } from "@game/Constants/supportedZones";
import Player from "@game/Player/player";
import type { ZoneManager } from "@game/Zone/zone-manager";
import {  Area3D, BoxShape3D, Callable, CollisionShape3D, Node3D, Vector3  } from "godot";

export class RegionManager {
  private zoneManager: ZoneManager;
  private regionAreas: Map<number, Area3D> = new Map();
  private activeRegions: Set<number> = new Set();
  private areaContainer: Node3D | null = null;
  private regions: any[] = [];

  constructor(zoneManager){
    this.zoneManager = zoneManager;
  }

  dispose() {
    this.regionAreas.forEach((area) => {
      area.queue_free();
    });
    this.areaContainer?.queue_free();
    this.regionAreas.clear();
    this.activeRegions.clear();
  }

  public instantiateRegions(regions: any[]) {
    this.regions = regions;
    this.areaContainer = new Node3D();
    this.areaContainer.set_name("AreaContainer");
    this.zoneManager.ZoneContainer?.add_child(this.areaContainer);
    regions.forEach((region, index) => {
      // Skip invalid regions
      if (
        region.minVertex[0] === 0 &&
          region.minVertex[1] === 0 &&
          region.minVertex[2] === 0 &&
          region.maxVertex[0] === 0 &&
          region.maxVertex[1] === 0 &&
          region.maxVertex[2] === 0
      ) {
        return;
      }
  
      // Calculate size and position
      const size = new Vector3(
        region.maxVertex[0] - region.minVertex[0],
        region.maxVertex[1] - region.minVertex[1],
        region.maxVertex[2] - region.minVertex[2],
      );
  
      const position = new Vector3(
        region.minVertex[0] + size.x / 2,
        region.minVertex[1] + size.y / 2,
        region.minVertex[2] + size.z / 2,
      );
      position.x *= -1;
  
      // Create Area3D for collision detection
      const area = new Area3D();
      const collisionShape = new CollisionShape3D();
      const boxShape = new BoxShape3D();
      boxShape.size = size;
  
      collisionShape.shape = boxShape;
      area.add_child(collisionShape);
      area.position = position;
  
      this.areaContainer?.add_child(area);
  
      this.regionAreas.set(index, area);
  
      // Connect signals for intersection detection
      area.body_entered.connect(
        Callable.create(area, (body) => this.onAreaEntered(index, body)),
      );
      area.body_exited.connect(
        Callable.create(area, (body) => this.onAreaExited(index, body)),
      );
    });
  }
  
  private onAreaEntered(regionIndex: number, body: Node) {
    const playerNode = Player.instance?.getNode() as unknown as Node;
    if (body === playerNode) {
      this.activeRegions.add(regionIndex);
      const area = this.regionAreas.get(regionIndex);
      if (area) {
        const regionType = this.regions[regionIndex]?.regionType;
        console.log(`Entered region ${regionIndex} of type ${regionType}`);
  
        // Handle different region types
        switch (regionType) {
          case 1: // Example: Water
            console.log("Player entered water zone");
            break;
          case 4: // Example: Zone line
            const zone = this.regions[regionIndex]?.zoneLineInfo;
            console.log("Zone", zone);
            const newZone = {
              x: -1,
              y: -1,
              z: -1,
              zoneIndex: -1,
            };
            switch (+zone.type) {
              // Reference
              case 0:
                const refZone = supportedZones[zone.index.toString()];
                newZone.x = refZone.target_y;
                newZone.y = refZone.target_x;
                newZone.z = refZone.target_z;
                newZone.zoneIndex = refZone.target_zone_id;
                break;
                // Absolute
              default:
                newZone.x = zone.x;
                newZone.y = zone.y;
                newZone.z = zone.z;
                newZone.zoneIndex = zone.zoneIndex;
                break;
            }
            if (newZone.zoneIndex > -1) {
              const magicNumber = 999999;
              if (newZone.x === magicNumber) {
                newZone.x = playerNode.position.x ?? 0;
              }
              if (newZone.y === magicNumber) {
                newZone.y = playerNode.position.y ?? 0;
              }
              if (newZone.z === magicNumber) {
                newZone.z = playerNode.position.z ?? 0;
              }
              // Teleport within zone
              // const newLoc = eqtoBabylonVector(newZone.y, newZone.x, newZone.z);
              // // newLoc.x *= -1;
              // if (newLoc.x === magicNumber) {
              //   newLoc.x = this.CameraController.camera.globalPosition.x;
              // }
              // if (newLoc.y === magicNumber) {
              //   newLoc.y = this.CameraController.camera.globalPosition.y;
              // }
              // if (newLoc.z === magicNumber) {
              //   newLoc.z = this.CameraController.camera.globalPosition.z;
              // }
  
              // if (newZone.zoneIndex === this.state.zoneInfo.zone) {
  
              // } else { // Zone to another zone
              const z = supportedZones[newZone.zoneIndex];
              // this.actions.setZoneInfo({ ...z, zone: newZone.zoneIndex });
              //this.zone(z.shortName, newLoc);
  
              this.zoneManager.loadZone(z.shortName).then(() => {
                this.zoneManager!.GameManager.instantiatePlayer(undefined, {
                  x: -newZone.x,
                  y: newZone.z,
                  z: newZone.y,
                });
              });
              return;
              // }
            }
            break;
            // Add more cases as needed
        }
      }
    }
  }
  
  private onAreaExited(regionIndex: number, body: Node) {
    const playerNode = Player.instance?.getNode() as unknown as Node;
    if (body === playerNode) {
      this.activeRegions.delete(regionIndex);
      const area = this.regionAreas.get(regionIndex);
      if (area) {
        const regionType = this.regions[regionIndex]?.regionType;
        console.log(`Exited region ${regionIndex} of type ${regionType}`);
      }
    }
  }
}