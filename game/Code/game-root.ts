import { Node3D } from "godot";

export default class GameRoot extends Node3D {
  _ready(): void {
    console.log('Preload complete');
    if (window.onLoadGame) {
      window.onLoadGame(this);
    }
  }
}