import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";

import type { ZoneMetadata } from "@game/Zone/zone-types";
import { RequestClientZoneChange, ZoneChangeType, type ZonePoint } from "@game/Net/internal/api/capnp/zone";
import Player from "@game/Player/player";
import { capnpToPlainObject } from "@game/Constants/util";
import type GameManager from "@game/Manager/game-manager";


interface AABBNode {
  min: BJS.Vector3;
  max: BJS.Vector3;
  index?: number;      // leaf
  left?: AABBNode;
  right?: AABBNode;
}

export class RegionManager {
  private aabbTree?: AABBNode;
  private inside = new Set<number>();
  private zonePoints: Record<number, ZonePoint> = {};
  private regions: ZoneMetadata["regions"] = [];
  private scene?: BJS.Scene;

  constructor(private gameManager: GameManager) {

  }
  public instantiateRegions(
    scene: BJS.Scene,
    metadata: ZoneMetadata,
    _zonePoints: ZonePoint[] = [],
  ): void {
    const { regions } = metadata;
    if (!regions?.length) {
      console.warn("No regions to instantiate.");
      return;
    }
    this.regions = regions;
    for (const z of _zonePoints) {
      this.zonePoints[z.number] = capnpToPlainObject(z);
    }
      

    // Build raw AABB nodes
    const nodes: AABBNode[] = regions.map((r, i) => ({
      min: new BABYLON.Vector3(-r.maxVertex[0], r.minVertex[1], r.minVertex[2]),
      max: new BABYLON.Vector3(-r.minVertex[0], r.maxVertex[1], r.maxVertex[2]),
      index: i,
    }));

    this.aabbTree = this.buildTree(nodes);
    this.inside.clear();

    // Hook into player-movement loop
    scene.registerBeforeRender(this.update.bind(this));

    this.scene = scene;
  }

  private update(): void {

    const pos = Player.instance?.getPlayerPosition();
    if (!pos) { return; }
    const regions = this.regions;
    const nowInside = new Set<number>();
    this.queryTree(this.aabbTree, pos, nowInside);

    // Entered
    nowInside.forEach((i) => {
      if (!this.inside.has(i)) {
        console.log(`[RegionManager] Entered region ${i}:`, regions[i]);
        const region = regions[i];
        switch (region?.regionType) {
          case 0:
            break;
          case 1:
            break;
          case 2:
            break;
          case 3:
            break;
          case 4: // zoneline
          {
            const requestZone = {
              type: ZoneChangeType.FROM_ZONE,
            } as RequestClientZoneChange;
            if (region.zoneLineInfo?.type === 0) { // reference
              const zonePoint = this.zonePoints[region.zoneLineInfo.index!];
              if (!zonePoint) {
                console.warn(`[RegionManager] No zone point found for index ${region.zoneLineInfo.index}`);
                return;
              }
              requestZone.x = zonePoint.x;
              requestZone.y = zonePoint.y;
              requestZone.z = zonePoint.z;
              requestZone.zoneId = zonePoint.zoneId;
              requestZone.instanceId = zonePoint.zoneInstance;
              console.log('[RegionManager] Original Zonepoint', zonePoint);

            } else if (region.zoneLineInfo) { // Absolute
              requestZone.x = -region.zoneLineInfo.x!;
              requestZone.y = region.zoneLineInfo.z!;
              requestZone.z = region.zoneLineInfo.y!;
              requestZone.zoneId = region.zoneLineInfo.zoneIndex!;
              console.log('[RegionManager] Absolute Zonepoint', region.zoneLineInfo);
            } else {
              console.warn(`[RegionManager] No zone line info for region ${i}`);
              return;
            }
            const magicLoc = 999999;
            const magicRot = 999;
            console.log(`[RegionManager] Requesting zone change to:`, requestZone);
            console.log(`[RegionManager] Player position:`, Player.instance!.getPlayerPosition());
            if (Math.abs(requestZone.x) === magicLoc) {
              requestZone.x = Player.instance!.getPlayerPosition()!.x;
            }
            if (Math.abs(requestZone.y) === magicLoc) {
              requestZone.y = Player.instance!.getPlayerPosition()!.y;
            }
            if (Math.abs(requestZone.z) === magicLoc) {
              requestZone.z = Player.instance!.getPlayerPosition()!.z;
            }
            if (requestZone.x === magicRot) {
              requestZone.x = Player.instance!.getPlayerRotation()!.y;
            }
            const tempX = requestZone.x;
            const tempY = requestZone.y;
            const tempZ = requestZone.z;
            requestZone.x = tempX;
            requestZone.y = tempY;
            requestZone.z = tempZ;
            console.log(`[RegionManager] Requesting zone change AFTER MAGIC to:`, requestZone);
            if (requestZone.zoneId === this.gameManager.ZoneManager?.CurrentZone?.zoneIdNumber) {
              this.gameManager.player?.setPosition(requestZone.x, requestZone.y, requestZone.z);
            } else {
              this.gameManager.requestZone(requestZone);
              this.dispose();
            }
         
            break; 
          }
        }
      }
    });

    // Exited
    this.inside.forEach((i) => {
      if (!nowInside.has(i)) {
        console.log(`[RegionManager] Exited region ${i}:`, regions[i]);
      }
    });

    this.inside = nowInside;

  }
  private buildTree(nodes: AABBNode[]): AABBNode | undefined {
    if (!nodes.length) return;
    if (nodes.length === 1) return nodes[0];

    // overall bounds
    let min = nodes[0].min.clone(), max = nodes[0].max.clone();
    for (const n of nodes.slice(1)) {
      min = BABYLON.Vector3.Minimize(min, n.min);
      max = BABYLON.Vector3.Maximize(max, n.max);
    }

    // split axis
    const size = max.subtract(min);
    const axis = size.x > size.y
      ? (size.x > size.z ? 'x' : 'z')
      : (size.y > size.z ? 'y' : 'z') as keyof BJS.Vector3;

    // sort & split
    nodes.sort((a,b) => (
      (a.min[axis]+a.max[axis]) - (b.min[axis]+b.max[axis])
    ));
    const mid = nodes.length >> 1;
    return {
      min, max,
      left: this.buildTree(nodes.slice(0, mid)),
      right: this.buildTree(nodes.slice(mid)),
    };
  }

  private queryTree(
    node: AABBNode|undefined,
    p: BJS.Vector3,
    out: Set<number>,
  ): void {
    if (!node) return;
    if (
      p.x < node.min.x || p.x > node.max.x ||
      p.y < node.min.y || p.y > node.max.y ||
      p.z < node.min.z || p.z > node.max.z
    ) return;

    if (node.index !== undefined) {
      out.add(node.index);
    } else {
      this.queryTree(node.left,  p, out);
      this.queryTree(node.right, p, out);
    }
  }

  public dispose(): void {
    this.aabbTree = undefined;
    this.regions = [];
    this.zonePoints = {};
    this.scene?.unregisterBeforeRender(this.update.bind(this));
    this.inside.clear();
  }
}
