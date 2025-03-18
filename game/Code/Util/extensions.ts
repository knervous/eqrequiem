import { JSON as GJSON, GDictionary, Vector3 } from "godot";


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