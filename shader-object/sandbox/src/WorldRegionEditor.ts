import * as BABYLON from '@babylonjs/core';
import {
  cloneShadoWorldAuthoring,
  upgradeShadoWorldAuthoring,
  type ShadoWorldAuthoringDocument,
  type ShadoWorldObjectStamp,
  type ShadoWorldAuthoringRegion,
  type ShadoWorldRegionKind,
  type ShadoWorldSpatialPackage,
} from '@knervous/shado/world';

export type WorldRegionEditorState = {
  document: ShadoWorldAuthoringDocument;
  selectedId?: string;
  selectedObjectId?: string;
  transformMode: 'move' | 'rotate' | 'scale';
  snapStep: number;
  stampPrototype?: string;
};

declare global {
  interface Window {
    __shadoWorldRegions?: WorldRegionEditorState;
  }
}

export type WorldRegionEditorCommand =
  | { type: 'add'; kind?: ShadoWorldRegionKind }
  | { type: 'select'; id?: string }
  | { type: 'update'; region: ShadoWorldAuthoringRegion }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'transform-mode'; mode: 'move' | 'rotate' | 'scale' }
  | { type: 'snap-step'; value: number }
  | { type: 'nudge'; target: 'center' | 'size'; axis: 0 | 1 | 2; amount: number }
  | { type: 'frame-selection' }
  | { type: 'replace-document'; document: ShadoWorldAuthoringDocument }
  | { type: 'object-add'; prototype: string }
  | { type: 'object-stamp-mode'; prototype?: string }
  | { type: 'object-select'; id?: string }
  | { type: 'object-update'; stamp: ShadoWorldObjectStamp }
  | { type: 'object-duplicate'; id: string }
  | { type: 'object-delete'; id: string }
  | { type: 'object-frame'; id: string };

const COLORS: Record<ShadoWorldRegionKind, BABYLON.Color3> = {
  'visibility-cell': new BABYLON.Color3(0.15, 0.8, 1),
  streaming: new BABYLON.Color3(0.3, 0.55, 1),
  water: new BABYLON.Color3(0.05, 0.4, 1),
  lava: new BABYLON.Color3(1, 0.2, 0.02),
  safe: new BABYLON.Color3(0.15, 1, 0.4),
  'zone-line': new BABYLON.Color3(1, 0.75, 0.05),
  audio: new BABYLON.Color3(0.75, 0.25, 1),
  trigger: new BABYLON.Color3(1, 0.25, 0.65),
  semantic: new BABYLON.Color3(0.9, 0.9, 0.9),
};

