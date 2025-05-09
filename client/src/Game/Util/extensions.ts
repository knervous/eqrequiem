import { JSON as GJSON, GDictionary, Vector3, Node3D, Node, PackedStringArray, GArray, Color, PackedColorArray, Transform3D, Basis } from "godot";
type V3 = {
    x: number;
    y: number;
    z: number;
}

export class Extensions {
  static GetDistance(v1: V3, v2: V3): number {
    return Math.sqrt(
      (v1.x - v2.x) ** 2 +
            (v1.y - v2.y) ** 2 +
            (v1.z - v2.z) ** 2,
    );
  }

  static GetBasisZ(node: Node3D): [number, number, number] {  
    const { x,y,z } = node.transform.basis.z;
    return [x,y,z];
  }
}

Color.prototype.clone = function(): Color {
  return new Color(this.r, this.g, this.b, this.a);
};

PackedColorArray.prototype.toArray = GArray.prototype.toArray = function(): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < this.size(); i++) {
    colors.push(this.get(i));
  }
  return colors;
};

Color.prototype.scale = function(scale: number): Color {
  this.r *= scale;
  this.g *= scale;
  this.b *= scale;
  this.a *= scale;
  return this;
};


GArray.prototype[Symbol.iterator] = function*() {
  for (let i = 0; i < this.size(); i++) {
    yield this.get(i);
  }
};

GDictionary.prototype.toObject = function() {
  try {
    return JSON.parse(GJSON.stringify(this));
  } catch(e) {
    console.log('Error parsing Dictionary', e);
  }
};

Vector3.prototype.subtract = function(other: Vector3): Vector3 {
  this.x -= other.x;
  this.y -= other.y;
  this.z -= other.z;
  return this;
};

Vector3.prototype.add = function(other: Vector3): Vector3 {
  this.x += other.x;
  this.y += other.y;
  this.z += other.z;
  return this;
};

Vector3.prototype.addNoMutate = function(other: Vector3): Vector3 {
  return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
};

Vector3.prototype.multiplyScalar = function(scalar: number): Vector3 {
  this.x *= scalar;
  this.y *= scalar;
  this.z *= scalar;
  return this;
};

export function xform(transform: Transform3D | Basis, point: Vector3): Vector3 {
  // Handle both Transform3D and Basis
  const basis: Basis = transform instanceof Basis ? transform : transform.basis;
  const origin: Vector3 = transform instanceof Transform3D ? transform.origin : new Vector3(0, 0, 0);

  // Apply basis transformation
  const x = basis.x.dot(point);
  const y = basis.y.dot(point);
  const z = basis.z.dot(point);

  // Combine with translation
  return new Vector3(
    x + origin.x,
    y + origin.y,
    z + origin.z,
  );
}
Transform3D.prototype.xform = function (point: Vector3): Vector3 {
  return xform(this, point);
};

Basis.prototype.xform = function (point: Vector3): Vector3 {
  return xform(this, point);
};

Vector3.prototype.negated = function(): Vector3 {
  this.x = -this.x;
  this.y = -this.y;
  this.z = -this.z;
  return this;
};

Vector3.prototype.set = function(x: number, y: number, z: number): Vector3 {
  this.x = x;
  this.y = y;
  this.z = z;
  return this;
};

Vector3.prototype.normalized = function(): Vector3 {
  const length = this.length();
  if (this.x !== 0) {
    this.x /= length;
  }
  if (this.y !== 0) {
    this.y /= length;
  }
  if (this.z !== 0) {
    this.z /= length;
  }
  return this;
};

Vector3.prototype.cross = function(other: Vector3): Vector3 {
  const originalX = this.x;
  const originalY = this.y;
  const originalZ = this.z;
  
  this.x = (originalY * other.z) - (originalZ * other.y);
  this.y = (originalZ * other.x) - (originalX * other.z);
  this.z = (originalX * other.y) - (originalY * other.x);
  
  return this;
};

PackedStringArray.prototype.toArray = function(): string[] {
  return JSON.parse(GJSON.stringify(this));
};



Node.prototype.getNodesOfType = function<T>(
  type: Constructor<T>,
): T[] { 
  const nodes: T[] = [];
  for (const child of this.get_children()) {
    if (child instanceof type) {
      nodes.push(child);
    }
    nodes.push(...child.getNodesOfType(type));
  }
  return nodes;
};