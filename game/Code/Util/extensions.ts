import { JSON as GJSON, GDictionary, Vector3, Node3D } from "godot";

type V3 = {
    x: number;
    y: number;
    z: number;
}

export class Extensions {
    static cachedPosition: Vector3 = new Vector3(0, 0, 0);
    static cachedPositionNode: Node3D | null;
    static Dispose() {
        Extensions.cachedPositionNode = null;
    }
    static GetPosition(node: Node3D): Vector3 {
        if (!Extensions.cachedPositionNode) {
            Extensions.cachedPositionNode = node.get_node('/root/Zone/GDBridge') as Node3D;
        }
        this.cachedPosition.x = Extensions.cachedPositionNode?.call('get_position_x', node);
        this.cachedPosition.y = Extensions.cachedPositionNode?.call('get_position_y', node);
        this.cachedPosition.z = Extensions.cachedPositionNode?.call('get_position_z', node);

        return this.cachedPosition;
    }

    static GetDistance(v1: V3, v2: V3): number {
        return Math.sqrt(
            (v1.x - v2.x) ** 2 +
            (v1.y - v2.y) ** 2 +
            (v1.z - v2.z) ** 2
        );
    }
}

GDictionary.prototype.toObject = function() {
    try {
        return JSON.parse(GJSON.stringify(this));
    } catch(e) {
        console.log('Error parsing Dictionary', e);
    }
}

Vector3.prototype.subtract = function(other: Vector3): Vector3 {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
}

Vector3.prototype.add = function(other: Vector3): Vector3 {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
}

Vector3.prototype.multiplyScalar = function(scalar: number): Vector3 {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
}

Vector3.prototype.set = function(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
}