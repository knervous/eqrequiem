import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import {
  field,
  gpuStruct,
  shadoPublish,
  ShadoActor,
  ShadoInstanceContainer,
  type ShadoInstanceGLSLHooks,
  type ShadoInstanceWGSLHooks,
  type ShadoHybridModuleAttachment,
  type ShadoVatQualityTier,
} from '@knervous/shado';
import { pickShadoInstanceAtPointer } from '@knervous/shado/render';
import { installMobilePanelModal } from './MobilePanelModal';
import { fetchShadoBytes } from '@knervous/shado/preprocess/runtime';
import { createSvatDecompressor, decodeSvat, isSvatContainer } from '@knervous/shado/svat';
import {
  ModularBatBaseline,
  ThinModularBatBaseline,
  type BatClip,
  type ModularBatStats,
  type ThinModularBatStats,
} from './ModularBatBaseline';

const MODEL_ID = 'nm-m-supermesh';
const MODULE_FIELDS = [
  {
    name: 'body', property: 'bodyVariation', label: 'Body', query: 'bd',
    values: ['NM_M_BD_NLS_77', 'NM_M_BD_NLS_1102', 'NM_M_BD_NLS_1112', 'NM_M_BD_NLS_1227', 'NM_M_BD_NLS_11105'],
  },
  {
    name: 'hands', property: 'handVariation', label: 'Hands', query: 'hn',
    values: ['NM_M_HN_S_2300', 'NM_M_HN_S_2302', 'NM_M_HN_S_2412', 'NM_M_HN_S_2426', 'NM_M_HN_S_21206'],
  },
  {
    name: 'pants', property: 'pantsVariation', label: 'Pants', query: 'pt',
    values: ['NM_M_PT_PLN_15', 'NM_M_PT_PMN_1612', 'NM_M_PT_VNN_79', 'NM_M_PT_VNN_1628', 'NM_M_PT_VNO_21602'],
  },
  {
    name: 'legs', property: 'legVariation', label: 'Legs', query: 'lg',
    values: ['NM_M_LG_L_2704', 'NM_M_LG_L_2742', 'NM_M_LG_L_21321', 'NM_M_LG_L_21322', 'NM_M_LG_L_21326'],
  },
  {
    name: 'hair', property: 'hairVariation', label: 'Hair', query: 'hr',
    values: ['NM_M_HR_N_5', 'NM_M_HR_N_6', 'NM_M_HR_N_7', 'NM_M_HR_N_13', 'NM_M_HR_N_14'],
  },
  {
    name: 'eyes', property: 'eyeVariation', label: 'Eyes', query: 'ey',
    values: ['NM_M_EY_N_1'],
  },
] as const;

const CAPTURED_PRESETS = [
  { id: 'NM_M_demo_01', selections: [0, 2, 0, 4, 4, 0], clip: 'NM_C_DFF_BsCmn01' },
  { id: 'NM_M_demo_02', selections: [2, 0, 2, 3, 2, 0], clip: 'NM_G_CMN_Banter01' },
  { id: 'NM_M_demo_03', selections: [3, 3, 4, 0, 1, 0], clip: 'NM_SS_SST_Run01' },
  { id: 'NM_M_demo_04', selections: [4, 1, 1, 1, 3, 0], clip: 'NM_A_SSD_Stand01' },
  { id: 'NM_M_demo_05', selections: [1, 4, 3, 2, 0, 0], clip: 'NM_G_CMN_Please01' },
] as const;

const PERMUTATION_COUNT = MODULE_FIELDS.reduce((count, field) => count * field.values.length, 1);
const MAX_EXPLORER_ACTORS = 2_000;

type ModuleRecord = {
  name: string;
  slot: string;
  slotIndex: number;
  variation: number;
  code: number;
  primitiveStart: number;
  primitiveCount: number;
};

type CompositionSlot = {
  id: string;
  field: string;
  property: string;
  label: string;
  query: string;
  variations: { id: string; source: string; variation: number; code: number }[];
};

type AssetManifest = {
  model: string;
  slotOrder: string[];
  modules: ModuleRecord[];
  composition: {
    model: 'slot-variation-catalog';
    selectionStorage: string;
    storedGeneratedPermutations: number;
    namedPresets: number;
    possibleCombinations: number;
    slots: CompositionSlot[];
  };
  animation: { clips: string[]; vatGzipBytes: number };
  bytes: Record<string, number>;
};

