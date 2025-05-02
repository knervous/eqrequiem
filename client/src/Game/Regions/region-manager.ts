import { supportedZones } from "@game/Constants/supportedZones";
import Player from "@game/Player/player";
import type { ZoneManager } from "@game/Zone/zone-manager";
import {
  Area3D,
  BoxMesh,
  BoxShape3D,
  Callable,
  CollisionShape3D,
  Node3D,
  Vector3,
} from "godot";
import * as EQMessage from "@eqmessage";
import { WorldSocket } from "@ui/net/instances";
import { BaseMaterial3D } from "godot";
import { Color } from "godot";
import { StandardMaterial3D } from "godot";
import { MeshInstance3D } from "godot";
export class RegionManager {
  private zoneManager: ZoneManager;
  private regionAreas: Map<number, Area3D> = new Map();
  private activeRegions: Set<number> = new Set();
  private areaContainer: Node3D | null = null;
  private regions: any[] = [];
  private zonePoints: EQMessage.ZonePoint[] = [];
  constructor(zoneManager) {
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
  public instantiateRegions(regions: any[], zonePoints: EQMessage.ZonePoint[]) {
    console.log('Inst regions with regions and ZP', regions, zonePoints);
    this.regions = regions;
    this.zonePoints = zonePoints;
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

      position.x = -position.x;

      // Create Area3D for collision detection
      const area = new Area3D();
      const collisionShape = new CollisionShape3D();
      const boxShape = new BoxShape3D();
      boxShape.size = size;
      area.monitoring = true;

      collisionShape.shape = boxShape;
      area.add_child(collisionShape);
      area.position = position;

      this.areaContainer?.add_child(area);

      this.regionAreas.set(index, area);

      // Add debug visualization (optional)
      // if (true) {
      //   const meshInstance = new MeshInstance3D();
      //   const boxMesh = new BoxMesh();
      //   boxMesh.size = size;

      //   // Create a semi-transparent material
      //   const material = new StandardMaterial3D();
      //   material.albedo_color = new Color(0, 1, 0, 0.3); // Green, 30% opacity
      //   // Different colors for different region types (optional)
      //   switch (region.regionType) {
      //     case 1: // Water
      //       material.albedo_color = new Color(0, 0, 1, 0.3); // Blue
      //       break;
      //     case 4: // Zone line
      //       material.albedo_color = new Color(1, 0, 0, 0.3); // Red
      //       break;
      //     default:
      //       material.albedo_color = new Color(0, 1, 0, 0.3); // Default Green
      //       break;
      //   }
      //   material.transparency = BaseMaterial3D.Transparency.TRANSPARENCY_ALPHA;
      //   boxMesh.material = material;

      //   meshInstance.mesh = boxMesh;
      //   area.add_child(meshInstance);
      // }

      // Connect signals for intersection detection
      area.body_entered.connect(
        Callable.create(this.zoneManager.ZoneContainer!, (body) => this.onAreaEntered(index, body)),
      );
      area.body_exited.connect(
        Callable.create(this.zoneManager.ZoneContainer!, (body) => this.onAreaExited(index, body)),
      );
    });
  }

  private onAreaEntered(regionIndex: number, body: Node) {
    console.log('On area entered!', body.nodeName, body.name);
    const playerNode = Player.instance?.getNode() as unknown as Node;
    if (body === playerNode) {
      console.log('On area entered 123');
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
          case 4: { // Example: Zone line
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
                {
                  const refZone = this.zonePoints.find(
                    (zp) => zp.number === zone.index,
                  );
                  if (!refZone) {
                    console.error("Reference zone not found");
                    return;
                  }
                  newZone.x = refZone.x;
                  newZone.y = refZone.y;
                  newZone.z = refZone.z;
                  newZone.zoneIndex = refZone.zoneid;
                }

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
              const playerPosition = Player.instance?.getPlayerPosition();
              if (!playerPosition) {
                console.log("Player position not found");
                return;
              }
              if (newZone.x === magicNumber) {
                newZone.x = playerPosition.x;
              }
              if (newZone.y === magicNumber) {
                newZone.y = playerPosition.y;
              }
              if (newZone.z === magicNumber) {
                newZone.z = playerPosition.z;
              }

              if (
                newZone.zoneIndex === this.zoneManager.CurrentZone?.zoneIdNumber
              ) {
                console.log("Teleport within zone");
                return;
              }
              console.log("Teleport to zone", newZone);
              WorldSocket.sendMessage(
                EQMessage.OpCodes.OP_RequestClientZoneChange,
                EQMessage.RequestClientZoneChange,
                {
                  type: EQMessage.ZoneChangeType.FROM_ZONE,
                  zoneId: newZone.zoneIndex,
                  instanceId: 0,
                  x: newZone.y,
                  y: newZone.x,
                  z: newZone.z,
                },
              );
            }
            break;
          }
        }
      }
    }
  }

  private onAreaExited(regionIndex: number, body: Node) {
    console.log('On area exited!');
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
