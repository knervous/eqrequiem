import godot from "godot";

export class OctreeNode {
  center: {x: number, y: number, z: number};
  halfSize: number;
  lights: godot.OmniLight3D[];
  children: OctreeNode[] | null;
  capacity: number;
  depth: number;
  maxDepth: number;
  
  constructor(center: {x: number, y: number, z: number}, halfSize: number, capacity = 8, depth = 0, maxDepth = 5) {
    this.center = center;
    this.halfSize = halfSize;
    this.lights = [];
    this.children = null;
    this.capacity = capacity;
    this.depth = depth;
    this.maxDepth = maxDepth;
  }

  // Check if a point is within this node's axis-aligned bounding box.
  contains(point: godot.Vector3): boolean {
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    const hs = this.halfSize;
    const minX = cx - hs, minY = cy - hs, minZ = cz - hs;
    const maxX = cx + hs, maxY = cy + hs, maxZ = cz + hs;
    return (
      point.x >= minX && point.x <= maxX &&
      point.y >= minY && point.y <= maxY &&
      point.z >= minZ && point.z <= maxZ
    );
  }

  // Check if a sphere (with a center and radius) intersects this node's bounding box.
  intersectsSphere(sphereCenter: godot.Vector3, radius: number): boolean {
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    const hs = this.halfSize;
    const minX = cx - hs, minY = cy - hs, minZ = cz - hs;
    const maxX = cx + hs, maxY = cy + hs, maxZ = cz + hs;
    let dmin = 0;
    if (sphereCenter.x < minX) dmin += (sphereCenter.x - minX) ** 2;
    else if (sphereCenter.x > maxX) dmin += (sphereCenter.x - maxX) ** 2;
    if (sphereCenter.y < minY) dmin += (sphereCenter.y - minY) ** 2;
    else if (sphereCenter.y > maxY) dmin += (sphereCenter.y - maxY) ** 2;
    if (sphereCenter.z < minZ) dmin += (sphereCenter.z - minZ) ** 2;
    else if (sphereCenter.z > maxZ) dmin += (sphereCenter.z - maxZ) ** 2;
    return dmin <= radius * radius;
  }

  // Subdivide this node into 8 children.
  subdivide() {
    this.children = [];
    const newHalf = this.halfSize / 2;
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    // Compute each child's center using arithmetic on the parent center.
    this.children.push(new OctreeNode({ x: cx - newHalf, y: cy - newHalf, z: cz - newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx + newHalf, y: cy - newHalf, z: cz - newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx - newHalf, y: cy + newHalf, z: cz - newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx + newHalf, y: cy + newHalf, z: cz - newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx - newHalf, y: cy - newHalf, z: cz + newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx + newHalf, y: cy - newHalf, z: cz + newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx - newHalf, y: cy + newHalf, z: cz + newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
    this.children.push(new OctreeNode({ x: cx + newHalf, y: cy + newHalf, z: cz + newHalf }, newHalf, this.capacity, this.depth + 1, this.maxDepth));
  }

  // Insert a light into the octree. Returns true if insertion was successful.
  insert(light: godot.OmniLight3D): boolean {
    const pos = light.global_position;
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
  querySphere(sphereCenter: godot.Vector3, radius: number, found: godot.OmniLight3D[] = []): godot.OmniLight3D[] {
    if (!this.intersectsSphere(sphereCenter, radius)) {
      return found;
    }
    for (const light of this.lights) {
      const lightPos = light.lightData;
      // Compute squared distance without allocating a new Vector3.
      const dx = lightPos.x - sphereCenter.x;
      const dy = lightPos.y - sphereCenter.y;
      const dz = lightPos.z - sphereCenter.z;
      if ((dx * dx + dy * dy + dz * dz) <= (radius * radius)) {
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
