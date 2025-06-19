import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";

import type { ZoneMetadata } from "@game/Zone/zone-types";
import type { ZonePoint } from "@game/Net/internal/api/capnp/zone";
import Player from "@game/Player/player";
import { capnpToPlainObject } from "@game/Constants/util";

type RegionCallback = (regionIndex: number, region: ZoneMetadata['regions'][0]) => void;

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
    for (const z of _zonePoints) {
      this.zonePoints[z.number] = capnpToPlainObject(z);
    }
      
    console.log(`[RegionManager] Instantiating ${regions.length} regions...`, this.zonePoints);

    // Build raw AABB nodes
    const nodes: AABBNode[] = regions.map((r, i) => ({
      min: new BABYLON.Vector3(-r.maxVertex[0], r.minVertex[1], r.minVertex[2]),
      max: new BABYLON.Vector3(-r.minVertex[0], r.maxVertex[1], r.maxVertex[2]),
      index: i,
    }));

    this.aabbTree = this.buildTree(nodes);
    this.inside.clear();

    // Hook into player-movement loop
    scene.registerBeforeRender(() => {
      const pos = Player.instance?.getPlayerPosition();
      if (!pos) { return; }

      const nowInside = new Set<number>();
      this.queryTree(this.aabbTree, pos, nowInside);

      // Entered
      nowInside.forEach((i) => {
        if (!this.inside.has(i)) {
          console.log(`[RegionManager] Entered region ${i}:`, regions[i]);
          const region = regions[i];
          switch (region.regionType) {
            case 0:
              break;
            case 1:
              break;
            case 2:
              break;
            case 3:
              break;
            case 4: // zoneline
              
              break; 
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
    });
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
    this.inside.clear();
  }
}
