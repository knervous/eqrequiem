import { OmniLight3D, Vector3 } from "godot";

export class OctreeNode {
  center: Vector3;
  halfSize: number;
  lights: OmniLight3D[];
  children: OctreeNode[] | null;
  capacity: number;
  depth: number;
  maxDepth: number;
  
  constructor(center: Vector3, halfSize: number, capacity = 8, depth = 0, maxDepth = 5) {
    this.center = center;
    this.halfSize = halfSize;
    this.lights = [];
    this.children = null;
    this.capacity = capacity;
    this.depth = depth;
    this.maxDepth = maxDepth;
  }

  // Check if a point is within this node's axis-aligned bounding box.
  contains(point: Vector3): boolean {
    const min = this.center.subtract(new Vector3(this.halfSize, this.halfSize, this.halfSize));
    const max = this.center.add(new Vector3(this.halfSize, this.halfSize, this.halfSize));
    return (
      point.x >= min.x && point.x <= max.x &&
      point.y >= min.y && point.y <= max.y &&
      point.z >= min.z && point.z <= max.z
    );
  }

  // Check if a sphere (with a center and radius) intersects this node's bounding box.
  intersectsSphere(sphereCenter: Vector3, radius: number): boolean {
    const min = this.center.subtract(new Vector3(this.halfSize, this.halfSize, this.halfSize));
    const max = this.center.add(new Vector3(this.halfSize, this.halfSize, this.halfSize));
    let dmin = 0;
    if (sphereCenter.x < min.x) dmin += (sphereCenter.x - min.x) ** 2;
    else if (sphereCenter.x > max.x) dmin += (sphereCenter.x - max.x) ** 2;
    if (sphereCenter.y < min.y) dmin += (sphereCenter.y - min.y) ** 2;
    else if (sphereCenter.y > max.y) dmin += (sphereCenter.y - max.y) ** 2;
    if (sphereCenter.z < min.z) dmin += (sphereCenter.z - min.z) ** 2;
    else if (sphereCenter.z > max.z) dmin += (sphereCenter.z - max.z) ** 2;
    return dmin <= radius ** 2;
  }

  // Subdivide this node into 8 children.
  subdivide() {
    this.children = [];
    const newHalf = this.halfSize / 2;
    const offsets = [
      new Vector3(-newHalf, -newHalf, -newHalf),
      new Vector3(newHalf, -newHalf, -newHalf),
      new Vector3(-newHalf, newHalf, -newHalf),
      new Vector3(newHalf, newHalf, -newHalf),
      new Vector3(-newHalf, -newHalf, newHalf),
      new Vector3(newHalf, -newHalf, newHalf),
      new Vector3(-newHalf, newHalf, newHalf),
      new Vector3(newHalf, newHalf, newHalf),
    ];
    for (const offset of offsets) {
      const childCenter = this.center.add(offset);
      const child = new OctreeNode(childCenter, newHalf, this.capacity, this.depth + 1, this.maxDepth);
      this.children.push(child);
    }
  }

  // Insert a light into the octree. Returns true if insertion was successful.
  insert(light: OmniLight3D): boolean {
    const pos = light.global_transform.origin;
    if (!this.contains(pos)) {
      return false;
    }
    if (this.lights.length < this.capacity || this.depth >= this.maxDepth) {
      this.lights.push(light);
      return true;
    }
    if (!this.children) {
      this.subdivide();
    }
    for (const child of this.children!) {
      if (child.insert(light)) {
        return true;
      }
    }
    // Fallback: if insertion into children fails, store it here.
    this.lights.push(light);
    return true;
  }

  // Recursively query lights that are within a sphere (defined by sphereCenter and radius).
  querySphere(sphereCenter: Vector3, radius: number, found: OmniLight3D[] = []): OmniLight3D[] {
    if (!this.intersectsSphere(sphereCenter, radius)) {
      return found;
    }
    for (const light of this.lights) {
      const lightPos = light.global_transform.origin;
      if (lightPos.distance_to(sphereCenter) <= radius) {
        found.push(light);
      }
    }
    if (this.children) {
      for (const child of this.children) {
        child.querySphere(sphereCenter, radius, found);
      }
    }
    return found;
  }
}
