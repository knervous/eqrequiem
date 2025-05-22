import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";

export class Entity {
  public mesh: BJS.Mesh;
  public spawn: Spawn;
  constructor(spawn: Spawn, mesh: BJS.Mesh) {
    this.mesh = mesh;
    this.spawn = spawn;
    this.initialize();
  }

  private initialize() {
    
  }
}