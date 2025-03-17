import { Camera3D, Color, Node3D, OmniLight3D, Vector3 } from "godot";
import { OctreeNode } from "./light-octree";

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
  private cameraLight: OmniLight3D | null = null;
  private updateInterval = 0.2;
  private timeSinceLastUpdate = 0.0;
  private maxLightDistance = 500.0;
  private maxActiveLights = 10;
  private octree: OctreeNode | null = null;

  public constructor(parent: Node3D, camera: Camera3D, lights: LightData[]) {
    this.parent = parent;
    this.camera = camera;
    this.createCameraLight();
    this.createLights(lights);
    // Build the octree only once since lights are static.
    this.octree = this.buildOctree();
  }

  private createCameraLight() {
    this.cameraLight = new OmniLight3D();
    this.camera.add_child(this.cameraLight);
    this.cameraLight.position = new Vector3(0, 0, 0);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 2.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 150.0;
    this.cameraLight.layers = 1 << 0;
    this.cameraLight.shadow_enabled = true;
  }

  private createLights(lightData: LightData[]) {
    for (const light of lightData) {
      const lightNode = new OmniLight3D();
      this.parent.add_child(lightNode);
      lightNode.position = new Vector3(-light.x, light.y, light.z);
      const r = light.r > 1 ? light.r / 255 : light.r;
      const g = light.g > 1 ? light.g / 255 : light.g;
      const b = light.b > 1 ? light.b / 255 : light.b;
      lightNode.light_color = new Color(r, g, b, 1.0);
      lightNode.light_energy = 10.0;
      lightNode.light_specular = 0;
      lightNode.omni_range = 150.0;
      lightNode.distance_fade_enabled = true;
      lightNode.distance_fade_begin = 500.0;
      lightNode.distance_fade_length = 250.0;
      lightNode.distance_fade_shadow = 50;
      lightNode.layers = 1 << 0;
      lightNode.visible = false;
      this.lights.push(lightNode);
    }
  }

  // Build an octree covering all light positions.
  private buildOctree(): OctreeNode {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const light of this.lights) {
      const pos = light.global_transform.origin;
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
      max.z - center.z
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
    const cameraPos = this.camera.global_transform.origin;

    // Query the octree for nearby lights.
    const nearbyLights = this.octree.querySphere(
      cameraPos,
      this.maxLightDistance
    );
    const lightsWithDistance = nearbyLights.map((light) => {
      const distance = cameraPos.distance_to(light.global_transform.origin);
      return { light, distance };
    });
    lightsWithDistance.sort((a, b) => a.distance - b.distance);

    // Identify lights that should be active.
    const activeLights = new Set<OmniLight3D>();
    for (let i = 0; i < lightsWithDistance.length; i++) {
      const { light, distance } = lightsWithDistance[i];
      if (i < this.maxActiveLights && distance <= this.maxLightDistance) {
        activeLights.add(light);
      }
    }

    // Fade settings.
    const fullEnergy = 10.0;
    const fadeSpeed = 5.0; // Adjust this value to control fade speeSd.

    for (const light of this.lights) {
      if (activeLights.has(light)) {
        // For lights in range, force them visible and fade toward full energy.
        light.visible = true;
        light.light_energy = lerp(
          light.light_energy,
          fullEnergy,
          fadeSpeed * delta
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
