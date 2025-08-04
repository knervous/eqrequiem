import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import Player from '@game/Player/player';

const MAX_LIGHTS = 8;

export type LightData = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};

type KDNode = {
  idx: number;
  point: BJS.Vector3;
  left: KDNode | null;
  right: KDNode | null;
  axis: 0|1|2;
};


function buildKDTree(indices: number[], lights: BJS.PointLight[], depth = 0): KDNode | null {
  if (!indices.length) {return null;}
  const axis = depth % 3 as 0|1|2;
  indices.sort((a, b) => lights[a].position[['x', 'y', 'z'][axis]] 
                        - lights[b].position[['x', 'y', 'z'][axis]]);
  const mid = Math.floor(indices.length / 2);
  const idx = indices[mid];
  return {
    idx,
    point: lights[idx].position.clone(),
    axis,
    left : buildKDTree(indices.slice(0, mid), lights, depth + 1),
    right: buildKDTree(indices.slice(mid + 1), lights, depth + 1),
  };
}

function kNearest(node: KDNode | null, target: BJS.Vector3, K: number, heap: { idx: number; distSq: number }[] = []): void {
  if (!node) {return;}
  const d = BABYLON.Vector3.DistanceSquared(target, node.point);
  if (heap.length < K) {
    heap.push({ idx: node.idx, distSq: d });
    if (heap.length === K) {heap.sort((a, b) => b.distSq - a.distSq);}
  } else if (d < heap[0]?.distSq) {
    heap[0] = { idx: node.idx, distSq: d };
    heap.sort((a, b) => b.distSq - a.distSq);
  }

  const axis = node.axis;
  const diff = target[['x', 'y', 'z'][axis]] - node.point[['x', 'y', 'z'][axis]];
  const first = diff < 0 ? node.left : node.right;
  const second = diff < 0 ? node.right : node.left;

  // traverse nearer side first
  kNearest(first, target, K, heap);
  // but if hypersphere crosses splitting plane, check the other side
  if (heap.length < K || diff * diff < heap[0]?.distSq) {
    kNearest(second, target, K, heap);
  }
}


export class LightManager {
  private kdRoot: KDNode | null = null;
  private prevSet = new Set<number>();
  private nextSet = new Set<number>();
  private zoneLights: BJS.PointLight[] = [];
  private debugGlowLayer: BJS.GlowLayer | null = null;
  private playerLight: BJS.PointLight | null = null;
  private previousLights: number[] = [];
  private lastPosition: BJS.Vector3 = new BABYLON.Vector3(-1, 0, 0);
  private accumTime: number = 0;
  private debug: boolean = false;
  private debugMat: BJS.StandardMaterial | null = null;

  dispose() {
    this.zoneLights.forEach((light) => {
      if (!light.isDisposed()) {
        light.dispose();
      }
    });
    if (this.debugGlowLayer) {
      this.debugGlowLayer.dispose();
      this.debugGlowLayer = null;
    }
    if (this.debugMat) {
      this.debugMat.dispose();
      this.debugMat = null;
    }
    this.zoneLights = [];
    this.playerLight?.dispose();
    this.previousLights = [];

  }

  async detectMaxLights(engine: BJS.Engine): Promise<number> {
    if (engine.webGLVersion > 0) {
      const gl = (engine as any)._gl as WebGL2RenderingContext;
      const maxUBOVec4 = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
      return Math.floor((maxUBOVec4 - 16) / 4); // e.g. 4 floats per light
    } 
    // WebGPU path
    const adapter = await navigator.gpu?.requestAdapter();
    const limits = adapter!.limits;
    return limits.maxUniformBuffersPerShaderStage - 3; // reserve 3 for camera/etc.
    
  }

