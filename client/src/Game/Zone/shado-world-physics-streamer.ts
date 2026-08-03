import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import {
  chunkKey,
  collisionResidencyKeys,
  ShadoCollisionFlags,
  type ShadoWorldCollisionChunk,
  type ShadoWorldCollisionData,
} from "@knervous/shado/world";

const ACTIVE_RADIUS = 1;
const RETAIN_RADIUS = 2;
const LOOKAHEAD_SECONDS = 0.75;

type ResidentCollisionChunk = {
  mesh: BJS.Mesh;
  body: BJS.PhysicsBody;
  shape: BJS.PhysicsShapeMesh;
};

/**
 * Owns the set of static Havok mesh bodies surrounding the local player.
 * Physics residency is deliberately player/velocity based and never consumes
 * camera PVS: nearby floors and walls must remain solid when occluded.
 */
export class ShadoWorldPhysicsStreamer {
  private readonly chunks = new Map<string, ShadoWorldCollisionChunk>();
  private readonly resident = new Map<string, ResidentCollisionChunk>();
  private readonly alwaysResident = new Set<string>();
  private lastCenterKey = "";

  constructor(
    private readonly collision: ShadoWorldCollisionData,
    private readonly scene: BJS.Scene,
    private readonly parent: BJS.TransformNode,
  ) {
    for (const chunk of collision.chunks) {
      const key = chunkKey(chunk.x, chunk.z);
      this.chunks.set(key, chunk);
      if (chunk.flags & ShadoCollisionFlags.AlwaysResident) this.alwaysResident.add(key);
    }
  }

  get residentChunkCount(): number {
    return this.resident.size;
  }

  get residentTriangleCount(): number {
    let count = 0;
    for (const key of this.resident.keys()) count += this.chunks.get(key)!.indices.length / 3;
    return count;
  }

  /** Synchronously ensures collision before player creation or teleportation. */
  ensureAt(position: BJS.Vector3, velocity: BJS.Vector3 | null = null): void {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    const predictedX = position.x + (velocity?.x ?? 0) * LOOKAHEAD_SECONDS;
    const predictedZ = position.z + (velocity?.z ?? 0) * LOOKAHEAD_SECONDS;
    const active = new Set([
      ...collisionResidencyKeys(
        [position.x, position.z],
        this.collision.chunkSize,
        ACTIVE_RADIUS,
      ),
      ...collisionResidencyKeys(
        [predictedX, predictedZ],
        this.collision.chunkSize,
        ACTIVE_RADIUS,
      ),
      ...this.alwaysResident,
    ]);
    const retain = new Set([
      ...collisionResidencyKeys(
        [position.x, position.z],
        this.collision.chunkSize,
        RETAIN_RADIUS,
      ),
      ...collisionResidencyKeys(
        [predictedX, predictedZ],
        this.collision.chunkSize,
        RETAIN_RADIUS,
      ),
      ...this.alwaysResident,
    ]);

    // Add before removing so crossing or teleporting cannot expose a one-frame
    // gap in the static world.
    for (const key of active) {
      const chunk = this.chunks.get(key);
      if (
        chunk &&
        !this.resident.has(key) &&
        chunk.flags & ShadoCollisionFlags.PlayerSolid
      ) {
        this.resident.set(key, this.createResidentChunk(chunk));
      }
    }
    for (const [key, resident] of this.resident) {
      if (!retain.has(key)) {
        this.disposeResidentChunk(resident);
        this.resident.delete(key);
      }
    }

    const centerKey = chunkKey(
      Math.floor(position.x / this.collision.chunkSize),
      Math.floor(position.z / this.collision.chunkSize),
    );
    if (centerKey !== this.lastCenterKey) {
      this.lastCenterKey = centerKey;
      console.debug(
        `[ShadoPhysics] region=${centerKey}, bodies=${this.residentChunkCount}, ` +
          `triangles=${this.residentTriangleCount}/${this.collision.triangleCount}`,
      );
    }
  }

  dispose(): void {
    for (const resident of this.resident.values()) this.disposeResidentChunk(resident);
    this.resident.clear();
  }

  private createResidentChunk(chunk: ShadoWorldCollisionChunk): ResidentCollisionChunk {
    const mesh = new BABYLON.Mesh(
      `ShadoWorldCollision:${chunk.x},${chunk.z}`,
      this.scene,
    );
    mesh.setParent(this.parent);
    mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, chunk.positions, false, 3);
    mesh.setIndices(chunk.indices, null, false);
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();

    const body = new BABYLON.PhysicsBody(
      mesh,
      BABYLON.PhysicsMotionType.STATIC,
      false,
      this.scene,
    );
    const shape = new BABYLON.PhysicsShapeMesh(mesh, this.scene);
    body.shape = shape;
    shape.material.friction = 1;
    shape.material.restitution = 0;
    body.setMassProperties({ mass: 0 });
    mesh.physicsBody = body;
    return { mesh, body, shape };
  }

  private disposeResidentChunk(resident: ResidentCollisionChunk): void {
    resident.body.dispose();
    resident.shape.dispose();
    resident.mesh.physicsBody = null;
    resident.mesh.dispose();
  }
}
