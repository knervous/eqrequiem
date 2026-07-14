import {
  BABYLON,
  type Camera,
  type Mesh,
  type Observer,
  type PickingInfo,
  type PointerInfo,
  type Ray,
  type Scene,
  type Vector3,
} from '../babylon';
import type { ShadoActor } from '../extensions/ShadoActor';
import type { ShadoInstanceContainer } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import type { ShadoDynamicEntityContainer } from './ShadoDynamicEntityContainer';
import { SHADO_ENTITY_VISIBLE, type ShadoEntity2D } from './ShadoEntity2D';

export type ShadoPickingSchedule = 'microtask' | 'next-frame';

export interface ShadoAsyncPickingBaseOptions<TResult> {
  enabled?: boolean;
  button?: number;
  camera?: Camera;
  includeInvisible?: boolean;
  schedule?: ShadoPickingSchedule;
  pointerEventTypes?: number;
  onPick?: (result: TResult, event: PointerEvent) => void | Promise<void>;
  onMiss?: (event: PointerEvent) => void | Promise<void>;
}

export interface ShadoInstancePickResult<T extends ShadoActor = ShadoActor> {
  kind: 'instance';
  engine: 'webgpu' | 'webgl';
  source: 'cpu-ray';
  index: number;
  instance: T;
  mesh: Mesh;
  ray: Ray;
  distance: number;
  pickedPoint: Vector3;
  pickingInfo: PickingInfo;
}

export interface ShadoDynamicEntityPickResult {
  kind: 'dynamic-entity';
  engine: 'webgpu' | 'webgl';
  source: 'cpu-ray';
  id: string | undefined;
  index: number;
  entity: ShadoEntity2D;
  mesh: Mesh;
  ray: Ray;
  distance: number;
  pickedPoint: Vector3;
  pickingInfo: PickingInfo;
}

export interface ShadoInstanceAsyncPickingOptions<T extends ShadoActor = ShadoActor>
  extends ShadoAsyncPickingBaseOptions<ShadoInstancePickResult<T>> {
  radius?: number;
  predicate?: (instance: T, index: number) => boolean;
}

export interface ShadoDynamicEntityAsyncPickingOptions
  extends ShadoAsyncPickingBaseOptions<ShadoDynamicEntityPickResult> {
  padding?: number;
  predicate?: (entity: ShadoEntity2D, index: number, id: string | undefined) => boolean;
}

export type ShadoPickingHandle = {
  dispose(): void;
};

export function normalizePickingOptions<T extends ShadoAsyncPickingBaseOptions<any>>(
  options: boolean | T | undefined
): T | undefined {
  if (!options) return undefined;
  if (options === true) return { enabled: true } as T;
  if (options.enabled === false) return undefined;
  return options;
}

export async function pickShadoInstanceAtPointer<T extends ShadoActor>(
  scene: Scene,
  mesh: Mesh,
  container: ShadoInstanceContainer<T>,
  pointerX: number,
  pointerY: number,
  options: ShadoInstanceAsyncPickingOptions<T> = {}
): Promise<ShadoInstancePickResult<T> | null> {
  await deferPick(options.schedule);
  const ray = scene.createPickingRay(
    pointerX,
    pointerY,
    BABYLON.Matrix.Identity(),
    options.camera ?? scene.activeCamera
  );
  return pickShadoInstanceWithRay(mesh, container, ray, options);
}

export function pickShadoInstanceWithRay<T extends ShadoActor>(
  mesh: Mesh,
  container: ShadoInstanceContainer<T>,
  ray: Ray,
  options: ShadoInstanceAsyncPickingOptions<T> = {}
): ShadoInstancePickResult<T> | null {
  const radius = Math.max(0.0001, options.radius ?? 1);
  let best: ShadoInstancePickResult<T> | null = null;

  const children = container.children as readonly T[];
  for (let index = 0; index < children.length; index++) {
    const instance = children[index];
    if (!instance) continue;
    const anyInstance = instance as any;
    if (
      !options.includeInvisible &&
      anyInstance.visibleFlag !== undefined &&
      !anyInstance.visibleFlag
    ) {
      continue;
    }
    if (options.predicate && !options.predicate(instance, index)) continue;

    const translation = anyInstance.translation as Float32Array | undefined;
    if (!translation) continue;
    const scale = Number.isFinite(translation[3]) ? Math.max(0.0001, translation[3]) : 1;
    const distance = intersectRaySphere(
      ray,
      translation[0] ?? 0,
      translation[1] ?? 0,
      translation[2] ?? 0,
      radius * scale
    );
    if (distance === null || distance < 0 || distance > ray.length) continue;
    if (best && distance >= best.distance) continue;

    best = instancePickResult(mesh, ray, instance, index, distance);
  }

  return best;
}

