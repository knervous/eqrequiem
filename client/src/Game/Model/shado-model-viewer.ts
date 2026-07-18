import * as BABYLON from "@babylonjs/core";
import type * as BJS from "@babylonjs/core";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader.js";

import { createVATShaderMaterial } from "./entity-material";
import { ShadoEntityPool } from "./shado-entity-pool";

export type ViewerAnimation = {
  from: number;
  to: number;
  name: string;
  fps?: number;
};

export type ShadoModelViewerOptions = {
  assetBaseUrl?: string;
  model?: string;
  onFrame?: (fps: number) => void;
  onStatus?: (status: string) => void;
};

export type ShadoModelViewer = {
  animations: ViewerAnimation[];
  mesh: BJS.Mesh;
  playAnimation: (name: string) => void;
  setTint: (rgb: readonly [number, number, number]) => void;
  setBodyVisible: (visible: boolean) => void;
  setWireframe: (enabled: boolean) => void;
  setBackFaceCulling: (enabled: boolean) => void;
  setSkeletonViewer: (enabled: boolean, displayMode?: "lines" | "spheres") => void;
  resetCamera: () => void;
  dispose: () => void;
};

async function fetchBytes(url: string, gzip = false): Promise<Uint8Array> {
  const response = await fetch(url).catch((error: unknown) => {
    throw new Error(
      `Unable to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Vite marks *.gz as Content-Encoding: gzip, so browsers transparently
  // decode them. Object storage may instead return the raw gzip payload.
  // Inspect the payload and avoid attempting to decompress plain bytes twice.
  if (!gzip || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes.slice().buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchJson<T>(url: string): Promise<T> {
  const bytes = await fetchBytes(url);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    throw new Error(
      `Unable to parse ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export async function createShadoModelViewer(
  canvas: HTMLCanvasElement,
  options: ShadoModelViewerOptions = {},
): Promise<ShadoModelViewer> {
  const model = (options.model ?? "hum").toLowerCase();
  const baseUrl = normalizedBaseUrl(options.assetBaseUrl ?? "/eqrequiem");
  const runStage = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
    options.onStatus?.(label);
    try {
      return await task();
    } catch (error) {
      throw new Error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.035, 0.055, 0.075, 1);
  const camera = new BABYLON.ArcRotateCamera(
    "libra-model-camera",
    -Math.PI / 2,
    Math.PI / 2.3,
    10,
    new BABYLON.Vector3(0, 3, 0),
    scene,
  );
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 20;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);

  const resetCamera = () => {
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.3;
    camera.radius = 10;
    camera.target.set(0, 3, 0);
  };

  const [sceneBytes, vatBytes, animationResponse, textureBytes] =
    await runStage("Loading runtime assets", () => Promise.all([
      fetchBytes(`${baseUrl}/babylon/${model}.babylon.gz`, true),
      fetchBytes(
        `${baseUrl}/vat/${model}${engine.getCaps().textureHalfFloat ? "" : "_32"}.bin.gz`,
        true,
      ),
      fetchJson<{ fps?: number; animations: ViewerAnimation[] }>(
        `${baseUrl}/vat/${model}.json`,
      ),
      fetchBytes(`${baseUrl}/basis/${model.slice(0, 3)}.rgba`),
    ]));

  const sceneFile = new File([sceneBytes.slice().buffer], `${model}.babylon`, {
    type: "application/babylon",
  });
  const container = await runStage("Importing Babylon scene", () =>
    BABYLON.LoadAssetContainerAsync(sceneFile, scene, {
      name: `${model}.babylon`,
      pluginExtension: ".babylon",
    }),
  );
  container.addAllToScene();
  const skeleton = container.skeletons[0];
  if (!skeleton) throw new Error(`${model} has no runtime skeleton`);

  const meshes = container.meshes.filter(
    (candidate) => candidate.getTotalVertices() > 0,
  ) as BJS.Mesh[];
  if (!meshes.length) throw new Error(`${model} has no renderable geometry`);

  for (const sourceMesh of meshes) {
    sourceMesh.metadata ??= {};
    sourceMesh.computeWorldMatrix(true);
    sourceMesh.bakeTransformIntoVertices(sourceMesh.getWorldMatrix());
    if (!sourceMesh.metadata.gltf?.extras?.preserveRuntimeWinding) {
      sourceMesh.flipFaces(true);
    }
    const vertexCount = sourceMesh.getTotalVertices();
    sourceMesh.setVerticesData(
      "submeshData",
      new Float32Array(vertexCount * 2),
      false,
      2,
    );
  }

  const mergedMesh = BABYLON.Mesh.MergeMeshes(
    meshes,
    true,
    false,
    undefined,
    false,
    false,
  );
  if (!mergedMesh) throw new Error(`Unable to merge ${model} geometry`);
  mergedMesh.name = `${model}-libra-preview`;
  mergedMesh.skeleton = skeleton;
  mergedMesh.position.setAll(0);
  mergedMesh.rotation.setAll(0);
  mergedMesh.scaling.setAll(1);

  const manager = new BABYLON.BakedVertexAnimationManager(scene);
  const vatData = engine.getCaps().textureHalfFloat
    ? new Uint16Array(vatBytes.buffer, vatBytes.byteOffset, vatBytes.byteLength / 2)
    : new Float32Array(vatBytes.buffer, vatBytes.byteOffset, vatBytes.byteLength / 4);
  const baker = new BABYLON.VertexAnimationBaker(scene, skeleton);
  manager.texture = baker.textureFromBakedVertexData(vatData);
  mergedMesh.bakedVertexAnimationManager = manager;

  // The .rgba preview is a square single-layer RGBA byte dump; recover its
  // dimensions from the payload so atlas resolution can vary per model.
  const atlasSize = Math.round(Math.sqrt(textureBytes.byteLength / 4))
  const texture = new BABYLON.RawTexture2DArray(
    textureBytes,
    atlasSize,
    atlasSize,
    1,
    BABYLON.Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
  );
  const shadoPool = await runStage("Initializing Shado runtime", () =>
    ShadoEntityPool.create(engine),
  );
  const material = createVATShaderMaterial(scene, shadoPool, model);
  mergedMesh.metadata = {
    textureAttributesDirtyRef: { value: true },
    shadoPool,
    submeshCount: 1,
    atlasArrayTexture: texture,
    cloakAtlasArrayTexture: texture,
    helmAtlasArrayTexture: texture,
    vatTexture: manager.texture,
    vatTextureSizeInverted: new BABYLON.Vector2(
      1 / manager.texture.getSize().width,
      1 / manager.texture.getSize().height,
    ),
  };
  mergedMesh.material?.dispose(true, true);
  mergedMesh.material = material;
  mergedMesh.thinInstanceRegisterAttribute("matrix", 16);
  mergedMesh.thinInstanceAdd(BABYLON.Matrix.Identity(), true);

  const { actor, index } = shadoPool.acquire(1, 1);
  shadoPool.setTransform(
    actor,
    BABYLON.Vector3.Zero(),
    BABYLON.Quaternion.Identity(),
    1,
  );
  shadoPool.setAppearance(index, 0, 1, 0, 1, 1, 1);
  const animations = animationResponse.animations.map((animation) => ({
    ...animation,
    fps: animation.fps ?? animationResponse.fps ?? 30,
  }));
  const playAnimation = (name: string) => {
    const animation = animations.find((candidate) => candidate.name === name);
    if (!animation) throw new Error(`Unknown animation: ${name}`);
    shadoPool.setAnimation(
      actor,
      new BABYLON.Vector4(
        animation.from,
        animation.to,
        0,
        animation.fps ?? 30,
      ),
    );
    shadoPool.commit();
  };
  const initialAnimation =
    animations.find((animation) => animation.name === "Idle") ?? animations[0];
  if (!initialAnimation) throw new Error(`${model} has no runtime animations`);
  playAnimation(initialAnimation.name);
  shadoPool.setVisible(actor, true);
  shadoPool.commit();

  let lastSample = performance.now();
  let frames = 0;
  engine.runRenderLoop(() => {
    manager.time += engine.getDeltaTime() / 1000;
    scene.render();
    frames++;
    const now = performance.now();
    if (now - lastSample >= 500) {
      options.onFrame?.((frames * 1000) / (now - lastSample));
      lastSample = now;
      frames = 0;
    }
  });
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  options.onStatus?.("Live Shado/VAT render");

  let skeletonViewer: BJS.SkeletonViewer | null = null;

  return {
    animations,
    mesh: mergedMesh,
    playAnimation,
    setSkeletonViewer: (enabled, displayMode = "lines") => {
      // The Shado/VAT runtime drives visible vertex positions entirely in the
      // vertex shader from the baked animation texture; the mesh's Babylon
      // skeleton is never touched after import, so this always shows bind
      // (rest) pose, not whatever clip is currently playing. That's still
      // the right tool for checking joint-to-mesh fit, which is a bind-pose
      // property — it just can't show mid-animation deformation.
      skeletonViewer?.dispose();
      skeletonViewer = null;
      if (!enabled) return;
      const skeleton = mergedMesh.skeleton;
      if (!skeleton) return;
      skeletonViewer = new BABYLON.SkeletonViewer(skeleton, mergedMesh, scene, false, 3, {
        displayMode: displayMode === "spheres"
          ? BABYLON.SkeletonViewer.DISPLAY_SPHERE_AND_SPURS
          : BABYLON.SkeletonViewer.DISPLAY_LINES,
      });
      skeletonViewer.isEnabled = true;
      skeletonViewer.color = new BABYLON.Color3(1, 0.1, 0.1);
    },
    setTint: ([r, g, b]) => {
      shadoPool.setAppearance(index, 0, 1, 0, r, g, b);
      shadoPool.commit();
    },
    setBodyVisible: (visible) => {
      shadoPool.setAppearance(index, 0, 1, visible ? 0 : -1, 1, 1, 1);
      shadoPool.commit();
    },
    setWireframe: (enabled) => {
      material.wireframe = enabled;
    },
    setBackFaceCulling: (enabled) => {
      material.backFaceCulling = enabled;
    },
    resetCamera,
    dispose: () => {
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop();
      skeletonViewer?.dispose();
      shadoPool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
