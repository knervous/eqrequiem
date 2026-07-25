import * as BABYLON from '@babylonjs/core';
import { fetchShadoBytes } from '@knervous/shado/preprocess/runtime';
import {
  ShadoVisibilityBits,
  type ShadoWorldAuthoringDocument,
  type ShadoWorldObjectPrototype,
  type ShadoWorldObjectStamp,
  type ShadoWorldVisibilityCoordinator,
  type ShadoWorldVisibilityFrame,
} from '@knervous/shado/world';

type PrototypeRenderGroup = {
  prototype: ShadoWorldObjectPrototype;
  container?: BABYLON.AssetContainer;
  meshes: BABYLON.Mesh[];
  loading?: Promise<void>;
  failed?: string;
  signature: string;
};

const CELL_POLICY =
  ShadoVisibilityBits.Pvs |
  ShadoVisibilityBits.Loaded |
  ShadoVisibilityBits.Phase |
  ShadoVisibilityBits.PortalReachable;

/** Thin-instance renderer used by the world editor and processed-world preview. */
export class WorldObjectRenderer {
  private document: ShadoWorldAuthoringDocument;
  private readonly groups = new Map<string, PrototypeRenderGroup>();
  private visible = true;
  private disposed = false;
  private readonly placeholderMaterial: BABYLON.StandardMaterial;
  private readonly pointerObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.PointerInfo>>;

  public constructor(
    private readonly scene: BABYLON.Scene,
    initial: ShadoWorldAuthoringDocument,
    private readonly options: {
      outsideWorldVisible?: boolean;
      /** Editor documents mutate independently from the compiled worker projection. */
      liveAuthoring?: boolean;
    } = {}
  ) {
    this.document = structuredClone(initial);
    this.placeholderMaterial = new BABYLON.StandardMaterial('world-object-placeholder', scene);
    this.placeholderMaterial.diffuseColor = new BABYLON.Color3(0.18, 0.55, 0.28);
    this.placeholderMaterial.emissiveColor = new BABYLON.Color3(0.04, 0.16, 0.08);
    this.placeholderMaterial.alpha = 0.42;
    this.placeholderMaterial.wireframe = true;
    this.pointerObserver = scene.onPointerObservable.add(info => {
      if (info.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      const metadata = info.pickInfo?.pickedMesh?.metadata as
        { shadoObjectStampIds?: string[] } | undefined;
      const thinIndex = info.pickInfo?.thinInstanceIndex;
      const id = thinIndex == null ? undefined : metadata?.shadoObjectStampIds?.[thinIndex];
      if (id) {
        window.dispatchEvent(
          new CustomEvent('shado-world-region-command', {
            detail: { type: 'object-select', id },
          })
        );
      }
    });
    void this.reconcilePrototypes();
  }

  public setDocument(document: ShadoWorldAuthoringDocument): void {
    this.document = structuredClone(document);
    // IDs may be unchanged while a gizmo edits transform data.
    for (const group of this.groups.values()) group.signature = '';
    void this.reconcilePrototypes();
  }

  public setVisible(value: boolean): void {
    this.visible = value;
    for (const group of this.groups.values()) {
      group.meshes.forEach(mesh => mesh.setEnabled(value && mesh.thinInstanceCount > 0));
    }
  }

  public async importPrototype(prototypeId: string, file: File): Promise<void> {
    const prototype = this.document.objects.prototypes.find(item => item.id === prototypeId);
    if (!prototype) throw new Error(`Unknown object prototype '${prototypeId}'`);
    await this.replaceGroupFromBytes(prototype, await file.arrayBuffer());
  }

  public update(
    planes: ArrayLike<number>,
    camera: BABYLON.Vector3,
    frame: ShadoWorldVisibilityFrame,
    coordinator: ShadoWorldVisibilityCoordinator,
    maxDistance = 0
  ): number {
    if (!this.options.liveAuthoring && coordinator.world.objects) {
      const visibility = coordinator.reduceWorldObjects(planes, frame, {
        camera: [camera.x, camera.y, camera.z],
        maxDistance,
        outsideWorldVisible: this.options.outsideWorldVisible,
      });
      const byPrototype = new Map<string, ShadoWorldObjectStamp[]>();
      visibility.byPrototype.forEach((rows, prototype) => {
        const prototypeId = coordinator.world.objects!.prototypes.id[prototype];
        const stamps = Array.from(rows, row => this.document.objects.stamps[row]).filter(
          (stamp): stamp is ShadoWorldObjectStamp => stamp !== undefined
        );
        byPrototype.set(prototypeId, stamps);
      });
      return this.applyVisibility(byPrototype);
    }

    const byPrototype = new Map<string, ShadoWorldObjectStamp[]>();
    for (const stamp of this.document.objects.stamps) {
      if (!stamp.enabled) continue;
      const prototype = this.document.objects.prototypes.find(item => item.id === stamp.prototype);
      if (!prototype) continue;
      const cell = coordinator.locateCell(stamp.position[0], stamp.position[2]);
      if (
        cell < 0
          ? !this.options.outsideWorldVisible
          : (frame.cellFlags[cell] & CELL_POLICY) !== CELL_POLICY
      )
        continue;
      const radius = prototype.boundsRadius * Math.max(...stamp.scale);
      if (maxDistance > 0) {
        const dx = stamp.position[0] - camera.x;
        const dy = stamp.position[1] - camera.y;
        const dz = stamp.position[2] - camera.z;
        if (Math.hypot(dx, dy, dz) - radius > maxDistance) continue;
      }
      if (!sphereInFrustum(stamp.position, radius, planes)) continue;
      const list = byPrototype.get(prototype.id) ?? [];
      list.push(stamp);
      byPrototype.set(prototype.id, list);
    }
    return this.applyVisibility(byPrototype);
  }

  private applyVisibility(
    byPrototype: ReadonlyMap<string, readonly ShadoWorldObjectStamp[]>
  ): number {
    let visibleCount = 0;
    for (const [id, group] of this.groups) {
      const stamps = byPrototype.get(id) ?? [];
      visibleCount += stamps.length;
      const signature = stamps.map(stamp => stamp.id).join('|');
      if (signature === group.signature) continue;
      group.signature = signature;
      const matrices = new Float32Array(stamps.length * 16);
      stamps.forEach((stamp, index) => stampMatrix(stamp).copyToArray(matrices, index * 16));
      for (const mesh of group.meshes) {
        mesh.metadata = { ...mesh.metadata, shadoObjectStampIds: stamps.map(stamp => stamp.id) };
        mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
        mesh.thinInstanceEnablePicking = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(this.visible && stamps.length > 0);
        if (stamps.length) mesh.thinInstanceRefreshBoundingInfo(true, false, false);
      }
    }
    return visibleCount;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.pointerObserver) this.scene.onPointerObservable.remove(this.pointerObserver);
    this.groups.forEach(group => {
      group.container?.dispose();
      if (!group.container) group.meshes.forEach(mesh => mesh.dispose());
    });
    this.groups.clear();
    this.placeholderMaterial.dispose();
  }