export function createWorldRegionEditor(
  scene: BABYLON.Scene,
  world: ShadoWorldSpatialPackage,
  initial: ShadoWorldAuthoringDocument
): { setVisible(value: boolean): void; setSoloSelected(value: boolean): void; dispose(): void } {
  let document = cloneShadoWorldAuthoring(initial);
  let selectedId: string | undefined;
  let selectedObjectId: string | undefined;
  let visible = true;
  let soloSelected = false;
  let transformMode: 'move' | 'rotate' | 'scale' = 'move';
  let snapStep = 1;
  let stampPrototype: string | undefined;
  let persistTimer = 0;
  const meshes = new Map<string, BABYLON.Mesh>();
  const materials = new Map<ShadoWorldRegionKind, BABYLON.StandardMaterial>();
  const objectSelectionMaterial = new BABYLON.StandardMaterial(
    'world-object-selection-material',
    scene
  );
  objectSelectionMaterial.diffuseColor = new BABYLON.Color3(1, 0.72, 0.12);
  objectSelectionMaterial.emissiveColor = new BABYLON.Color3(0.45, 0.22, 0.02);
  objectSelectionMaterial.alpha = 0.18;
  objectSelectionMaterial.wireframe = true;
  objectSelectionMaterial.disableDepthWrite = true;
  let objectSelectionMesh: BABYLON.Mesh | undefined;
  const gizmos = new BABYLON.GizmoManager(scene);
  gizmos.positionGizmoEnabled = true;
  gizmos.scaleGizmoEnabled = false;
  gizmos.rotationGizmoEnabled = false;
  gizmos.boundingBoxGizmoEnabled = false;
  gizmos.usePointerToAttachGizmos = false;

  const materialFor = (kind: ShadoWorldRegionKind) => {
    let material = materials.get(kind);
    if (!material) {
      material = new BABYLON.StandardMaterial(`region-${kind}-material`, scene);
      material.diffuseColor = COLORS[kind];
      material.emissiveColor = COLORS[kind].scale(0.45);
      material.alpha = 0.18;
      material.backFaceCulling = false;
      material.disableDepthWrite = true;
      materials.set(kind, material);
    }
    return material;
  };
  const upsertMesh = (region: ShadoWorldAuthoringRegion) => {
    let mesh = meshes.get(region.id);
    if (!mesh) {
      mesh = BABYLON.MeshBuilder.CreateBox(`world-region-${region.id}`, { size: 1 }, scene);
      mesh.metadata = { shadoRegionId: region.id };
      mesh.renderingGroupId = 3;
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 1;
      meshes.set(region.id, mesh);
    }
    mesh.position.set(...region.center);
    mesh.scaling.set(...region.size);
    mesh.material = materialFor(region.kind);
    const color = COLORS[region.kind];
    mesh.edgesColor = new BABYLON.Color4(color.r, color.g, color.b, 1);
    mesh.renderOutline = region.id === selectedId;
    mesh.outlineColor = BABYLON.Color3.White();
    mesh.outlineWidth = 0.08;
    mesh.visibility = region.id === selectedId ? 0.9 : 0.3;
    mesh.edgesWidth = region.id === selectedId ? 3 : 1;
    mesh.setEnabled(
      visible && region.enabled && (!soloSelected || !selectedId || region.id === selectedId)
    );
  };
  const configureGizmos = () => {
    gizmos.positionGizmoEnabled = transformMode === 'move';
    gizmos.rotationGizmoEnabled = transformMode === 'rotate';
    gizmos.scaleGizmoEnabled = transformMode === 'scale';
    if (gizmos.gizmos.positionGizmo) {
      gizmos.gizmos.positionGizmo.snapDistance = snapStep;
      gizmos.gizmos.positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    }
    if (gizmos.gizmos.scaleGizmo) {
      gizmos.gizmos.scaleGizmo.snapDistance = snapStep;
    }
    if (gizmos.gizmos.rotationGizmo) {
      gizmos.gizmos.rotationGizmo.snapDistance = BABYLON.Tools.ToRadians(snapStep);
      gizmos.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    }
  };
  const reconcileObjectSelection = () => {
    const stamp = document.objects.stamps.find(candidate => candidate.id === selectedObjectId);
    const prototype = document.objects.prototypes.find(
      candidate => candidate.id === stamp?.prototype
    );
    if (!stamp || !prototype) {
      objectSelectionMesh?.dispose();
      objectSelectionMesh = undefined;
      return;
    }
    if (objectSelectionMesh?.metadata?.shadoObjectPrototype !== prototype.id) {
      objectSelectionMesh?.dispose();
      objectSelectionMesh = BABYLON.MeshBuilder.CreateBox(
        `world-object-selection-${stamp.id}`,
        { size: Math.max(1, prototype.boundsRadius * 2) },
        scene
      );
      objectSelectionMesh.material = objectSelectionMaterial;
      objectSelectionMesh.renderingGroupId = 3;
      objectSelectionMesh.enableEdgesRendering();
      objectSelectionMesh.edgesColor = new BABYLON.Color4(1, 0.8, 0.2, 1);
      objectSelectionMesh.edgesWidth = 3;
    }
    objectSelectionMesh.metadata = {
      shadoObjectId: stamp.id,
      shadoObjectPrototype: prototype.id,
    };
    objectSelectionMesh.position.set(...stamp.position);
    objectSelectionMesh.scaling.set(...stamp.scale);
    objectSelectionMesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
      BABYLON.Tools.ToRadians(stamp.rotationDegrees[1]),
      BABYLON.Tools.ToRadians(stamp.rotationDegrees[0]),
      BABYLON.Tools.ToRadians(stamp.rotationDegrees[2])
    );
    // Disabled stamps still need an editable proxy so they can be re-enabled or moved.
    objectSelectionMesh.setEnabled(true);
  };
  const reconcile = () => {
    const ids = new Set(document.regions.map(region => region.id));
    for (const [id, mesh] of meshes) {
      if (!ids.has(id)) {
        if (gizmos.attachedMesh === mesh) gizmos.attachToMesh(null);
        mesh.dispose();
        meshes.delete(id);
      }
    }
    document.regions.forEach(upsertMesh);
    reconcileObjectSelection();
    configureGizmos();
    gizmos.attachToMesh(
      selectedObjectId
        ? objectSelectionMesh ?? null
        : selectedId
          ? meshes.get(selectedId) ?? null
          : null
    );
  };
  const publish = (persist = false) => {
    if (persist) {
      document.revision++;
      localStorage.setItem(`shado-world-authoring:${document.world}`, JSON.stringify(document));
    }
    const state = {
      document: cloneShadoWorldAuthoring(document),
      selectedId,
      selectedObjectId,
      transformMode,
      snapStep,
      stampPrototype,
    };
    window.__shadoWorldRegions = state;
    window.dispatchEvent(new CustomEvent<WorldRegionEditorState>('shado-world-region-state', {
      detail: state,
    }));
  };
  const uniqueId = (base: string) => {
    const stem = base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'region';
    let id = stem;
    let suffix = 2;
    while (document.regions.some(region => region.id === id)) id = `${stem}-${suffix++}`;
    return id;
  };
  const addRegion = (kind: ShadoWorldRegionKind = 'semantic') => {
    const camera = scene.activeCamera;
    const fallback = BABYLON.Vector3.Center(
      BABYLON.Vector3.FromArray(world.bounds.min),
      BABYLON.Vector3.FromArray(world.bounds.max)
    );
    const center = camera instanceof BABYLON.ArcRotateCamera ? camera.target : fallback;
    const id = uniqueId(kind);
    document.regions.push({
      id,
      name: `New ${kind}`,
      kind,
      enabled: true,
      center: [center.x, center.y, center.z],
      size: [world.tiles.size * 0.25, Math.max(16, world.tiles.size * 0.125), world.tiles.size * 0.25],
      phaseMask: 0xffffffff,
      tags: [],
      metadata: {},
    });
    selectedId = id;
    reconcile();
    publish(true);
  };
  const addObjectStamp = (prototypeId: string, position: BABYLON.Vector3) => {
    const prototype = document.objects.prototypes.find(candidate => candidate.id === prototypeId);
    if (!prototype) return;
    const base = `${prototype.id}-stamp`;
    let suffix = document.objects.stamps.length + 1;
    let id = `${base}-${suffix}`;
    while (document.objects.stamps.some(stamp => stamp.id === id)) id = `${base}-${++suffix}`;
    document.objects.stamps.push({
      id,
      prototype: prototype.id,
      enabled: true,
      position: [position.x, position.y, position.z],
      rotationDegrees: [0, 0, 0],
      scale: [1, 1, 1],
      phaseMask: 0xffffffff,
      tags: [],
      metadata: {},
    });
    selectedId = undefined;
    selectedObjectId = id;
    previousTransform = '';
    reconcile();
    publish(true);
  };
  const setStampPrototype = (prototype?: string) => {
    stampPrototype = prototype && document.objects.prototypes.some(item => item.id === prototype)
      ? prototype
      : undefined;
    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) canvas.style.cursor = stampPrototype ? 'crosshair' : '';
    publish();
  };
  const onCommand = (event: Event) => {
    const command = (event as CustomEvent<WorldRegionEditorCommand>).detail;
    if (command.type === 'add') addRegion(command.kind);
    else if (command.type === 'select') {
      selectedId = command.id;
      selectedObjectId = undefined;
      if (transformMode === 'rotate') transformMode = 'move';
      previousTransform = '';
      reconcile();
      publish();
    } else if (command.type === 'update') {
      const index = document.regions.findIndex(region => region.id === command.region.id);
      if (index >= 0) document.regions[index] = cloneRegion(command.region);
      reconcile();
      publish(true);
    } else if (command.type === 'duplicate') {
      const source = document.regions.find(region => region.id === command.id);
      if (!source) return;
      const copy = cloneRegion(source);
      copy.id = uniqueId(`${source.id}-copy`);
      copy.name = `${source.name} copy`;
      copy.center[0] += Math.max(1, copy.size[0] * 0.1);
      document.regions.push(copy);
      selectedId = copy.id;
      reconcile();
      publish(true);
    } else if (command.type === 'delete') {
      document.regions = document.regions.filter(region => region.id !== command.id);
      if (selectedId === command.id) selectedId = undefined;
      reconcile();
      publish(true);
    } else if (command.type === 'transform-mode') {
      transformMode = command.mode;
      reconcile();
      publish();
    } else if (command.type === 'snap-step') {
      snapStep = Math.max(0, Number(command.value) || 0);
      configureGizmos();
      publish();
    } else if (command.type === 'nudge') {
      const stamp = document.objects.stamps.find(candidate => candidate.id === selectedObjectId);
      if (stamp) {
        if (command.target === 'center') stamp.position[command.axis] += command.amount;
        else stamp.scale[command.axis] = Math.max(0.001, stamp.scale[command.axis] + command.amount);
      } else {
        const region = document.regions.find(candidate => candidate.id === selectedId);
        if (!region) return;
        if (command.target === 'center') region.center[command.axis] += command.amount;
        else region.size[command.axis] = Math.max(0.01, region.size[command.axis] + command.amount);
      }
      previousTransform = '';
      reconcile();
      publish(true);
    } else if (command.type === 'frame-selection') {
      const region = document.regions.find(candidate => candidate.id === selectedId);
      const camera = scene.activeCamera;
      if (!region || !(camera instanceof BABYLON.ArcRotateCamera)) return;
      camera.setTarget(BABYLON.Vector3.FromArray(region.center));
      camera.radius = Math.max(...region.size) * 2.5;
    } else if (command.type === 'replace-document') {
      document = upgradeShadoWorldAuthoring(command.document, world.name);
      selectedId = document.regions[0]?.id;
      selectedObjectId = undefined;
      setStampPrototype();
      reconcile();
      publish(true);
    } else if (command.type === 'object-add') {
      const camera = scene.activeCamera;
      const fallback = BABYLON.Vector3.Center(
        BABYLON.Vector3.FromArray(world.bounds.min),
        BABYLON.Vector3.FromArray(world.bounds.max)
      );
      const position = camera instanceof BABYLON.ArcRotateCamera ? camera.target : fallback;
      addObjectStamp(command.prototype, position);
    } else if (command.type === 'object-stamp-mode') {
      setStampPrototype(command.prototype);
    } else if (command.type === 'object-select') {
      selectedId = undefined;
      selectedObjectId = command.id;
      previousTransform = '';
      reconcile();
      publish();
    } else if (command.type === 'object-update') {
      const index = document.objects.stamps.findIndex(stamp => stamp.id === command.stamp.id);
      if (index < 0) return;
      document.objects.stamps[index] = structuredClone(command.stamp);
      previousTransform = '';
      reconcile();
      publish(true);
    } else if (command.type === 'object-duplicate') {
      const source = document.objects.stamps.find(stamp => stamp.id === command.id);
      if (!source) return;
      const copy = structuredClone(source);
      let suffix = 2;
      copy.id = `${source.id}-copy`;
      while (document.objects.stamps.some(stamp => stamp.id === copy.id)) {
        copy.id = `${source.id}-copy-${suffix++}`;
      }
      copy.position[0] += 2;
      document.objects.stamps.push(copy);
      selectedId = undefined;
      selectedObjectId = copy.id;
      previousTransform = '';
      reconcile();
      publish(true);
    } else if (command.type === 'object-delete') {
      document.objects.stamps = document.objects.stamps.filter(stamp => stamp.id !== command.id);
      if (selectedObjectId === command.id) selectedObjectId = undefined;
      reconcile();
      publish(true);
    } else if (command.type === 'object-frame') {
      const stamp = document.objects.stamps.find(candidate => candidate.id === command.id);
      const prototype = document.objects.prototypes.find(
        candidate => candidate.id === stamp?.prototype
      );
      const camera = scene.activeCamera;
      if (!stamp || !prototype || !(camera instanceof BABYLON.ArcRotateCamera)) return;
      camera.setTarget(BABYLON.Vector3.FromArray(stamp.position));
      camera.radius = Math.max(4, prototype.boundsRadius * Math.max(...stamp.scale) * 3);
    }
  };
  const pointerObserver = scene.onPointerObservable.add(event => {
    if (event.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    if (stampPrototype && event.pickInfo?.hit && event.pickInfo.pickedPoint) {
      const prototype = stampPrototype;
      setStampPrototype();
      addObjectStamp(prototype, event.pickInfo.pickedPoint);
      return;
    }
    const metadata = event.pickInfo?.pickedMesh?.metadata;
    const objectId = metadata?.shadoObjectId;
    const id = metadata?.shadoRegionId;
    if (typeof objectId === 'string') {
      selectedId = undefined;
      selectedObjectId = objectId;
    } else if (typeof id === 'string') {
      selectedId = id;
      selectedObjectId = undefined;
    } else {
      return;
    }
    previousTransform = '';
    reconcile();
    publish();
  });
  let previousTransform = '';
  const beforeRender = scene.onBeforeRenderObservable.add(() => {
    const mesh = selectedObjectId ? objectSelectionMesh : selectedId ? meshes.get(selectedId) : undefined;
    if (!mesh || gizmos.attachedMesh !== mesh) return;
    const signature = [
      ...mesh.position.asArray(),
      ...mesh.scaling.asArray(),
      ...(mesh.rotationQuaternion?.asArray() ?? mesh.rotation.asArray()),
    ].join(',');
    if (!previousTransform) previousTransform = signature;
    if (signature === previousTransform) return;
    previousTransform = signature;
    if (selectedObjectId) {
      const stamp = document.objects.stamps.find(candidate => candidate.id === selectedObjectId);
      if (!stamp) return;
      const euler = (mesh.rotationQuaternion ?? BABYLON.Quaternion.FromEulerVector(mesh.rotation))
        .toEulerAngles();
      stamp.position = mesh.position.asArray() as [number, number, number];
      stamp.rotationDegrees = [
        BABYLON.Tools.ToDegrees(euler.x),
        BABYLON.Tools.ToDegrees(euler.y),
        BABYLON.Tools.ToDegrees(euler.z),
      ];
      stamp.scale = mesh.scaling.asArray().map(
        value => Math.max(0.001, Math.abs(value))
      ) as [number, number, number];
    } else {
      const region = document.regions.find(candidate => candidate.id === selectedId);
      if (!region) return;
      region.center = mesh.position.asArray() as [number, number, number];
      region.size = mesh.scaling.asArray().map(
        value => Math.max(0.01, Math.abs(value))
      ) as [number, number, number];
    }
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => publish(true), 100);
  });
  window.addEventListener('shado-world-region-command', onCommand);
  reconcile();
  publish();
  return {
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      reconcile();
    },
    setSoloSelected(value) {
      if (soloSelected === value) return;
      soloSelected = value;
      reconcile();
    },
    dispose() {
      window.removeEventListener('shado-world-region-command', onCommand);
      window.clearTimeout(persistTimer);
      const canvas = scene.getEngine().getRenderingCanvas();
      if (canvas) canvas.style.cursor = '';
      if (pointerObserver) scene.onPointerObservable.remove(pointerObserver);
      if (beforeRender) scene.onBeforeRenderObservable.remove(beforeRender);
      gizmos.dispose();
      objectSelectionMesh?.dispose();
      objectSelectionMaterial.dispose();
      meshes.forEach(mesh => mesh.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}

function cloneRegion(region: ShadoWorldAuthoringRegion): ShadoWorldAuthoringRegion {
  return JSON.parse(JSON.stringify(region)) as ShadoWorldAuthoringRegion;
}
