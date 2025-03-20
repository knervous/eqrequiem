import { JSON as GJSON, GDictionary, Vector3, Node3D, Node } from "godot";

type V3 = {
    x: number;
    y: number;
    z: number;
}

export class Extensions {
    static cachedPosition: Vector3 = new Vector3(0, 0, 0);
    static cachedRotation: Vector3 = new Vector3(0, 0, 0);
    static cachedPositionNode: Node | null;
    static root: Node | null;

    static Dispose() {
        Extensions.cachedPositionNode = null;
    }

    static SetRoot(node: Node) {
        Extensions.root = node;
    }

    private static get positionNode() {
        if (!Extensions.cachedPositionNode) {
            Extensions.cachedPositionNode = Extensions.root?.get_node('/root/Zone/GDBridge') as Node;
        }
        return Extensions.cachedPositionNode;
    }

    static Eval(node: Node3D, code: string) {
        return Extensions.positionNode?.call('eval_plain', code, node);
    }

    static GetPosition(node: Node3D): Vector3 {
        this.cachedPosition.x = Extensions.positionNode.call('eval_plain', 'node.global_position.x', node);
        this.cachedPosition.y = Extensions.positionNode.call('eval_plain', 'node.global_position.y', node);
        this.cachedPosition.z = Extensions.positionNode.call('eval_plain', 'node.global_position.z', node);

        return this.cachedPosition;
    }

    static GetRotation(node: Node3D): Vector3 {
        this.cachedRotation.x = Extensions.positionNode.call('eval_plain', 'node.rotation.x', node);
        this.cachedRotation.y = Extensions.positionNode.call('eval_plain', 'node.rotation.y', node);
        this.cachedRotation.z = Extensions.positionNode.call('eval_plain', 'node.rotation.z', node);

        return this.cachedRotation;
    }

    static GetDistance(v1: V3, v2: V3): number {
        return Math.sqrt(
            (v1.x - v2.x) ** 2 +
            (v1.y - v2.y) ** 2 +
            (v1.z - v2.z) ** 2
        );
    }

    static GetBasisZ(node: Node3D): [number, number, number] {  
        const x = Extensions.positionNode.call('eval_plain', 'node.transform.basis.z.x', node);
        const y = Extensions.positionNode.call('eval_plain', 'node.transform.basis.z.y', node);
        const z = Extensions.positionNode.call('eval_plain', 'node.transform.basis.z.z', node);
        return [x,y,z]
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
}

// Node3D.prototype.doRotate = function(deg) {
//     this.rotate_y(deg);
// }