  async loadLights(container: BJS.Node, scene: BJS.Scene, zoneLights: LightData[], zoneName: string) {
    this.dispose();
    if (!container || !scene) {
      console.warn('LightManager: Invalid container or scene provided.');
      return;
    }
    // console.log('Max Lights:', await this.detectMaxLights(scene.getEngine() as BJS.Engine));
    if (this.debug) {
      this.debugGlowLayer = new BABYLON.GlowLayer(`zoneGlow_${zoneName}`, scene, {
        mainTextureFixedSize: 512,
        mainTextureSamples  : 4,
      });
      this.debugMat = new BABYLON.StandardMaterial(`dbgMat_${zoneName}`, scene);
      this.debugMat.emissiveColor = new BABYLON.Color3(255, 2, 15); // full white
      this.debugMat.disableLighting = true; // full emissive
      this.debugMat.alpha = 1;
    }
    // semi-transparent

    // Allow up to MAX_LIGHTS influence per material
    scene.materials.forEach((m) => {
      if (m instanceof BABYLON.PBRMaterial) {
        m.maxSimultaneousLights = MAX_LIGHTS;
      } else if (m instanceof BABYLON.StandardMaterial) {
        m.maxSimultaneousLights = MAX_LIGHTS;
      }
    });

    // Create lights
    zoneLights.forEach((data, idx) => {
      const pos = new BABYLON.Vector3(data.x, data.y, data.z);
      const light = new BABYLON.PointLight(`zoneLight_${zoneName}_${idx}`, pos, scene);
      light.diffuse = new BABYLON.Color3(data.r, data.g, data.b);
      light.intensity = 110.5;
      light.radius = 75;
      light.range = 180;
      light.intensityMode = BABYLON.Light.INTENSITYMODE_LUMINOUSINTENSITY;
      light.falloffType = BABYLON.Light.FALLOFF_PHYSICAL;
      light.specular.set(0, 0, 0);
      light.setEnabled(false);
      light.parent = container;
      this.zoneLights.push(light);

      if (this.debug) {
        // — now create a tiny emissive sphere at the same position —
        const debugSphere = BABYLON.MeshBuilder.CreateSphere(
          `debug_${zoneName}_${idx}`, 
          { diameter: 2 }, 
          scene,
        );
        debugSphere.parent = container;
        debugSphere.position = pos.clone(); // same as light.position
        debugSphere.setEnabled(false);
        debugSphere.material = this.debugMat!;
        this.debugGlowLayer!.addIncludedOnlyMesh(debugSphere);
        (light as any).debugMesh = debugSphere;

      }
    });

    // build KD-tree for efficient nearest light queries
    const allIdx = this.zoneLights.map((_, i) => i);
    this.kdRoot = buildKDTree(allIdx, this.zoneLights);
  }

  updateLights(delta: number) {
    const playerPosition = Player.instance?.getPlayerPosition();
    if (!playerPosition) {
      return;
    }
    if (this.lastPosition.equals(playerPosition)) {
      return;
    }
    if (this.accumTime <= 100) {
      this.accumTime += delta;
      return;
    }
    const start = performance.now();
    this.accumTime = 0;

    const K = Math.min(MAX_LIGHTS - 3, this.zoneLights.length);
    const heap: {idx:number;distSq:number}[] = [];
    kNearest(this.kdRoot, playerPosition, K, heap);
    const nearest = heap.map((h) => h.idx);

    this.prevSet.clear();
    this.nextSet.clear();

    // 2) Rebuild them from the arrays
    for (const i of this.previousLights) {this.prevSet.add(i);}
    for (const i of nearest) {this.nextSet.add(i);}

    // disable everything that was on but isn’t next
    for (const oldIdx of this.prevSet) {
      if (!this.nextSet.has(oldIdx)) {
        const l = this.zoneLights[oldIdx];
        if (l.isEnabled()) {
          l.setEnabled(false);
          // (l as any).debugMesh?.setEnabled(false);
        }
      }
    }

    for (const idx of this.nextSet) {
      if (!this.prevSet.has(idx)) {
        const l = this.zoneLights[idx];
        if (!l.isEnabled()) {
          l.setEnabled(true);
          // (l as any).debugMesh?.setEnabled(true);
        }
      }
    }

    this.previousLights = nearest;
    this.lastPosition.copyFrom(playerPosition);
    const next = performance.now() - start;
    // console.log('[Performance] LightManager.updateLights, %c', 'green', next);
  }
}