type FrameSummary = {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

type SweepRow = {
  actors: number;
  addActorsMs: number;
  verticesPerFrame: number;
  selectedVerticesPerFrame: number;
  vertexWorkAmplification: number;
  frameMs: FrameSummary;
  gpuMs?: FrameSummary;
  queueCompletionMs?: FrameSummary;
  meanFps: number;
  vertexThroughputPerSecond: number;
  actorArenaMiB: number;
  drawCalls?: number;
  duplicatedGeometryMiB?: number;
  sharedGeometryMiB?: number;
  instanceBufferMiB?: number;
  populatedModuleBuckets?: number;
  actualThinInstances?: number;
  verdict: '60 fps' | '30 fps' | 'below 30 fps';
};

type ScaleResult = {
  asset: Record<string, unknown>;
  backend: Record<string, unknown>;
  structuralLimits: Record<string, unknown>;
  sweep: SweepRow[];
  measuredLimits: Record<string, unknown>;
};

type RenderPath = 'bat' | 'bat-thin' | 'supermesh' | 'hybrid' | 'cached';

declare global {
  interface Window {
    __shadoSupermeshScale?: {
      status: 'loading' | 'running' | 'passed' | 'failed';
      progress?: string;
      result?: ScaleResult;
      error?: string;
    };
  }
}

const SUPER_MESH_GLSL: ShadoInstanceGLSLHooks = Object.freeze({
  vertexAfterPosition: `
  float moduleCode = floor(aMeta.y + 0.5);
  int moduleSlot = int(floor(moduleCode / 16.0));
  float moduleVariation = moduleCode - float(moduleSlot) * 16.0;
  float selectedVariation = moduleSlot == 0 ? inst.bodyVariation
    : moduleSlot == 1 ? inst.handVariation
    : moduleSlot == 2 ? inst.pantsVariation
    : moduleSlot == 3 ? inst.legVariation
    : moduleSlot == 4 ? inst.hairVariation
    : inst.eyeVariation;
  if (abs(moduleVariation - selectedVariation) > 0.25) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`,
});

const SUPER_MESH_WGSL: ShadoInstanceWGSLHooks = Object.freeze({
  vertexAfterPosition: `
  let moduleCode = floor(vertexInputs.aMeta.y + 0.5);
  let moduleSlot = i32(floor(moduleCode / 16.0));
  let moduleVariation = moduleCode - f32(moduleSlot) * 16.0;
  var selectedVariation = inst.eyeVariation;
  if (moduleSlot == 0) { selectedVariation = inst.bodyVariation; }
  else if (moduleSlot == 1) { selectedVariation = inst.handVariation; }
  else if (moduleSlot == 2) { selectedVariation = inst.pantsVariation; }
  else if (moduleSlot == 3) { selectedVariation = inst.legVariation; }
  else if (moduleSlot == 4) { selectedVariation = inst.hairVariation; }
  if (abs(moduleVariation - selectedVariation) > 0.25) {
    vertexOutputs.position = vec4f(0.0, 0.0, 2.0, 1.0);
  }`,
});

@gpuStruct({ name: 'SupermeshScaleActor' })
class SupermeshScaleActor extends ShadoActor {
  @shadoPublish({ name: 'body', label: 'Body', group: 'Mesh modules', values: MODULE_FIELDS[0].values })
  @field('f32') bodyVariation!: number;
  @shadoPublish({ name: 'hands', label: 'Hands', group: 'Mesh modules', values: MODULE_FIELDS[1].values })
  @field('f32') handVariation!: number;
  @shadoPublish({ name: 'pants', label: 'Pants', group: 'Mesh modules', values: MODULE_FIELDS[2].values })
  @field('f32') pantsVariation!: number;
  @shadoPublish({ name: 'legs', label: 'Legs', group: 'Mesh modules', values: MODULE_FIELDS[3].values })
  @field('f32') legVariation!: number;
  @shadoPublish({ name: 'hair', label: 'Hair', group: 'Mesh modules', values: MODULE_FIELDS[4].values })
  @field('f32') hairVariation!: number;
  @shadoPublish({ name: 'eyes', label: 'Eyes', group: 'Mesh modules', values: MODULE_FIELDS[5].values })
  @field('f32') eyeVariation!: number;

  override initialize() {
    super.initialize();
    for (const field of MODULE_FIELDS) this[field.property] = 0;
  }
}

class SupermeshScaleContainer extends ShadoInstanceContainer<SupermeshScaleActor> {
  protected override getGLSLHooks() { return SUPER_MESH_GLSL; }
  protected override getWGSLHooks() { return SUPER_MESH_WGSL; }
}

/** Module buckets make the supermesh clipping hooks unnecessary. */
class HybridSupermeshScaleContainer extends ShadoInstanceContainer<SupermeshScaleActor> {}

const UI_CSS = `
.sms-panel{position:fixed;z-index:9;top:14px;right:14px;width:min(660px,calc(100vw - 28px));max-height:calc(100vh - 70px);overflow:auto;padding:16px;border:1px solid #33443a;border-radius:12px;background:#09110eef;color:#e6eee8;text-align:left;box-shadow:0 18px 60px #000a;backdrop-filter:blur(14px);font:12px/1.4 system-ui,sans-serif}
.sms-panel *{box-sizing:border-box}.sms-panel h1{margin:2px 0 4px;font-size:18px}.sms-panel h2{margin:13px 0 6px;color:#9fb1a5;font-size:10px;letter-spacing:.11em;text-transform:uppercase}.sms-panel p{margin:0 0 10px;color:#9aaba0}.sms-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sms-badge{padding:4px 7px;border:1px solid #42664d;border-radius:999px;color:#8de3a1;font:10px monospace;white-space:nowrap}.sms-progress{height:5px;margin:11px 0;background:#1c2821;border-radius:8px;overflow:hidden}.sms-progress i{display:block;width:0;height:100%;background:#63cc7b;transition:width .2s}.sms-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}.sms-stat{padding:8px;border:1px solid #26372d;border-radius:7px;background:#101914}.sms-stat b{display:block;color:#edf8ef;font:13px monospace}.sms-stat span{color:#718078;font-size:9px;text-transform:uppercase;letter-spacing:.07em}.sms-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:9px 0}.sms-actions button,.sms-actions select,.sms-actions input,.sms-fields select{height:29px;padding:0 9px;border:1px solid #354b3c;border-radius:6px;background:#142019;color:#dce9df;font-size:11px}.sms-actions button{cursor:pointer}.sms-actions button:hover{border-color:#65cc7b}.sms-actions input{width:74px}.sms-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sms-fields label{display:grid;gap:3px;color:#819289;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.sms-fields select{width:100%;min-width:0;text-transform:none;letter-spacing:0}.sms-slot{display:flex;align-items:center;gap:4px}.sms-slot button{flex:0 0 auto;width:24px;height:29px;padding:0;border:1px solid #354b3c;border-radius:6px;background:#142019;color:#dce9df;font-size:11px;line-height:1;cursor:pointer}.sms-slot button:hover{border-color:#65cc7b}.sms-slot select{flex:1 1 auto}.sms-caption{display:flex;justify-content:space-between;gap:6px}.sms-caption i{font-style:normal;color:#5d6c64}.sms-hint{color:#5d6c64;font:10px monospace}.sms-table{width:100%;border-collapse:collapse;font:10px monospace}.sms-table th,.sms-table td{padding:6px 5px;border-bottom:1px solid #203027;text-align:right;white-space:nowrap}.sms-table th:first-child,.sms-table td:first-child{text-align:left}.sms-table th{position:sticky;top:-16px;background:#09110e;color:#819289}.sms-table tr[data-verdict="60 fps"] td:last-child{color:#72dc89}.sms-table tr[data-verdict="30 fps"] td:last-child{color:#e3c66f}.sms-table tr[data-verdict="below 30 fps"] td:last-child{color:#ef8383}.sms-note{margin-top:10px!important;font:10px monospace!important;color:#718078!important}.sms-benchmark[hidden],.sms-explorer[hidden]{display:none}@media(max-width:700px){.sms-grid,.sms-fields{grid-template-columns:repeat(2,1fr)}.sms-panel{padding:13px}}`;

/**
 * NM_M ships UE2k4 material trees in glTF extras. The diffuse node is a
 * `CO_AlphaBlend_With_Mask` combiner whose mask is the base texture's own
 * alpha channel and whose second input is a per-garment dye colour:
 *
 *   rgb = mix(base, base * dye, base.a),  a = 1
 *
 * Nothing downstream of the loader knows about that, so the atlas received a
 * texture whose alpha was a dye mask rather than opacity, and every dyed
 * region rendered as flat untinted base colour. Fold the combiner into the
 * texture here, before Shado packs it, and hand the atlas an opaque image.
 */
async function bakeUe2DyeCombiners(
  scene: BABYLON.Scene,
  meshes: readonly BABYLON.Mesh[],
): Promise<{ textures: BABYLON.Texture[]; baked: number; skipped: string[] }> {
  const textures: BABYLON.Texture[] = [];
  const skipped: string[] = [];
  const seen = new Set<BABYLON.Material>();
  let baked = 0;

  for (const mesh of meshes) {
    const material = mesh.material as BABYLON.PBRMaterial | null;
    if (!material || seen.has(material)) continue;
    seen.add(material);

    const tree = material.metadata?.gltf?.extras?.UE2k4_MaterialTree;
    const diffuse = tree?.Diffuse;
    const source = material.albedoTexture as BABYLON.Texture | null;
    if (!diffuse || !source) continue;
    if (diffuse.className !== 'Combiner' || diffuse.CombineOperation !== 5) {
      skipped.push(`${material.name}: unsupported diffuse ${diffuse.className}/${diffuse.CombineOperation}`);
      continue;
    }
    const dye = diffuse.Material2?.className === 'ConstantColor' ? diffuse.Material2.Color : undefined;
    if (!dye) {
      skipped.push(`${material.name}: combiner second input is not a ConstantColor`);
      continue;
    }

    if (!source.isReady()) {
      await new Promise<void>(resolve => {
        if (!source.onLoadObservable?.addOnce?.(() => resolve())) resolve();
      });
    }
    const size = source.getSize();
    const pixels = (await source.readPixels()) as Uint8Array | null;
    if (!pixels || pixels.length !== size.width * size.height * 4) {
      skipped.push(
        `${material.name}: base texture readback returned ${pixels?.length ?? 'nothing'}` +
        ` for ${size.width}x${size.height}`
      );
      continue;
    }

    const dyeR = dye[0] / 255, dyeG = dye[1] / 255, dyeB = dye[2] / 255;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      // `InvertMask` is false across this catalog; honour it anyway.
      const raw = pixels[offset + 3] / 255;
      const mask = diffuse.InvertMask ? 1 - raw : raw;
      pixels[offset] = pixels[offset] * (1 - mask + mask * dyeR);
      pixels[offset + 1] = pixels[offset + 1] * (1 - mask + mask * dyeG);
      pixels[offset + 2] = pixels[offset + 2] * (1 - mask + mask * dyeB);
      pixels[offset + 3] = 255;
    }

    // invertY false keeps the readback byte layout, so the atlas' own
    // readPixels pass sees exactly the orientation it saw before.
    const dyed = new BABYLON.RawTexture(
      pixels, size.width, size.height,
      BABYLON.Engine.TEXTUREFORMAT_RGBA, scene,
      false, false, source.samplingMode,
      BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
    );
    dyed.name = `${source.name}_dyed`;
    dyed.wrapU = source.wrapU;
    dyed.wrapV = source.wrapV;
    material.albedoTexture = dyed;
    textures.push(dyed);
    baked++;
  }

  return { textures, baked, skipped };
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value ?? fallback) || fallback)));
}