  private async reconcilePrototypes(): Promise<void> {
    const ids = new Set(this.document.objects.prototypes.map(prototype => prototype.id));
    for (const [id, group] of this.groups) {
      if (ids.has(id)) continue;
      group.container?.dispose();
      if (!group.container) group.meshes.forEach(mesh => mesh.dispose());
      this.groups.delete(id);
    }
    for (const prototype of this.document.objects.prototypes) {
      const existing = this.groups.get(prototype.id);
      if (existing) {
        existing.prototype = prototype;
        continue;
      }
      const group: PrototypeRenderGroup = {
        prototype,
        meshes: [this.createPlaceholder(prototype)],
        signature: '',
      };
      this.groups.set(prototype.id, group);
      group.loading = this.loadPrototype(prototype).catch(error => {
        group.failed = error instanceof Error ? error.message : String(error);
        window.dispatchEvent(
          new CustomEvent('shado-world-object-load-error', {
            detail: { prototype: prototype.id, source: prototype.source, error: group.failed },
          })
        );
      });
    }
  }

  private createPlaceholder(prototype: ShadoWorldObjectPrototype): BABYLON.Mesh {
    const size = Math.max(1, prototype.boundsRadius * 0.18);
    const mesh = BABYLON.MeshBuilder.CreateBox(
      `object-placeholder-${prototype.id}`,
      { size },
      this.scene
    );
    mesh.material = this.placeholderMaterial;
    mesh.isPickable = true;
    mesh.renderingGroupId = 1;
    return mesh;
  }

  private async loadPrototype(prototype: ShadoWorldObjectPrototype): Promise<void> {
    const bytes = await fetchShadoBytes(prototype.source);
    if (this.disposed) return;
    await this.replaceGroupFromBytes(prototype, bytes);
  }

  private async replaceGroupFromBytes(
    prototype: ShadoWorldObjectPrototype,
    bytes: ArrayBuffer
  ): Promise<void> {
    const group = this.groups.get(prototype.id);
    if (!group || this.disposed) return;
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    try {
      const container = await BABYLON.LoadAssetContainerAsync(blobUrl, this.scene, {
        pluginExtension: '.glb',
      });
      const meshes = container.meshes.filter(
        mesh => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0
      ) as BABYLON.Mesh[];
      if (!meshes.length)
        throw new Error(`Prototype '${prototype.id}' contains no renderable meshes`);
      container.addAllToScene();
      group.container?.dispose();
      if (!group.container) group.meshes.forEach(mesh => mesh.dispose());
      group.container = container;
      group.meshes = meshes;
      group.failed = undefined;
      group.signature = '';
      meshes.forEach(mesh => {
        mesh.isPickable = true;
        mesh.renderingGroupId = 1;
      });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

function stampMatrix(stamp: ShadoWorldObjectStamp): BABYLON.Matrix {
  const radians = Math.PI / 180;
  return BABYLON.Matrix.Compose(
    BABYLON.Vector3.FromArray(stamp.scale),
    BABYLON.Quaternion.RotationYawPitchRoll(
      stamp.rotationDegrees[1] * radians,
      stamp.rotationDegrees[0] * radians,
      stamp.rotationDegrees[2] * radians
    ),
    BABYLON.Vector3.FromArray(stamp.position)
  );
}

function sphereInFrustum(
  position: readonly number[],
  radius: number,
  planes: ArrayLike<number>
): boolean {
  for (let plane = 0; plane < 6; plane++) {
    const offset = plane * 4;
    const distance =
      Number(planes[offset]) * position[0] +
      Number(planes[offset + 1]) * position[1] +
      Number(planes[offset + 2]) * position[2] +
      Number(planes[offset + 3]);
    if (distance < -radius) return false;
  }
  return true;
}