export async function pickShadoDynamicEntityAtPointer(
  scene: Scene,
  mesh: Mesh,
  container: ShadoDynamicEntityContainer,
  pointerX: number,
  pointerY: number,
  options: ShadoDynamicEntityAsyncPickingOptions = {}
): Promise<ShadoDynamicEntityPickResult | null> {
  await deferPick(options.schedule);
  const ray = scene.createPickingRay(
    pointerX,
    pointerY,
    BABYLON.Matrix.Identity(),
    options.camera ?? scene.activeCamera
  );
  return pickShadoDynamicEntityWithRay(mesh, container, ray, options);
}

export function pickShadoDynamicEntityWithRay(
  mesh: Mesh,
  container: ShadoDynamicEntityContainer,
  ray: Ray,
  options: ShadoDynamicEntityAsyncPickingOptions = {}
): ShadoDynamicEntityPickResult | null {
  let best: ShadoDynamicEntityPickResult | null = null;
  const padding = Math.max(0, options.padding ?? 0);
  const ids = container.ids;

  for (let index = 0; index < ids.length; index++) {
    const entity = container.getEntity(index);
    if (!entity) continue;
    if (!options.includeInvisible && ((entity.renderState[1] | 0) & SHADO_ENTITY_VISIBLE) === 0) {
      continue;
    }
    const id = ids[index];
    if (options.predicate && !options.predicate(entity, index, id)) continue;

    const distance = intersectRayEntityBox(ray, entity, padding);
    if (distance === null || distance < 0 || distance > ray.length) continue;
    if (best && distance >= best.distance) continue;

    best = dynamicEntityPickResult(mesh, ray, entity, id, index, distance);
  }

  return best;
}

export function installShadoInstanceClickPicking<T extends ShadoActor>(
  scene: Scene,
  mesh: Mesh,
  container: ShadoInstanceContainer<T>,
  options: ShadoInstanceAsyncPickingOptions<T>
): ShadoPickingHandle {
  return installPointerPicking(scene, options, async event => {
    const result = await pickShadoInstanceAtPointer(
      scene,
      mesh,
      container,
      scene.pointerX,
      scene.pointerY,
      options
    );
    if (result) await options.onPick?.(result, event);
    else await options.onMiss?.(event);
  });
}

export function installShadoDynamicEntityClickPicking(
  scene: Scene,
  mesh: Mesh,
  container: ShadoDynamicEntityContainer,
  options: ShadoDynamicEntityAsyncPickingOptions
): ShadoPickingHandle {
  return installPointerPicking(scene, options, async event => {
    const result = await pickShadoDynamicEntityAtPointer(
      scene,
      mesh,
      container,
      scene.pointerX,
      scene.pointerY,
      options
    );
    if (result) await options.onPick?.(result, event);
    else await options.onMiss?.(event);
  });
}

function installPointerPicking<TResult>(
  scene: Scene,
  options: ShadoAsyncPickingBaseOptions<TResult>,
  pick: (event: PointerEvent) => Promise<void>
): ShadoPickingHandle {
  const eventTypes = options.pointerEventTypes ?? BABYLON.PointerEventTypes.POINTERUP;
  const button = options.button ?? 0;
  let disposed = false;
  const observer: Observer<PointerInfo> = scene.onPointerObservable.add(pointerInfo => {
    const event = pointerInfo.event as PointerEvent;
    if (disposed || !event || event.button !== button) return;
    void pick(event);
  }, eventTypes);
  return {
    dispose() {
      disposed = true;
      scene.onPointerObservable.remove(observer);
    },
  };
}