function readCounts(params: URLSearchParams): number[] {
  const fallback = [1, 10, 25, 50, 100, 200, 400, 800, 1200];
  const parsed = params.get('counts')?.split(',').map(Number)
    .filter(value => Number.isFinite(value) && value > 0).map(Math.round);
  return [...new Set(parsed?.length ? parsed : fallback)].sort((a, b) => a - b).slice(0, 16);
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summarize(samples: number[]): FrameSummary {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    mean: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

async function fetchGzipJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function waitForFrames(
  scene: BABYLON.Scene,
  engineInstrumentation: EngineInstrumentation,
  frameCount: number,
  collect: boolean,
): Promise<{ frameMs: number[]; gpuMs: number[]; queueMs: number[] }> {
  return new Promise((resolve, reject) => {
    const frameMs: number[] = [];
    const gpuMs: number[] = [];
    const queueCompletion: Promise<number>[] = [];
    const engine = scene.getEngine();
    const deviceQueue = (engine as any)._device?.queue as GPUQueue | undefined;
    let frames = 0;
    const timeout = window.setTimeout(() => {
      engine.onEndFrameObservable.remove(observer);
      reject(new Error(`Timed out after ${frames}/${frameCount} benchmark frames`));
    }, Math.max(30_000, frameCount * 1_000));
    const observer = engine.onEndFrameObservable.add(() => {
      frames++;
      if (collect) {
        frameMs.push(engine.getDeltaTime());
        const gpuNanoseconds = engineInstrumentation.gpuFrameTimeCounter.current;
        if (gpuNanoseconds > 0) gpuMs.push(gpuNanoseconds / 1_000_000);
        if (deviceQueue?.onSubmittedWorkDone) {
          const submitted = performance.now();
          queueCompletion.push(
            deviceQueue.onSubmittedWorkDone()
              .then(() => performance.now() - submitted)
              .catch(() => Number.NaN)
          );
        }
      }
      if (frames < frameCount) return;
      window.clearTimeout(timeout);
      engine.onEndFrameObservable.remove(observer);
      void Promise.all(queueCompletion).then(queueMs => resolve({ frameMs, gpuMs, queueMs }));
    });
  });
}

/** What the active path actually exercises, spelled out under the title. */
const PATH_SUMMARY: Record<RenderPath, string> = {
  cached: 'module buckets · WebGPU compute pre-skin · resolved pose palette · one shared pose',
  hybrid: 'module buckets · per-actor clip and phase · shared DQ-VAT',
  supermesh: 'maximal-supermesh baseline · modules clipped after skinning · shared DQ-VAT',
  bat: 'captured baseline · per-actor modular meshes · shared matrix BAT',
  'bat-thin': 'captured baseline · thin-instanced module buckets · shared matrix BAT',
};

function createUi(
  quality: ShadoVatQualityTier,
  counts: number[],
  mode: 'explore' | 'benchmark',
  renderPath: RenderPath,
  downgraded: boolean,
) {
  const usesModules = renderPath !== 'supermesh';
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  const panel = document.createElement('section');
  panel.className = 'sms-panel';
  panel.innerHTML = `
    <div class="sms-head"><div><h1>NM_M ${renderPath} sandbox</h1><p>${PATH_SUMMARY[renderPath]}${downgraded ? ' · <b>cached needs WebGPU, running hybrid</b>' : ''}</p></div><span class="sms-badge" data-role="status">LOADING</span></div>
    <div class="sms-progress"><i data-role="bar"></i></div>
    <div class="sms-grid">
      <div class="sms-stat"><b data-role="actors">—</b><span>${mode === 'benchmark' ? 'tested' : 'spawned'} actors</span></div>
      <div class="sms-stat"><b data-role="limit60">—</b><span>60 fps limit</span></div>
      <div class="sms-stat"><b data-role="throughput">—</b><span>vertex throughput</span></div>
      <div class="sms-stat"><b data-role="amplification">${usesModules ? 'measuring' : '4.81×'}</b><span>${usesModules ? 'work reduction' : 'vertex amplification'}</span></div>
    </div>
    <div class="sms-actions"><label>Path <select data-role="path">${['bat','bat-thin','hybrid','cached','supermesh'].map(value => `<option${value === renderPath ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>VAT <select data-role="quality"${renderPath.startsWith('bat') ? ' disabled' : ''}>${['full','medium','low','rigid'].map(value => `<option${value === quality ? ' selected' : ''}>${value}</option>`).join('')}</select></label><a data-role="mode-link" href="?renderer=babylonjs&model=${MODEL_ID}&path=${renderPath}&mode=${mode === 'benchmark' && !renderPath.startsWith('bat') ? 'explore' : 'benchmark'}">${mode === 'benchmark' && !renderPath.startsWith('bat') ? 'Open actor editor' : 'Run benchmark'}</a><a href="/shado/supermesh/hybrid-preskin-performance-report.json">Size/speed report</a></div>
    <section class="sms-explorer"${mode === 'explore' ? '' : ' hidden'}>
      <h2>Dynamic actors</h2>
      <div class="sms-actions"><label>Population <input data-role="population" type="number" min="1" max="20000" value="5"></label><button data-role="set-population">Set</button><button data-role="spawn-next">Spawn composed</button><button data-role="spawn-random">Spawn random</button><button data-role="clone">Clone target</button><button data-role="remove">Remove target</button></div>
      <h2>Target instance</h2>
      <div class="sms-actions"><button data-role="prev-target" title="Previous actor">◀</button><select data-role="target" aria-label="Target instance"></select><button data-role="next-target" title="Next actor">▶</button><select data-role="preset" aria-label="Captured preset"><option value="">Captured preset…</option>${CAPTURED_PRESETS.map(preset => `<option value="${preset.id}">${preset.id}</option>`).join('')}</select><select data-role="clip" aria-label="Animation clip"></select></div>
      <h2>Mesh configuration</h2>
      <div class="sms-actions"><button data-role="randomize">Randomize target</button><button data-role="randomize-all">Randomize all</button><button data-role="reset-slots">Reset target</button><button data-role="copy-to-all">Copy target to all</button></div>
      <div class="sms-fields" data-role="published-fields"></div>
      <p class="sms-note"><span class="sms-hint">Click an actor to select it · ◀ ▶ or [ ] steps the target · , . steps every slot</span><br>Selectors are discovered from this asset's body-part catalog and drive Shado published fields on the target actor. No Cartesian-product records are stored.</p>
    </section>
    <section class="sms-benchmark"${mode === 'benchmark' ? '' : ' hidden'}>
      <div class="sms-actions"><button data-role="rerun">Run again</button><button data-role="download" disabled>Download JSON</button></div>
      <table class="sms-table"><thead><tr><th>actors</th><th>M verts/frame</th><th>mean ms</th><th>p95 ms</th><th>GPU/queue ms</th><th>arena MiB</th><th>result</th></tr></thead><tbody data-role="rows"></tbody></table>
      <p class="sms-note">Counts: ${counts.join(' → ')}. Stops after two levels exceed 50 ms p95. ${renderPath === 'bat' ? 'Captured baseline: six selected modular meshes per actor, independent clips/phases, two weights and eight matrix-BAT reads per vertex.' : renderPath === 'bat-thin' ? 'Same matrix BAT and independent poses, grouped into one thin-instance draw per populated module variation.' : renderPath === 'cached' ? 'Module buckets are deformed once by compute per shared pose, then rigid-instanced — every actor holds the same pose by construction.' : usesModules ? 'Module buckets submit only selected parts; each actor animates from its own clip and phase.' : 'Hidden modules are clipped after VAT skinning, so they still consume vertex work.'}</p>
    </section>`;
  document.head.append(style);
  document.body.append(panel);
  const hidden = new URLSearchParams(location.search).get('ui') === '0';
  if (hidden) panel.hidden = true;
  const modal = hidden
    ? undefined
    : installMobilePanelModal(panel, { label: 'NM_M controls', openLabel: '☰ Controls' });
  const role = <T extends HTMLElement>(name: string) => panel.querySelector<T>(`[data-role="${name}"]`)!;
  role<HTMLSelectElement>('quality').addEventListener('change', event => {
    const url = new URL(location.href);
    url.searchParams.set('quality', (event.target as HTMLSelectElement).value);
    location.href = url.href;
  });
  role<HTMLSelectElement>('path').addEventListener('change', event => {
    const url = new URL(location.href);
    const value = (event.target as HTMLSelectElement).value;
    url.searchParams.set('path', value);
    if (value.startsWith('bat')) url.searchParams.set('mode', 'benchmark');
    location.href = url.href;
  });
  role<HTMLButtonElement>('rerun')?.addEventListener('click', () => location.reload());
  return { style, panel, role, modal };
}

function permutationSelections(permutation: number): number[] {
  let remaining = ((Math.round(permutation) % PERMUTATION_COUNT) + PERMUTATION_COUNT) % PERMUTATION_COUNT;
  return MODULE_FIELDS.map(field => {
    const value = remaining % field.values.length;
    remaining = Math.floor(remaining / field.values.length);
    return value;
  });
}

function actorSelections(actor: SupermeshScaleActor): number[] {
  return MODULE_FIELDS.map(field => Math.round(actor[field.property]));
}

function setActorSelections(actor: SupermeshScaleActor, selections: readonly number[]) {
  MODULE_FIELDS.forEach((field, index) => {
    actor[field.property] = Math.max(0, Math.min(field.values.length - 1, selections[index] ?? 0));
  });
}

function randomSelections() {
  return MODULE_FIELDS.map(field => Math.floor(Math.random() * field.values.length));
}

export class SupermeshScalePlayground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement,
  ): Promise<BABYLON.Scene> {
    const params = new URLSearchParams(location.search);
    const requestedQuality = params.get('quality');
    const quality: ShadoVatQualityTier =
      requestedQuality === 'medium' || requestedQuality === 'low' || requestedQuality === 'rigid'
        ? requestedQuality : 'full';
    const mode = params.get('mode') === 'benchmark' ? 'benchmark' : 'explore';
    const requestedPath = params.get('path');
    // Default to the newest path the active backend can actually run, so the
    // route exercises the module buckets and — on WebGPU — the compute
    // pre-skin cache and resolved pose palette without needing a query string.
    // `supermesh` stays reachable as the explicit maximal-supermesh baseline.
    const defaultPath: RenderPath = engine.isWebGPU ? 'cached' : 'hybrid';
    const explicitPath = requestedPath === 'bat' || requestedPath === 'bat-thin'
      || requestedPath === 'hybrid' || requestedPath === 'cached' || requestedPath === 'supermesh'
      ? requestedPath as RenderPath : undefined;
    // The footer can switch the engine underneath a saved `path=cached` URL;
    // degrade instead of dead-ending on "webgpu-preskin requires WebGPU".
    const downgraded = explicitPath === 'cached' && !engine.isWebGPU;
    const renderPath: RenderPath = downgraded ? 'hybrid' : explicitPath ?? defaultPath;
    if (downgraded) {
      console.warn('[supermesh] path=cached needs WebGPU; running the hybrid module path instead.');
    }
    const usesHybridModules = renderPath === 'hybrid' || renderPath === 'cached';
    const usesModules = renderPath !== 'supermesh';
    const counts = readCounts(params);
    const warmupFrames = boundedInteger(params.get('warmup'), 20, 2, 240);
    const sampleFrames = boundedInteger(params.get('frames'), 60, 10, 600);
    const ui = createUi(quality, counts, mode, renderPath, downgraded);
    window.__shadoSupermeshScale = { status: 'loading' };

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#07100cff');
    const camera = new BABYLON.ArcRotateCamera(
      'supermesh-scale-camera', -Math.PI / 2, 0.92, 70,
      new BABYLON.Vector3(0, 1.4, 0), scene,
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 180;
    new BABYLON.HemisphericLight('scale-fill', new BABYLON.Vector3(0.2, 1, -0.1), scene).intensity = 1.2;

    const instrumentation = new EngineInstrumentation(engine);
    instrumentation.captureGPUFrameTime = true;
    let container: ShadoInstanceContainer<SupermeshScaleActor> | undefined;
    let hybridAttachment: ShadoHybridModuleAttachment | undefined;
    let batBaseline: ModularBatBaseline | undefined;
    let thinBatBaseline: ThinModularBatBaseline | undefined;
    let dyedTextures: BABYLON.Texture[] = [];
    let shadoMesh: BABYLON.Mesh | undefined;

    queueMicrotask(async () => {
      try {
        const needsVatPixels = renderPath !== 'bat' && renderPath !== 'bat-thin';
        // Prefer the binary .svat container; fall back to the legacy
        // index.json.gz + bin.gz pair when it has not been generated yet
        // (sandbox/scripts/build-supermesh-svat.mjs).
        const svatBytes = needsVatPixels
          ? await fetchShadoBytes('/shado/supermesh/NM_M.full.vat16.svat').catch(() => undefined)
          : undefined;
        const useSvat = !!svatBytes && isSvatContainer(svatBytes);

        const [manifestResponse, vat, vatPixelBytes] = await Promise.all([
          fetch('/shado/supermesh/supermesh-manifest.json'),
          useSvat
            ? Promise.resolve<any>(undefined)
            : fetchGzipJson<any>('/shado/supermesh/NM_M.full.vat16.index.json.gz'),
          useSvat || !needsVatPixels
            ? Promise.resolve<Uint8Array | undefined>(undefined)
            : fetchShadoBytes('/shado/supermesh/NM_M.full.vat16.bin.gz'),
        ]);
        if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
        const manifest = await manifestResponse.json() as AssetManifest;
        if (manifest.model !== MODEL_ID || manifest.composition?.model !== 'slot-variation-catalog') {
          throw new Error(`Expected the ${MODEL_ID} slot-variation catalog`);
        }
        if (manifest.composition.storedGeneratedPermutations !== 0) {
          throw new Error('Supermesh manifest must not store Cartesian-product combinations');
        }
        if (manifest.composition.slots.length !== MODULE_FIELDS.length ||
            manifest.composition.possibleCombinations !== PERMUTATION_COUNT) {
          throw new Error('Discovered body-part catalog does not match the exact NM_M actor schema');
        }
        manifest.composition.slots.forEach((slot, index) => {
          const expected = MODULE_FIELDS[index];
          const discovered = slot.variations.map(variation => variation.id);
          if (!expected || slot.id !== manifest.slotOrder[index] || slot.field !== expected.name ||
              slot.property !== expected.property || slot.query !== expected.query ||
              discovered.join('\0') !== expected.values.join('\0')) {
            throw new Error(`Published actor schema does not match discovered slot ${slot.id}`);
          }
        });
        if (!useSvat && !renderPath.startsWith('bat') &&
            (vat.data?.encoding !== 'raw-gzip' || vatPixelBytes?.byteLength !== vat.data.byteLength)) {
          throw new Error('Full VAT binary does not match its published index');
        }
        const packedVat = useSvat
          ? await decodeSvat(svatBytes!, { decompress: createSvatDecompressor() })
          : vatPixelBytes ? {
              ...vat,
              pixels: vat.componentType === 'float16'
                ? new Uint16Array(vatPixelBytes)
                : new Float32Array(vatPixelBytes),
            } : undefined;
        // Clip/bone metadata, whichever source supplied it.
        const vatMeta = (packedVat ?? vat) as {
          bones: number;
          framesTotal: number;
          clips: BatClip[];
        };
        if (packedVat) {
          console.info(
            `[supermesh] VAT source: ${useSvat ? '.svat container' : 'legacy index+bin pair'}`,
            `${packedVat.bones} bones, ${packedVat.framesTotal} frames, ${packedVat.clips.length} clips`,
          );
        }
        const geometryBytes = await fetchShadoBytes('/shado/supermesh/NM_M_supermesh.static.glb.gz');
        const geometryUrl = URL.createObjectURL(new Blob([geometryBytes], { type: 'model/gltf-binary' }));
        let imported: BABYLON.AssetContainer;
        try {
          imported = await BABYLON.LoadAssetContainerAsync(geometryUrl, scene, { pluginExtension: '.glb' });
          for (const mesh of imported.meshes) {
            if (mesh.getTotalVertices() > 0) mesh.setEnabled(false);
          }
          imported.addAllToScene();
        } finally {
          URL.revokeObjectURL(geometryUrl);
        }
        const sourceMeshes = imported.meshes.filter(mesh => mesh.getTotalVertices() > 0) as BABYLON.Mesh[];
        const dye = await bakeUe2DyeCombiners(scene, sourceMeshes);
        dyedTextures = dye.textures;
        console.info(
          `[supermesh] UE2k4 dye combiners baked into ${dye.baked} base textures`,
          dye.skipped.length ? dye.skipped : '',
        );
        for (const module of manifest.modules) {
          for (let primitive = 0; primitive < module.primitiveCount; primitive++) {
            const mesh = sourceMeshes[module.primitiveStart + primitive];
            const codes = new Float32Array(mesh.getTotalVertices());
            codes.fill(module.code);
            mesh.setVerticesData('aWeapon', codes, false, 1);
          }
        }

        const ContainerType = usesModules
          ? HybridSupermeshScaleContainer
          : SupermeshScaleContainer;
        const initialized = await ContainerType.initialize(engine, {
          backend: engine.isWebGPU ? 'storage' : 'datatex',
          extra: SupermeshScaleActor,
          wasm: false,
        });
        if (!initialized) throw new Error('Shado initialization failed');
        container = new ContainerType(engine);
        let totalVertices: number;
        const batModules = manifest.modules.map(module => ({
          name: module.name,
          slotIndex: module.slotIndex,
          variation: module.variation,
          meshes: sourceMeshes.slice(
            module.primitiveStart,
            module.primitiveStart + module.primitiveCount,
          ),
        }));
        if (renderPath === 'bat') {
          batBaseline = await ModularBatBaseline.Create(
            scene,
            batModules,
            vatMeta.clips,
          );
          totalVertices = sourceMeshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
        } else if (renderPath === 'bat-thin') {
          thinBatBaseline = await ThinModularBatBaseline.Create(
            scene,
            batModules,
            vatMeta.clips,
          );
          totalVertices = sourceMeshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
        } else if (usesHybridModules) {
          const moduleSpecs = manifest.modules.map(module => {
            const field = MODULE_FIELDS[module.slotIndex];
            if (!field) throw new Error(`Module ${module.name} has an unknown slot index`);
            return {
              id: module.name,
              meshes: sourceMeshes.slice(
                module.primitiveStart,
                module.primitiveStart + module.primitiveCount
              ),
              isSelected: (actor: SupermeshScaleActor) =>
                Math.round(actor[field.property]) === module.variation,
            };
          });
          hybridAttachment = await container.attachHybridModules(
            scene,
            moduleSpecs,
            imported.skeletons[0],
            {
              packedVat: packedVat!,
              vatQuality: quality,
              sharedClip: params.get('clip') ?? manifest.animation.clips[0],
              deformation: renderPath === 'cached' ? 'webgpu-preskin' : 'vertex-vat',
            }
          );
          totalVertices = hybridAttachment.getStats().sourceModuleVertices;
          // Any module owner works as a pick reference: the picker tests actor
          // transforms against a sphere, not this mesh's triangles.
          shadoMesh = hybridAttachment.meshes.values().next().value as BABYLON.Mesh | undefined;
        } else {
          const material = await container.attachMeshes(scene, sourceMeshes, imported.skeletons[0], {
            merge: true,
            replaceMaterial: true,
            disposeOriginalMaterial: false,
            packedVat: packedVat!,
            vatQuality: quality,
          });
          const attachedMesh = scene.meshes.find(mesh => mesh.material === material);
          if (!attachedMesh) throw new Error('Merged Shado mesh was not created');
          totalVertices = attachedMesh.getTotalVertices();
          shadoMesh = attachedMesh as BABYLON.Mesh;
        }
        // Dev handle for poking at the live scene from the console.
        (window as any).__supermeshDebug = {
          scene, camera, container, hybridAttachment, imported, sourceMeshes, manifest,
        };
        const selectedVertices = 1772;
        const variationCounts = manifest.slotOrder.map(slot =>
          manifest.modules.filter(module => module.slot === slot).length);
        const actorStrideBytes = container.getStructArrayStrideBytes('instances');
        const exploreCount = boundedInteger(params.get('count'), CAPTURED_PRESETS.length, 1, MAX_EXPLORER_ACTORS);
        const maxCount = mode === 'benchmark' ? counts.at(-1)! : exploreCount;
        const maxRadius = Math.max(6, Math.sqrt(maxCount) * 1.15);
        camera.radius = Math.max(14, maxRadius * 2.25);

        const caps = engine.getCaps() as any;
        const maxTextureSize = Number(caps.maxTextureSize ?? 0);
        const deviceLimits = (engine as any)._device?.limits;
        const maxStorageBytes = Number(deviceLimits?.maxStorageBufferBindingSize ?? 0);
        const dataTextureActorCeiling = maxTextureSize
          ? Math.floor((2048 * maxTextureSize * 4 * 4) / actorStrideBytes) : undefined;
        const storageActorCeiling = maxStorageBytes
          ? Math.floor(maxStorageBytes / actorStrideBytes) : undefined;
        const structuralLimits = {
          actorStrideBytes,
          shaderSelectableSlots: 6,
          actorFieldSlotCapacity: 8,
          variationsPerSlotWithCurrentEncoding: 16,
          modulesWithCurrentSixSlotShader: 96,
          modulesWithEightActorFieldSlots: 128,
          maxTextureSize,
          dataTextureActorCeiling,
          maxVisibleIndicesInDataTexture: maxTextureSize ? 2048 * maxTextureSize * 4 : undefined,
          maxStorageBufferBindingBytes: maxStorageBytes || undefined,
          storageActorCeiling,
          maxVatFramesAtCurrentBoneWidth: maxTextureSize || undefined,
          maxVatBonesAtTwoTexelsPerBone: maxTextureSize ? Math.floor(maxTextureSize / 2) : undefined,
          maxVertexAttributes: Number(caps.maxVertexAttribs ?? caps.maxVertexAttributes ?? 0) || undefined,
        };

        if (mode === 'explore') {
          if (renderPath.startsWith('bat')) {
            throw new Error('The modular BAT paths are benchmark-only; select hybrid or cached for the actor editor.');
          }
          let selectedIndex = boundedInteger(params.get('target'), 0, 0, exploreCount - 1);
          let nextPermutation = boundedInteger(params.get('permutation'), exploreCount, 0, PERMUTATION_COUNT - 1);
          const clipByActor = new Map<SupermeshScaleActor, string>();
          const population = ui.role<HTMLInputElement>('population');
          const target = ui.role<HTMLSelectElement>('target');
          const preset = ui.role<HTMLSelectElement>('preset');
          const clip = ui.role<HTMLSelectElement>('clip');
          const fields = ui.role<HTMLElement>('published-fields');

          clip.replaceChildren(...manifest.animation.clips.map(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            return option;
          }));

          // Selection ring, matching the Lite showcase's picked-instance marker.
          const selectionRing = BABYLON.MeshBuilder.CreateTorus('supermesh-selected-instance', {
            diameter: 1.5,
            thickness: 0.07,
            tessellation: 56,
          }, scene);
          const ringMaterial = new BABYLON.StandardMaterial('supermesh-selected-instance-mat', scene);
          ringMaterial.diffuseColor = new BABYLON.Color3(1, 0.35, 0.03);
          ringMaterial.emissiveColor = new BABYLON.Color3(1, 0.18, 0.01);
          ringMaterial.specularColor = BABYLON.Color3.Black();
          ringMaterial.disableLighting = true;
          selectionRing.material = ringMaterial;
          selectionRing.isPickable = false;
          selectionRing.alwaysSelectAsActiveMesh = true;
          const placeRing = () => {
            const actor = container!.children[selectedIndex];
            selectionRing.setEnabled(!!actor);
            if (!actor) return;
            selectionRing.position.set(actor.translation[0], 0.02, actor.translation[2]);
          };

          const layoutActors = () => {
            const count = container!.instanceCount;
            const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
            const spacing = 2.2;
            container!.children.forEach((actor, index) => {
              const x = (index % columns - (columns - 1) / 2) * spacing;
              const z = (Math.floor(index / columns) - (Math.ceil(count / columns) - 1) / 2) * spacing;
              actor.translation.set([x, 0, z, 1]);
              actor.color.set([1, 1, 1, 1]);
              actor.emitHeaderDirty();
            });
            container!.applyVisibilityReduction(Uint32Array.from({ length: count }, (_, index) => index));
            const hybridStats = hybridAttachment?.refresh();
            if (hybridStats) {
              ui.role('amplification').textContent = `${hybridStats.vertexWorkReduction.toFixed(2)}×`;
            }
            camera.radius = Math.max(10, Math.sqrt(count) * 3.2);
            population.value = String(count);
            ui.role('actors').textContent = count.toLocaleString();
            placeRing();
          };

          // `cached` deforms the module library once per pose, so its cohort
          // genuinely has to hold one pose; every other path animates per actor.
          const sharedPose = hybridAttachment?.getStats().poses === 'shared';

          const setClip = (actor: SupermeshScaleActor, name: string) => {
            const index = container!.children.indexOf(actor);
            const resolved = manifest.animation.clips.includes(name) ? name : manifest.animation.clips[0];
            if (sharedPose) {
              hybridAttachment!.setSharedClip(resolved, 1, 0);
              for (const child of container!.children) clipByActor.set(child, resolved);
            } else {
              clipByActor.set(actor, resolved);
              container!.setInstanceClip(index, resolved, 1, (index % 31) / 31);
            }
          };

          const spawn = (selections: readonly number[], clipName?: string, updateLayout = true) => {
            const actor = container!.addInstance(false, `NM_M permutation ${container!.instanceCount + 1}`);
            setActorSelections(actor, selections);
            setClip(actor, clipName ?? (sharedPose
              ? manifest.animation.clips[0]
              : manifest.animation.clips[container!.instanceCount % manifest.animation.clips.length]));
            if (updateLayout) layoutActors();
            return actor;
          };

          const writeUrl = () => {
            const actor = container!.children[selectedIndex];
            if (!actor) return;
            const url = new URL(location.href);
            url.searchParams.set('renderer', 'babylonjs');
            url.searchParams.set('model', MODEL_ID);
            url.searchParams.set('path', renderPath);
            url.searchParams.set('mode', 'explore');
            url.searchParams.set('count', String(container!.instanceCount));
            url.searchParams.set('target', String(selectedIndex));
            url.searchParams.set('clip', clipByActor.get(actor) ?? manifest.animation.clips[0]);
            for (const slot of manifest.composition.slots) {
              url.searchParams.set(slot.query, String(actor.published.$get(slot.field)));
            }
            url.searchParams.delete('preset');
            url.searchParams.delete('permutation');
            window.history.replaceState(null, '', url);
          };

          const renderTarget = (updateUrl = true) => {
            selectedIndex = Math.max(0, Math.min(container!.instanceCount - 1, selectedIndex));
            target.replaceChildren(...container!.children.map((actor, index) => {
              const option = document.createElement('option');
              option.value = String(index);
              option.textContent = `Actor #${index + 1} · ${actorSelections(actor).join('/')}`;
              option.selected = index === selectedIndex;
              return option;
            }));
            const actor = container!.children[selectedIndex];
            if (!actor) return;
            clip.value = clipByActor.get(actor) ?? manifest.animation.clips[0];
            fields.replaceChildren(...actor.published.$describe().map(property => {
              const slot = manifest.composition.slots.find(candidate => candidate.field === property.name);
              if (!slot) throw new Error(`No discovered body-part slot for ${property.name}`);
              const slotIndex = MODULE_FIELDS.findIndex(field => field.name === property.name);
              const current = Math.round(actor[MODULE_FIELDS[slotIndex].property]);
              const label = document.createElement('label');
              const caption = document.createElement('span');
              caption.className = 'sms-caption';
              const name = document.createElement('b');
              name.textContent = slot.label;
              const position = document.createElement('i');
              position.textContent = `${current + 1}/${slot.variations.length}`;
              caption.append(name, position);
              const row = document.createElement('div');
              row.className = 'sms-slot';
              const select = document.createElement('select');
              select.dataset.published = property.name;
              for (const variation of slot.variations) {
                const option = document.createElement('option');
                option.value = JSON.stringify(variation.id);
                option.textContent = variation.id;
                option.title = variation.source;
                option.selected = variation.id === actor.published.$get(property.name);
                select.append(option);
              }
              select.onchange = () => {
                actor.published.$set(property.name, JSON.parse(select.value));
                commitSelection();
              };
              const step = (delta: number) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = delta < 0 ? '◀' : '▶';
                button.title = `${delta < 0 ? 'Previous' : 'Next'} ${slot.label.toLowerCase()}`;
                button.disabled = slot.variations.length < 2;
                button.onclick = () => { stepSlot(slotIndex, delta); };
                return button;
              };
              row.append(step(-1), select, step(1));
              label.append(caption, row);
              return label;
            }));
            if (updateUrl) writeUrl();
          };

          /** Every slot edit lands here: refresh buckets, drop the preset, redraw. */
          const commitSelection = () => {
            hybridAttachment?.refresh();
            preset.value = '';
            renderTarget();
          };

          const stepSlot = (slotIndex: number, delta: number) => {
            const actor = container!.children[selectedIndex];
            const field = MODULE_FIELDS[slotIndex];
            if (!actor || !field) return;
            const count = field.values.length;
            actor[field.property] = (Math.round(actor[field.property]) + delta + count) % count;
            commitSelection();
          };

          const stepAllSlots = (delta: number) => {
            const actor = container!.children[selectedIndex];
            if (!actor) return;
            for (const field of MODULE_FIELDS) {
              const count = field.values.length;
              if (count > 1) actor[field.property] = (Math.round(actor[field.property]) + delta + count) % count;
            }
            commitSelection();
          };

          const selectIndex = (index: number) => {
            if (index < 0 || index >= container!.instanceCount) return;
            selectedIndex = index;
            preset.value = '';
            placeRing();
            renderTarget();
          };

          const presetFromQuery = CAPTURED_PRESETS.find(entry => entry.id === params.get('preset'));
          const baseSelections = presetFromQuery?.selections ?? permutationSelections(Number(params.get('permutation') ?? 0));
          const querySelections = manifest.composition.slots.map((slot, index) => {
            const requested = params.get(slot.query);
            if (requested === null) return baseSelections[index];
            const exact = slot.variations.findIndex(variation => variation.id === requested);
            if (exact >= 0) return exact;
            return boundedInteger(requested, baseSelections[index], 0, slot.variations.length - 1);
          });
          for (let index = 0; index < exploreCount; index++) {
            const captured = CAPTURED_PRESETS[index];
            spawn(captured?.selections ?? permutationSelections(index), captured?.clip, false);
          }
          layoutActors();
          const selectedActor = container.children[selectedIndex];
          setActorSelections(selectedActor, querySelections);
          hybridAttachment?.refresh();
          setClip(selectedActor, params.get('clip') ?? presetFromQuery?.clip ?? clipByActor.get(selectedActor)!);

          target.onchange = () => { selectIndex(Number(target.value)); };
          ui.role<HTMLButtonElement>('prev-target').onclick = () => { selectIndex(selectedIndex - 1); };
          ui.role<HTMLButtonElement>('next-target').onclick = () => { selectIndex(selectedIndex + 1); };
          clip.onchange = () => { setClip(container!.children[selectedIndex], clip.value); preset.value = ''; writeUrl(); };
          preset.onchange = () => {
            const selected = CAPTURED_PRESETS.find(entry => entry.id === preset.value);
            if (!selected) return;
            setActorSelections(container!.children[selectedIndex], selected.selections);
            hybridAttachment?.refresh();
            setClip(container!.children[selectedIndex], selected.clip);
            renderTarget();
          };
          ui.role<HTMLButtonElement>('randomize').onclick = () => {
            setActorSelections(container!.children[selectedIndex], randomSelections());
            commitSelection();
          };
          ui.role<HTMLButtonElement>('randomize-all').onclick = () => {
            for (const actor of container!.children) setActorSelections(actor, randomSelections());
            commitSelection();
          };
          ui.role<HTMLButtonElement>('reset-slots').onclick = () => {
            setActorSelections(container!.children[selectedIndex], MODULE_FIELDS.map(() => 0));
            commitSelection();
          };
          ui.role<HTMLButtonElement>('copy-to-all').onclick = () => {
            const selections = actorSelections(container!.children[selectedIndex]);
            for (const actor of container!.children) setActorSelections(actor, selections);
            commitSelection();
          };
          ui.role<HTMLButtonElement>('spawn-next').onclick = () => {
            if (container!.instanceCount >= MAX_EXPLORER_ACTORS) return;
            selectedIndex = container!.instanceCount;
            spawn(permutationSelections(nextPermutation++));
            renderTarget();
          };
          ui.role<HTMLButtonElement>('spawn-random').onclick = () => {
            if (container!.instanceCount >= MAX_EXPLORER_ACTORS) return;
            selectedIndex = container!.instanceCount;
            spawn(randomSelections());
            renderTarget();
          };
          ui.role<HTMLButtonElement>('clone').onclick = () => {
            if (container!.instanceCount >= MAX_EXPLORER_ACTORS) return;
            const source = container!.children[selectedIndex];
            selectedIndex = container!.instanceCount;
            spawn(actorSelections(source), clipByActor.get(source));
            renderTarget();
          };
          ui.role<HTMLButtonElement>('remove').onclick = () => {
            if (container!.instanceCount <= 1) return;
            const removed = container!.children[selectedIndex];
            clipByActor.delete(removed);
            container!.removeInstance(selectedIndex);
            selectedIndex = Math.min(selectedIndex, container!.instanceCount - 1);
            layoutActors();
            renderTarget();
          };
          ui.role<HTMLButtonElement>('set-population').onclick = () => {
            const requested = boundedInteger(population.value, container!.instanceCount, 1, MAX_EXPLORER_ACTORS);
            while (container!.instanceCount < requested) spawn(permutationSelections(nextPermutation++), undefined, false);
            while (container!.instanceCount > requested) {
              const removed = container!.children.at(-1)!;
              clipByActor.delete(removed);
              container!.removeInstance(container!.instanceCount - 1);
            }
            selectedIndex = Math.min(selectedIndex, requested - 1);
            layoutActors();
            renderTarget();
          };

          // Click-to-select in the viewport. Shado draws every actor from one
          // instanced mesh, so this is a CPU sphere test against actor
          // transforms rather than a Babylon scene pick.
          const pickMesh = shadoMesh;
          const onPointerUp = (event: PointerEvent) => {
            if (event.button !== 0 || !pickMesh) return;
            const rect = canvas.getBoundingClientRect();
            void pickShadoInstanceAtPointer(
              scene,
              pickMesh,
              container as ShadoInstanceContainer<SupermeshScaleActor>,
              event.clientX - rect.left,
              event.clientY - rect.top,
              { radius: 1.1 },
            ).then(result => {
              if (!result) return;
              selectIndex(result.index);
            });
          };
          canvas.addEventListener('pointerup', onPointerUp);

          const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
            if (event.key === '[') selectIndex(selectedIndex - 1);
            else if (event.key === ']') selectIndex(selectedIndex + 1);
            else if (event.key === ',') stepAllSlots(-1);
            else if (event.key === '.') stepAllSlots(1);
            else return;
            event.preventDefault();
          };
          window.addEventListener('keydown', onKeyDown);
          scene.onDisposeObservable.add(() => {
            canvas.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('keydown', onKeyDown);
          });

          ui.role('status').textContent = `READY · ${quality.toUpperCase()}`;
          ui.role('bar').style.width = '100%';
          ui.role('limit60').textContent = 'run test';
          ui.role('throughput').textContent = 'editor';
          if (usesHybridModules) {
            const hybridStats = hybridAttachment!.refresh();
            ui.role('amplification').textContent = `${hybridStats.vertexWorkReduction.toFixed(2)}×`;
          }
          renderTarget();
          window.__shadoSupermeshScale = {
            status: 'passed',
            progress: `${container.instanceCount} editable actors · ${manifest.composition.slots.length} discovered body-part slots`,
          };
          return;
        }

        // Only the pre-skin cohort holds one pose; every other path gives each
        // actor its own clip and phase so the sweep measures a varied population.
        const benchPerActorPose = renderPath === 'supermesh'
          || hybridAttachment?.getStats().poses === 'per-actor';
        const rows: SweepRow[] = [];
        let allocated = 0;
        let consecutiveSlow = 0;
        window.__shadoSupermeshScale = { status: 'running', progress: 'starting sweep' };
        ui.role('status').textContent = `RUNNING · ${quality.toUpperCase()}`;

        for (let countIndex = 0; countIndex < counts.length; countIndex++) {
          const actorCount = counts[countIndex];
          const addStarted = performance.now();
          const added = container.addInstances(actorCount - allocated, undefined, { playRandomAnimation: false });
          added.forEach((actor, offset) => {
            const index = allocated + offset;
            const angle = index * 2.399963;
            const radius = maxRadius * Math.sqrt((index + 0.5) / maxCount);
            actor.translation.set([Math.cos(angle) * radius, 0, Math.sin(angle) * radius, 1]);
            actor.color.set([1, 1, 1, 1]);
            const selections = variationCounts.map((variations, slot) =>
              variations ? (index * (slot * 2 + 3) + slot) % variations : 0);
            setActorSelections(actor, selections);
            actor.emitHeaderDirty();
            if (renderPath === 'bat') {
              batBaseline!.addActor(
                index,
                selections,
                new BABYLON.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
              );
            } else if (renderPath === 'bat-thin') {
              thinBatBaseline!.addActor(
                index,
                selections,
                new BABYLON.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
              );
            }
            if (benchPerActorPose) {
              container!.setInstanceClip(
                index,
                manifest.animation.clips[index % manifest.animation.clips.length],
                1,
                (index % 31) / 31
              );
            }
          });
          allocated = actorCount;
          container.applyVisibilityReduction(Uint32Array.from({ length: actorCount }, (_, index) => index));
          const hybridStats = hybridAttachment?.refresh();
          const batStats: ModularBatStats | undefined = batBaseline?.getStats();
          const thinBatStats: ThinModularBatStats | undefined = thinBatBaseline?.refresh();
          if (hybridStats) {
            ui.role('amplification').textContent = `${hybridStats.vertexWorkReduction.toFixed(2)}×`;
          }
          const addActorsMs = performance.now() - addStarted;
          ui.role('actors').textContent = actorCount.toLocaleString();
          ui.role('bar').style.width = `${((countIndex + 0.15) / counts.length) * 100}%`;
          window.__shadoSupermeshScale = { status: 'running', progress: `${actorCount} actors` };

          await waitForFrames(scene, instrumentation, warmupFrames, false);
          const samples = await waitForFrames(scene, instrumentation, sampleFrames, true);
          const frameMs = summarize(samples.frameMs);
          const gpuMs = samples.gpuMs.length ? summarize(samples.gpuMs) : undefined;
          const queueCompletionMs = samples.queueMs.length
            ? summarize(samples.queueMs) : undefined;
          const verdict = frameMs.p95 <= 16.67 ? '60 fps'
            : frameMs.p95 <= 33.34 ? '30 fps' : 'below 30 fps';
          const row: SweepRow = {
            actors: actorCount,
            addActorsMs,
            verticesPerFrame: thinBatStats?.submittedVertices ?? batStats?.submittedVertices ?? hybridStats?.submittedVertices ?? actorCount * totalVertices,
            selectedVerticesPerFrame: thinBatStats?.submittedVertices ?? batStats?.submittedVertices ?? hybridStats?.submittedVertices ?? actorCount * selectedVertices,
            vertexWorkAmplification: usesModules
              ? hybridStats?.vertexWorkReduction ?? 1
              : totalVertices / selectedVertices,
            frameMs,
            gpuMs,
            queueCompletionMs,
            meanFps: 1000 / Math.max(0.001, frameMs.mean),
            vertexThroughputPerSecond: (thinBatStats?.submittedVertices ?? batStats?.submittedVertices ?? hybridStats?.submittedVertices ?? actorCount * totalVertices) *
              1000 / Math.max(0.001, frameMs.mean),
            actorArenaMiB: container.prepareUnifiedForUpload().byteLength / 1024 / 1024,
            drawCalls: thinBatStats?.drawCalls ?? batStats?.drawCalls,
            duplicatedGeometryMiB: batStats ? batStats.duplicatedGeometryBytes / 1024 / 1024 : undefined,
            sharedGeometryMiB: thinBatStats ? thinBatStats.sharedGeometryBytes / 1024 / 1024 : undefined,
            instanceBufferMiB: thinBatStats ? thinBatStats.instanceBufferBytes / 1024 / 1024 : undefined,
            populatedModuleBuckets: thinBatStats?.populatedModuleBuckets,
            actualThinInstances: thinBatStats?.actualThinInstances,
            verdict,
          };
          rows.push(row);
          const tr = document.createElement('tr');
          tr.dataset.verdict = verdict;
          const gpuOrQueue = gpuMs ?? queueCompletionMs;
          tr.innerHTML = `<td>${actorCount.toLocaleString()}</td><td>${(row.verticesPerFrame / 1e6).toFixed(2)}</td><td>${frameMs.mean.toFixed(2)}</td><td>${frameMs.p95.toFixed(2)}</td><td>${gpuOrQueue ? gpuOrQueue.mean.toFixed(2) : 'n/a'}</td><td>${row.actorArenaMiB.toFixed(2)}</td><td>${verdict}</td>`;
          ui.role('rows').append(tr);
          ui.role('bar').style.width = `${((countIndex + 1) / counts.length) * 100}%`;
          consecutiveSlow = frameMs.p95 > 50 ? consecutiveSlow + 1 : 0;
          if (consecutiveSlow >= 2) break;
        }

        const at60 = rows.filter(row => row.frameMs.p95 <= 16.67).at(-1)?.actors ?? 0;
        const at30 = rows.filter(row => row.frameMs.p95 <= 33.34).at(-1)?.actors ?? 0;
        const peakThroughput = Math.max(...rows.map(row => row.vertexThroughputPerSecond));
        const result: ScaleResult = {
          asset: {
            renderPath,
            modules: manifest.modules.length,
            slots: manifest.slotOrder.length,
            vertices: totalVertices,
            averageSelectedVertices: selectedVertices,
            vertexWorkAmplification: totalVertices / selectedVertices,
            bones: vatMeta.bones,
            vatFrames: vatMeta.framesTotal,
            vatClips: vatMeta.clips.length,
            geometryBytes: manifest.bytes.supermeshStatic,
            vatGzipBytes: manifest.animation.vatGzipBytes,
            matrixBatExrBytes: renderPath.startsWith('bat') ? manifest.bytes.fullMatrixBatExr : undefined,
            bat: batBaseline?.getStats(),
            thinBat: thinBatBaseline?.getStats(),
            hybrid: hybridAttachment?.getStats(),
          },
          backend: {
            renderPath,
            engine: engine.getClassName(),
            backend: engine.isWebGPU ? 'WebGPU/storage' : 'WebGL2/datatex',
            vatQuality: quality,
            renderer: engine.description,
            hardwareConcurrency: navigator.hardwareConcurrency,
            devicePixelRatio,
            renderWidth: engine.getRenderWidth(),
            renderHeight: engine.getRenderHeight(),
            gpuTimingSource: rows.some(row => row.gpuMs)
              ? 'timestamp-query' : 'queue-completion-upper-bound',
          },
          structuralLimits,
          sweep: rows,
          measuredLimits: {
            largestTestedAt60FpsP95: at60,
            largestTestedAt30FpsP95: at30,
            largestTested: rows.at(-1)?.actors ?? 0,
            peakVertexThroughputPerSecond: peakThroughput,
            stoppedAfterTwoP95SamplesAbove50Ms: consecutiveSlow >= 2,
            warmupFrames,
            sampleFrames,
          },
        };
        window.__shadoSupermeshScale = { status: 'passed', result };
        void fetch('/__shado_supermesh_report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        }).catch(error => console.debug('[shado/supermesh-scale] report collector unavailable', error));
        ui.role('status').textContent = 'COMPLETE';
        ui.role('limit60').textContent = at60 ? at60.toLocaleString() : '< 1';
        ui.role('throughput').textContent = `${(peakThroughput / 1e6).toFixed(0)} M/s`;
        const download = ui.role<HTMLButtonElement>('download');
        download.disabled = false;
        download.addEventListener('click', () => {
          const anchor = document.createElement('a');
          anchor.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
          anchor.download = `shado-${renderPath}-${quality}-${engine.isWebGPU ? 'webgpu' : 'webgl2'}.json`;
          anchor.click();
          URL.revokeObjectURL(anchor.href);
        }, { once: true });
        console.info('[shado/supermesh-scale]', result);
      } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        window.__shadoSupermeshScale = { status: 'failed', error: message };
        ui.role('status').textContent = 'FAILED';
        console.error('[shado/supermesh-scale]', error);
      }
    });

    scene.onDisposeObservable.add(() => {
      instrumentation.dispose();
      hybridAttachment?.dispose();
      batBaseline?.dispose();
      thinBatBaseline?.dispose();
      for (const texture of dyedTextures) texture.dispose();
      container?.dispose();
      delete (window as any).__supermeshDebug;
      ui.modal?.dispose();
      ui.panel.remove();
      ui.style.remove();
    });
    return scene;
  }
}
