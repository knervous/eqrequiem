import { Camera3D, Color, Node3D, OmniLight3D, Vector3 } from "godot";
import { OctreeNode } from "./light-octree";
import { Extensions } from "../Util/extensions";

export type LightData = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default class LightManager {
  private parent: Node3D;
  private lights: OmniLight3D[] = [];
  private camera: Camera3D;
  private updateInterval = 0.2;
  private timeSinceLastUpdate = 0.0;
  private maxLightDistance = 300.0;
  private maxActiveLights = 10;
  private octree: OctreeNode | null = null;

  public constructor(parent: Node3D, camera: Camera3D, lights: LightData[]) {
    this.parent = parent;
    this.camera = camera;
    this.createLights(lights);
    // Build the octree only once since lights are static.
    this.octree = this.buildOctree();
  }

  public dispose() {
    for (const light of this.lights) {
      light.queue_free();
    }
    this.lights = [];
  }


  private createLights(lightData: LightData[]) {
    let i = 0;
    for (const light of lightData) {
      const lightNode = new OmniLight3D();
      this.parent.add_child(lightNode);
      lightNode.position = new Vector3(-light.x, light.y, light.z);
      const r = light.r > 1 ? light.r / 255 : light.r;
      const g = light.g > 1 ? light.g / 255 : light.g;
      const b = light.b > 1 ? light.b / 255 : light.b;
      lightNode.light_color = new Color(r, g, b, 1.0);
      lightNode.light_energy = 5.0;
      lightNode.light_specular = 0;
      lightNode.omni_range = 50.0;
      lightNode.distance_fade_enabled = true;
      lightNode.distance_fade_begin = 20.0;
      lightNode.distance_fade_length = 50.0;
      lightNode.distance_fade_shadow = 20;
      lightNode.set_name("Light" + i++);
      lightNode.layers = 1 << 0;
      lightNode.visible = false;
      lightNode.lightData = {
        x: -light.x,
        y: light.y,
        z: light.z,
      };
      this.lights.push(lightNode);
    }
  }

  // Build an octree covering all light positions.
  private buildOctree(): OctreeNode {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const light of this.lights) {
      const pos = Extensions.GetPosition(light);
      min.x = Math.min(min.x, pos.x);
      min.y = Math.min(min.y, pos.y);
      min.z = Math.min(min.z, pos.z);
      max.x = Math.max(max.x, pos.x);
      max.y = Math.max(max.y, pos.y);
      max.z = Math.max(max.z, pos.z);
    }
    const center = min.add(max).multiplyScalar(0.5);
    const halfSize = Math.max(
      max.x - center.x,
      max.y - center.y,
      max.z - center.z,
    );
    const octree = new OctreeNode(center, halfSize);
    for (const light of this.lights) {
      octree.insert(light);
    }
    return octree;
  }

  public tick(delta: number) {
    if (!this.camera || !this.octree) return;

    this.timeSinceLastUpdate += delta;
    if (this.timeSinceLastUpdate < this.updateInterval) return;

    this.timeSinceLastUpdate = 0.0;
    const cameraPos = Extensions.GetPosition(this.camera);

    // Query the octree for nearby lights.
    const nearbyLights = this.octree.querySphere(
      cameraPos,
      this.maxLightDistance,
    );
    const lightsWithDistance = nearbyLights.map((light) => {
      const distance = Extensions.GetDistance(cameraPos, light.lightData);
      return { light, distance };
    });
    lightsWithDistance.sort((a, b) => a.distance - b.distance);

    const activeLights = new Set<OmniLight3D>();
    for (let i = 0; i < lightsWithDistance.length; i++) {
      const { light, distance } = lightsWithDistance[i];
      if (i < this.maxActiveLights && distance <= this.maxLightDistance) {
        activeLights.add(light);
      }
    }

    // Fade settings.
    const fullEnergy = 10.0;
    const fadeSpeed = 5.0;

    for (const light of this.lights) {
      if (activeLights.has(light)) {
        light.visible = true;
        light.light_energy = lerp(
          light.light_energy,
          fullEnergy,
          fadeSpeed * delta,
        );
      } else {
        light.light_energy = lerp(light.light_energy, 0, fadeSpeed * delta);
        if (light.light_energy < 1.5) {
          light.visible = false;
        }
      }
    }
  }
}
