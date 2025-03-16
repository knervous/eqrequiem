import { Button, Callable, Label, NodePath, Sprite3D } from "godot"
import ZoneManager from "../Zone/zone-manager";

export default class ZoneLoadButton extends Button {

    _ready(): void {
        this.connect('pressed', Callable.create(this, this._on_pressed));
    }
    _on_pressed() {
        console.log('Pressed');
        const root = this.get_tree().root;
        const label = <Label>root.get_node("Zone/DebugUI/ZoneEntry");
        if (label) {
            console.log('Had label', label.text);
            const zone = <ZoneManager>root.get_node("Zone");
            console.log('Got zone', zone);
            zone.loadZone(label.text);
        }
    }
}