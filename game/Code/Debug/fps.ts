import { Engine, Label } from "godot";


export default class extends Label {
    _process(_delta: number): void {
        this.text = `FPS: ${Engine.get_frames_per_second()}`;
    }
}