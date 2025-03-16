import { JSON as GJSON, GDictionary } from "godot";


GDictionary.prototype.toObject = function() {
    try {
        return JSON.parse(GJSON.stringify(this));
    } catch(e) {
        console.log('Error parsing Dictionary', e);
    }
}