function instancePickResult<T extends ShadoActor>(
  mesh: Mesh,
  ray: Ray,
  instance: T,
  index: number,
  distance: number
): ShadoInstancePickResult<T> {
  const pickedPoint = ray.origin.add(ray.direction.scale(distance));
  const pickingInfo = makePickingInfo(mesh, ray, pickedPoint, distance);
  return {
    kind: 'instance',
    engine: engineKind(mesh),
    source: 'cpu-ray',
    index,
    instance,
    mesh,
    ray,
    distance,
    pickedPoint,
    pickingInfo,
  };
}

function dynamicEntityPickResult(
  mesh: Mesh,
  ray: Ray,
  entity: ShadoEntity2D,
  id: string | undefined,
  index: number,
  distance: number
): ShadoDynamicEntityPickResult {
  const pickedPoint = ray.origin.add(ray.direction.scale(distance));
  const pickingInfo = makePickingInfo(mesh, ray, pickedPoint, distance);
  return {
    kind: 'dynamic-entity',
    engine: engineKind(mesh),
    source: 'cpu-ray',
    id,
    index,
    entity,
    mesh,
    ray,
    distance,
    pickedPoint,
    pickingInfo,
  };
}

function makePickingInfo(
  mesh: Mesh,
  ray: Ray,
  pickedPoint: Vector3,
  distance: number
): PickingInfo {
  const pickingInfo = new BABYLON.PickingInfo();
  pickingInfo.hit = true;
  pickingInfo.distance = distance;
  pickingInfo.pickedPoint = pickedPoint;
  pickingInfo.pickedMesh = mesh;
  pickingInfo.ray = ray;
  return pickingInfo;
}

function engineKind(mesh: Mesh): 'webgpu' | 'webgl' {
  return mesh.getScene().getEngine().isWebGPU ? 'webgpu' : 'webgl';
}

function intersectRaySphere(
  ray: Ray,
  x: number,
  y: number,
  z: number,
  radius: number
): number | null {
  const ox = ray.origin.x - x;
  const oy = ray.origin.y - y;
  const oz = ray.origin.z - z;
  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : null;
}

function intersectRayEntityBox(ray: Ray, entity: ShadoEntity2D, padding: number): number | null {
  const baseHeight = Math.max(0.0001, entity.render[1]);
  const width = Math.max(0.0001, entity.positionSize[2]) + padding * 2;
  const depth = Math.max(0.0001, entity.positionSize[3]) + padding * 2;
  const height = baseHeight + padding * 2;
  const rotation = entity.render[2] ?? 0;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  const cx = entity.positionSize[0];
  const cy = (entity.render[0] ?? 0) + baseHeight * 0.5;
  const cz = entity.positionSize[1];
  const rox = ray.origin.x - cx;
  const roy = ray.origin.y - cy;
  const roz = ray.origin.z - cz;
  const localOrigin = {
    x: rox * cos - roz * sin,
    y: roy,
    z: rox * sin + roz * cos,
  };
  const localDirection = {
    x: ray.direction.x * cos - ray.direction.z * sin,
    y: ray.direction.y,
    z: ray.direction.x * sin + ray.direction.z * cos,
  };

  return intersectRayAabb(localOrigin, localDirection, {
    x: width * 0.5,
    y: height * 0.5,
    z: depth * 0.5,
  });
}

function intersectRayAabb(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  halfSize: { x: number; y: number; z: number }
): number | null {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  const axes = ['x', 'y', 'z'] as const;

  for (const axis of axes) {
    const o = origin[axis];
    const d = direction[axis];
    const h = halfSize[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < -h || o > h) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (-h - o) * inv;
    let t2 = (h - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}

function deferPick(schedule: ShadoPickingSchedule | undefined): Promise<void> {
  if (schedule !== 'next-frame' || typeof requestAnimationFrame === 'undefined') {
    return Promise.resolve();
  }
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
