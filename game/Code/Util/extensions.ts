import { JSON as GJSON, GDictionary, Vector3 } from "godot";


GDictionary.prototype.toObject = function() {
    try {
        return JSON.parse(GJSON.stringify(this));
    } catch(e) {
        console.log('Error parsing Dictionary', e);
    }
}

Vector3.prototype.subtract = function(other: Vector3): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
}

Vector3.prototype.add = function(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
}

Vector3.prototype.multiplyScalar = function(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
}