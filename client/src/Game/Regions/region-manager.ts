import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { capnpToPlainObject } from '@game/Constants/util';
import { animateVignette, gaussianBlurTeleport } from '@game/Effects/effects';
import type GameManager from '@game/Manager/game-manager';
import { RequestClientZoneChange, ZoneChangeType, type ZonePoint } from '@game/Net/internal/api/capnp/zone';
import Player from '@game/Player/player';
import type { ZoneMetadata } from '@game/Zone/zone-types';


interface AABBNode {
  min: BJS.Vector3;
  max: BJS.Vector3;
  index?: number; // leaf
  left?: AABBNode;
  right?: AABBNode;
}

export class RegionManager {
  private aabbTree?: AABBNode;
  private inside = new Set<number>();
  private zonePoints: Record<number, ZonePoint> = {};
  private regions: ZoneMetadata['regions'] = [];
  private scene?: BJS.Scene;
  private teleportEffects: BJS.GPUParticleSystem[] = [];

  constructor(private gameManager: GameManager) {

  }

  private createTeleportEffect(region: ZoneMetadata['regions'][number], scene: BJS.Scene, index: number): BJS.GPUParticleSystem {
    return; 
    
    const { Vector3, GPUParticleSystem, Texture, Color4, BoxParticleEmitter } = BABYLON;
    // 1) Compute your AABB center & half‐size
    const min = new Vector3(region.minVertex[0], region.minVertex[1], region.minVertex[2]);
    const max = new Vector3(region.maxVertex[0], region.maxVertex[1], region.maxVertex[2]);
    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);

    const half = max.subtract(min).scale(0.5);
    const volume = size.x * size.y * size.z;
    const density = 50; // e.g. 50 particles per unit³ – tweak to taste
    const capacity = Math.min(10000, Math.max(1, Math.floor(Math.abs(Math.ceil(volume * density)) / 2000)));
    // 2) Make the GPU system & texture
    const ps = new GPUParticleSystem(`teleportPS_${index}`, { capacity }, scene);
    ps.particleTexture = new Texture('textures/flare.png', scene);

    // 3) Build a box emitter that only emits on the BOTTOM face
    const emitter = new BoxParticleEmitter();
    // flat along bottom: local‐space Y = –half.y
    emitter.minEmitBox = new Vector3(-half.x, -half.y, -half.z);
    emitter.maxEmitBox = new Vector3(half.x, -half.y, half.z);

    // give them a purely upward push, with a tiny spread if you like:
    emitter.direction1 = new Vector3(-0.05, 1, -0.05);
    emitter.direction2 = new Vector3(0.05, 1, 0.05);

    ps.particleEmitterType = emitter;
    // 4) Tune color, size, speed, lifetime
    ps.addColorGradient(
      0.0,
      new Color4(0.6, 0.8, 1.0, 0.6), // light-blue, alpha 0.6
    );

    // At death: same hue range but fully transparent
    ps.addColorGradient(
      1.0,
      new Color4(1.0, 0.84, 0.0, 0.0), // gold,      alpha 0.0
    );
    ps.minSize = 0.1;
    ps.maxSize = 0.3;
    ps.minLifeTime = 1.5;
    ps.maxLifeTime = 12.5;
    ps.emitRate = Math.floor(capacity / 10);
    ps.minEmitPower = 1.0; // strength of the upward velocity
    ps.maxEmitPower = 2.0;
    ps.updateSpeed = 0.02;

    // 5) Place the emitter in world space
    ps.emitter = center;

    // 6) Fire it up
    ps.start();
    return ps;
  }

  public instantiateRegions(
    scene: BJS.Scene,
    metadata: ZoneMetadata,
    _zonePoints: ZonePoint[] = [],
  ): void {
    const { regions } = metadata;
    if (!regions?.length) {
      console.warn('No regions to instantiate.');
      return;
    }
    this.regions = regions;
    for (const z of _zonePoints) {
      this.zonePoints[z.number] = capnpToPlainObject(z);
    }
      

    // Build raw AABB nodes
    const nodes: AABBNode[] = regions.map((r, i) => ({
      min  : new BABYLON.Vector3(r.maxVertex[0], r.minVertex[1], r.minVertex[2]),
      max  : new BABYLON.Vector3(r.minVertex[0], r.maxVertex[1], r.maxVertex[2]),
      index: i,
    }));

    this.aabbTree = this.buildTree(nodes);
    this.inside.clear();
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (region.center[0] === 0 && region.center[1] === 0 && region.center[2] === 0) {
        continue;
      }
      if (region.regionType === 4) {
        this.teleportEffects.push(
          this.createTeleportEffect(regions[i], scene, i),
        );
      }
    }
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
            console.log('[RegionManager] Requesting zone change to:', requestZone);
            console.log('[RegionManager] Player position:', Player.instance!.getPlayerPosition());
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
            console.log('[RegionManager] Requesting zone change AFTER MAGIC to:', requestZone);

            if (requestZone.zoneId === this.gameManager.ZoneManager?.CurrentZone?.zoneIdNumber) {
              animateVignette(
                this.gameManager.Camera,
              this.gameManager.scene!,
              );
              gaussianBlurTeleport(
                this.gameManager.Camera,
              this.gameManager.scene!,
              );
              this.gameManager.player?.setPosition(requestZone.x, requestZone.y, requestZone.z);
              
            } else {
              this.gameManager.requestZone(requestZone);

              this.dispose();
            }
         
            break; 
          }
          default:
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

  }
  private buildTree(nodes: AABBNode[]): AABBNode | undefined {
    if (!nodes.length) {return;}
    if (nodes.length === 1) {return nodes[0];}

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
    nodes.sort((a, b) => (
      // @ts-ignore
      (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]) 
    ));
    const mid = nodes.length >> 1;
    return {
      min, max,
      left : this.buildTree(nodes.slice(0, mid)),
      right: this.buildTree(nodes.slice(mid)),
    };
  }

  private queryTree(
    node: AABBNode|undefined,
    p: BJS.Vector3,
    out: Set<number>,
  ): void {
    if (!node) {return;}
    if (
      p.x < node.min.x || p.x > node.max.x ||
      p.y < node.min.y || p.y > node.max.y ||
      p.z < node.min.z || p.z > node.max.z
    ) {return;}

    if (node.index !== undefined) {
      out.add(node.index);
    } else {
      this.queryTree(node.left, p, out);
      this.queryTree(node.right, p, out);
    }
  }

  public dispose(): void {
    this.aabbTree = undefined;
    this.regions = [];
    this.zonePoints = {};
    for (const ps of this.teleportEffects) {
      ps.stop();
      ps.dispose();
    }
    this.teleportEffects = [];
    this.scene?.unregisterBeforeRender(this.update.bind(this));
    this.inside.clear();
  }
}
