import type {
  EqShowcaseController,
  EqShowcaseSelection,
  EqShowcaseStats,
  EqShowcaseTransformPatch,
} from './EqShowcaseTypes';

export type ShadoVatShowcaseUiHandle = {
  update(stats: EqShowcaseStats): void;
  dispose(): void;
};

/** @deprecated Use ShadoVatShowcaseUiHandle. */
export type EqShowcaseUiHandle = ShadoVatShowcaseUiHandle;

export type ShadoVatShowcaseUiDiagnostics = {
  renderBackend: 'WebGPU' | 'WebGL2';
  storageBackend: 'StorageBuffer' | 'DataTexture';
  sample(): {
    fps: number;
    frameMs: number;
    gpuMs?: number;
  };
};

export type ShadoVatShowcaseDeferredStorageSnapshot = {
  supported: boolean;
  enabled: boolean;
  busy: boolean;
  coldInstances: number;
  logicalByteLength: number;
  residentByteLength: number;
  hotInstanceLimit: number;
  progress?: number;
  message?: string;
  error?: string;
};

/**
 * Optional sandbox capability for routing population overflow into cold slabs.
 * Kept renderer-neutral so the full and Lite showcases use the same controls.
 */
export type ShadoVatShowcaseDeferredStorage = {
  snapshot(): ShadoVatShowcaseDeferredStorageSnapshot;
  setEnabled(enabled: boolean): Promise<void>;
  addRandom(count: number): Promise<void>;
  removeRandom(): Promise<void>;
};

export type ShadoVatShowcaseUiOptions = {
  deferredStorage?: ShadoVatShowcaseDeferredStorage;
};

const CONTROL_CSS = [
  'width:100%',
  'box-sizing:border-box',
  'padding:7px 9px',
  'border:1px solid rgba(145,170,199,.3)',
  'border-radius:7px',
  'background:#111c2b',
  'color:#f5e9c8',
  'font:11px system-ui',
].join(';');

const BUTTON_CSS = [
  'padding:7px 8px',
  'border:1px solid rgba(214,173,92,.4)',
  'border-radius:8px',
  'background:rgba(214,173,92,.1)',
  'color:#f5e9c8',
  'cursor:pointer',
  'font:650 11px system-ui',
].join(';');

/** Shared DOM overlay used unchanged by the Vite sandbox and Babylon Playground. */
export function createShadoVatShowcaseUi(
  canvas: HTMLCanvasElement,
  controller: EqShowcaseController,
  diagnostics?: ShadoVatShowcaseUiDiagnostics,
  options: ShadoVatShowcaseUiOptions = {}
): ShadoVatShowcaseUiHandle {
  const parent = canvas.parentElement ?? document.body;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  const root = document.createElement('aside');
  root.dataset.eqShowcase = 'controls';
  root.dataset.mobileOpen = 'false';
  root.dataset.mobilePanel = 'roster';
  root.style.cssText = [
    'position:absolute',
    'inset:12px 12px 12px auto',
    'z-index:30',
    'width:360px',
    'max-width:calc(100vw - 24px)',
    'height:calc(100vh - 24px)',
    'display:grid',
    'grid-template-rows:minmax(0,1fr) minmax(0,1fr)',
    'gap:10px',
    'color:#f5e9c8',
    'font:12px/1.4 Inter,system-ui,sans-serif',
  ].join(';');

  const responsiveStyle = document.createElement('style');
  responsiveStyle.dataset.role = 'shado-showcase-responsive-style';
  responsiveStyle.textContent = `
    [data-role="showcase-mobile-launcher"],
    [data-role="showcase-mobile-bar"] { display: none; }
    @media (max-width: 700px) {
      [data-eq-showcase="controls"] {
        inset: auto 8px 8px 8px !important;
        width: auto !important;
        max-width: none !important;
        height: min(68dvh, 560px) !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
        gap: 7px !important;
        opacity: 0;
        pointer-events: none;
        transform: translateY(calc(100% + 18px));
        transition: transform .2s ease, opacity .16s ease;
      }
      [data-eq-showcase="controls"][data-mobile-open="true"] {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      [data-role="showcase-mobile-launcher"] {
        display: block;
        position: absolute;
        right: 10px;
        bottom: 10px;
        z-index: 31;
        min-width: 104px;
        min-height: 44px;
      }
      [data-eq-showcase="controls"][data-mobile-open="true"] + [data-role="showcase-mobile-launcher"] {
        display: none;
      }
      [data-role="showcase-mobile-bar"] {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 6px;
        padding: 6px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 12px;
        background: rgba(9,17,30,.97);
        box-shadow: 0 12px 30px rgba(0,0,0,.35);
      }
      [data-role="showcase-mobile-bar"] button {
        min-height: 38px;
      }
      [data-eq-showcase="controls"][data-mobile-panel="roster"] [data-role="selected-panel"],
      [data-eq-showcase="controls"][data-mobile-panel="selected"] [data-role="roster-panel"] {
        display: none;
      }
      [data-eq-showcase="controls"] section {
        padding: 11px !important;
        border-radius: 12px !important;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      [data-eq-showcase="controls"] button,
      [data-eq-showcase="controls"] input:not([type="range"]),
      [data-eq-showcase="controls"] select {
        min-height: 40px;
        font-size: 13px !important;
      }
      [data-eq-showcase="controls"] input[type="text"],
      [data-eq-showcase="controls"] input[type="number"],
      [data-eq-showcase="controls"] select {
        font-size: 16px !important;
      }
      [data-role="showcase-diagnostics"] {
        left: 8px !important;
        top: 50px !important;
        min-width: 0 !important;
        max-width: calc(100vw - 16px);
        padding: 7px 9px !important;
        font-size: 9px !important;
      }
    }
    @media (max-width: 420px) {
      [data-eq-showcase="controls"] {
        height: min(72dvh, 600px) !important;
      }
      [data-eq-showcase="controls"] [data-role="buttons"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-eq-showcase="controls"] { transition: none !important; }
    }`;
  parent.appendChild(responsiveStyle);

  const panelCss = [
    'min-height:0',
    'overflow:auto',
    'padding:13px',
    'border:1px solid rgba(255,255,255,.16)',
    'border-radius:14px',
    'background:linear-gradient(155deg,rgba(9,17,30,.96),rgba(25,34,48,.91))',
    'box-shadow:0 18px 50px rgba(0,0,0,.35)',
    'backdrop-filter:blur(14px)',
  ].join(';');

  root.innerHTML = `
    <nav data-role="showcase-mobile-bar" aria-label="Showcase control panels">
      <button type="button" data-mobile-panel-target="roster" aria-pressed="true" style="${BUTTON_CSS}">Crowd</button>
      <button type="button" data-mobile-panel-target="selected" aria-pressed="false" style="${BUTTON_CSS}">Selected</button>
      <button type="button" data-role="showcase-mobile-close" aria-label="Close controls" style="${BUTTON_CSS}">✕</button>
    </nav>
    <section data-role="roster-panel" style="${panelCss}">
      <header style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:10px">
        <div>
          <div style="font:700 10px/1.2 system-ui;letter-spacing:.18em;color:#d6ad5c">@KNERVOUS/SHADO</div>
          <div style="font:700 20px/1.2 Georgia,serif;margin-top:3px">VAT Baker</div>
        </div>
        <div data-role="perf" style="color:#aeb9c9;text-align:right;font:600 10px/1.45 ui-monospace,monospace"></div>
      </header>
      <div data-role="status" style="display:none;padding:7px 8px;border-radius:8px;background:rgba(214,173,92,.09);color:#efd28e;margin-bottom:8px"></div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px">
        <span style="font:700 10px system-ui;letter-spacing:.13em;color:#d4deea">SHADO MODELS</span>
        <button data-role="load-all" style="${BUTTON_CSS};padding:4px 9px">Load All</button>
      </div>
      <div data-role="models" style="display:flex;flex-wrap:wrap;gap:4px;max-height:64px;overflow:auto;margin-bottom:8px;padding-right:3px"></div>

      <div style="font:650 9px system-ui;letter-spacing:.12em;color:#8495aa;margin-bottom:4px">BABYLON ASSETS</div>
      <div data-role="babylon-models" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:9px"></div>

      <div data-role="buttons" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px"></div>

      <div data-role="deferred-storage" style="display:none;margin-top:9px;padding:9px;border:1px solid rgba(125,211,252,.24);border-radius:10px;background:rgba(14,116,144,.08)">
        <label style="display:flex;align-items:center;gap:8px;color:#d6e5f6;font:650 10px system-ui;cursor:pointer">
          <input data-role="deferred-storage-toggle" type="checkbox" style="width:17px;height:17px;accent-color:#38bdf8">
          <span>OPFS cold slab backing</span>
        </label>
        <div data-role="deferred-storage-detail" aria-live="polite" style="margin-top:5px;color:#8fa6bc;font:10px/1.4 ui-monospace,monospace"></div>
        <button data-role="deferred-storage-add-5m" style="${BUTTON_CSS};display:none;width:100%;margin-top:7px;border-color:rgba(125,211,252,.42);background:rgba(14,165,233,.12)">Add 5,000,000 total-tier actors</button>
      </div>

      <label style="display:grid;grid-template-columns:auto minmax(80px,1fr) 58px;align-items:center;gap:7px;margin-top:9px;color:#bdc9d8;font:600 10px system-ui">
        <span data-role="culling-label">WASM culling</span>
        <input data-role="culling-range" type="range" min="0" max="2200" step="25" value="600" style="width:100%;accent-color:#d6ad5c">
        <input data-role="culling-number" type="number" min="0" max="4000" step="25" value="600" aria-label="Culling distance in meters" style="${CONTROL_CSS};padding:4px 5px;text-align:right">
      </label>

      <div data-role="glb-drop" role="button" tabindex="0" aria-label="Drop or choose animated GLB files"
        style="position:relative;margin-top:9px;padding:10px;border:1px dashed rgba(214,173,92,.58);border-radius:10px;background:linear-gradient(135deg,rgba(214,173,92,.09),rgba(95,132,174,.08));cursor:pointer;text-align:center;transition:transform .15s ease,border-color .15s ease">
        <input data-role="glb-input" type="file" accept=".glb,model/gltf-binary" multiple style="display:none">
        <div style="font:700 10px system-ui;letter-spacing:.1em;color:#efd28e">＋ DROP GLB TO VAT-BAKE</div>
        <div data-role="glb-state" style="margin-top:3px;color:#9eacbe;font:10px system-ui">or click to browse</div>
      </div>
      <div data-role="error" style="display:none;color:#ffac9f;margin-top:7px;font:10px system-ui"></div>
    </section>

    <section data-role="selected-panel" style="${panelCss}">
      <header style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.09)">
        <div>
          <div style="font:700 10px system-ui;letter-spacing:.14em;color:#d6ad5c">SELECTED INSTANCE</div>
          <div data-role="selected-model" style="margin-top:3px;color:#93a6bd;font:10px system-ui">Click a model in the world</div>
        </div>
        <span style="color:#71869f;font:9px system-ui">Shift-drag to move</span>
      </header>
      <div data-role="selected-empty" style="display:grid;place-items:center;min-height:150px;color:#8293a8;text-align:center;font:11px system-ui">
        Select an instance to inspect its public Shado controls.
      </div>
      <div data-role="selected-form" style="display:none;padding-top:10px">
        <label style="display:grid;gap:4px;margin-bottom:9px;color:#b9c6d6;font:600 10px system-ui">
          Name
          <input data-role="selected-name" type="text" maxlength="48" style="${CONTROL_CSS}">
        </label>

        <div style="font:700 9px system-ui;letter-spacing:.12em;color:#8495aa;margin-bottom:5px">MOTION</div>
        <label style="display:grid;grid-template-columns:72px 1fr;align-items:center;gap:8px;margin-bottom:6px;color:#b9c6d6;font:10px system-ui">
          Animation
          <select data-role="selected-animation" style="${CONTROL_CSS}"></select>
        </label>
        <label style="display:grid;grid-template-columns:72px 1fr 38px;align-items:center;gap:8px;margin-bottom:10px;color:#b9c6d6;font:10px system-ui">
          Speed
          <input data-role="selected-speed" type="range" min="0.1" max="3" step="0.05" value="1" style="width:100%;accent-color:#d6ad5c">
          <output data-role="selected-speed-value" style="text-align:right;color:#efd28e;font:10px ui-monospace,monospace">1×</output>
        </label>

        <div data-role="published-fields"></div>

        <div style="font:700 9px system-ui;letter-spacing:.12em;color:#8495aa;margin:10px 0 5px">TRANSFORM</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:7px">
          <label style="display:grid;gap:3px;color:#9eacbe;font:9px system-ui">Position X<input data-transform="x" type="number" step="0.1" style="${CONTROL_CSS};padding:5px"></label>
          <label style="display:grid;gap:3px;color:#9eacbe;font:9px system-ui">Height<input data-transform="y" type="number" step="0.1" style="${CONTROL_CSS};padding:5px"></label>
          <label style="display:grid;gap:3px;color:#9eacbe;font:9px system-ui">Position Z<input data-transform="z" type="number" step="0.1" style="${CONTROL_CSS};padding:5px"></label>
        </div>
        <label style="display:grid;grid-template-columns:58px 1fr 64px;align-items:center;gap:7px;margin-bottom:7px;color:#b9c6d6;font:10px system-ui">
          Facing
          <input data-role="selected-facing" type="range" min="-180" max="180" step="1" value="0" style="width:100%;accent-color:#d6ad5c">
          <input data-transform="rotationDegrees" type="number" min="-180" max="180" step="1" style="${CONTROL_CSS};padding:5px;text-align:right">
        </label>
        <label style="display:grid;grid-template-columns:58px 1fr 64px;align-items:center;gap:7px;color:#b9c6d6;font:10px system-ui">
          Scale
          <input data-role="selected-scale" type="range" min="0.05" max="5" step="0.01" value="1" style="width:100%;accent-color:#d6ad5c">
          <input data-transform="scale" type="number" min="0.01" max="100" step="0.01" style="${CONTROL_CSS};padding:5px;text-align:right">
        </label>
      </div>
    </section>`;
  parent.appendChild(root);

  const mobileLauncher = document.createElement('button');
  mobileLauncher.type = 'button';
  mobileLauncher.dataset.role = 'showcase-mobile-launcher';
  mobileLauncher.setAttribute('aria-expanded', 'false');
  mobileLauncher.textContent = 'VAT controls';
  mobileLauncher.style.cssText =
    BUTTON_CSS + ';background:rgba(9,17,30,.96);box-shadow:0 10px 28px rgba(0,0,0,.4)';
  parent.appendChild(mobileLauncher);
  const setMobileOpen = (open: boolean) => {
    root.dataset.mobileOpen = String(open);
    mobileLauncher.setAttribute('aria-expanded', String(open));
  };
  mobileLauncher.onclick = () => setMobileOpen(true);
  root.querySelector<HTMLButtonElement>('[data-role=showcase-mobile-close]')!.onclick = () =>
    setMobileOpen(false);
  for (const tab of Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-mobile-panel-target]')
  )) {
    tab.onclick = () => {
      const panel = tab.dataset.mobilePanelTarget === 'selected' ? 'selected' : 'roster';
      root.dataset.mobilePanel = panel;
      for (const candidate of Array.from(
        root.querySelectorAll<HTMLButtonElement>('[data-mobile-panel-target]')
      )) {
        candidate.setAttribute(
          'aria-pressed',
          String(candidate.dataset.mobilePanelTarget === panel)
        );
      }
    };
  }
  const onRootKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && root.dataset.mobileOpen === 'true') {
      setMobileOpen(false);
      mobileLauncher.focus();
    }
  };
  root.addEventListener('keydown', onRootKeyDown);

  const modelPills = new Map<string, HTMLButtonElement>();
  const modelList = root.querySelector<HTMLElement>('[data-role=models]')!;
  const babylonModelList = root.querySelector<HTMLElement>('[data-role=babylon-models]')!;
  const ensureModelPill = (model: EqShowcaseController['models'][number]) => {
    if (modelPills.has(model.code)) return;
    const pill = document.createElement('button');
    pill.textContent = model.custom ? `✦ ${model.label}` : model.label;
    pill.title = model.sourceUrl
      ? `${model.sourceUrl} · load and VAT-bake on demand`
      : model.custom
        ? `${model.label} · dropped GLB`
        : `Bake ${model.label} on demand`;
    pill.style.cssText =
      'padding:3px 6px;border:1px solid rgba(174,190,210,.28);border-radius:999px;background:rgba(174,190,210,.07);color:#cbd4df;cursor:pointer;font:600 9px system-ui';
    pill.onclick = () => {
      pill.disabled = true;
      controller
        .loadModel(model.code)
        .catch(console.error)
        .finally(() => {
          pill.disabled = false;
        });
    };
    modelPills.set(model.code, pill);
    (model.catalog === 'babylon' ? babylonModelList : modelList).appendChild(pill);
  };
  for (const model of controller.models) ensureModelPill(model);

  const runButton = (button: HTMLButtonElement, action: () => void | Promise<void>) => {
    button.onclick = () => {
      button.disabled = true;
      Promise.resolve(action())
        .catch(console.error)
        .finally(() => {
          button.disabled = false;
        });
    };
  };
  runButton(root.querySelector<HTMLButtonElement>('[data-role=load-all]')!, () =>
    controller.loadAll()
  );
  const buttons = root.querySelector<HTMLElement>('[data-role=buttons]')!;
  const addButton = (label: string, action: () => void | Promise<void>) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = BUTTON_CSS;
    runButton(button, action);
    buttons.appendChild(button);
  };
  const deferredStorage = options.deferredStorage;
  const addRandom = (count: number) =>
    deferredStorage?.snapshot().enabled
      ? deferredStorage.addRandom(count)
      : controller.addRandom(count);
  const removeRandom = () =>
    deferredStorage?.snapshot().enabled
      ? deferredStorage.removeRandom()
      : controller.removeRandom();
  addButton('Add 10', () => addRandom(10));
  addButton('Add 1,000', () => addRandom(1000));
  addButton('Add 10,000', () => addRandom(10000));
  addButton('Add 100,000', () => addRandom(100000));
  addButton('Remove', removeRandom);
  addButton('Shuffle', () => controller.shuffle());
  let namesVisible = true;
  addButton('Names', () => {
    namesVisible = !namesVisible;
    controller.setNameplatesEnabled(namesVisible);
  });

  const deferredStorageRoot = root.querySelector<HTMLElement>('[data-role=deferred-storage]')!;
  const deferredStorageToggle = root.querySelector<HTMLInputElement>(
    '[data-role=deferred-storage-toggle]'
  )!;
  const deferredStorageDetail = root.querySelector<HTMLElement>(
    '[data-role=deferred-storage-detail]'
  )!;
  const deferredStorageAdd5m = root.querySelector<HTMLButtonElement>(
    '[data-role=deferred-storage-add-5m]'
  )!;
  const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MiB`
      : `${(bytes / 1024).toFixed(1)} KiB`;
  const renderDeferredStorage = () => {
    if (!deferredStorage) return;
    const snapshot = deferredStorage.snapshot();
    deferredStorageRoot.style.display = 'block';
    deferredStorageToggle.checked = snapshot.enabled;
    deferredStorageToggle.disabled = snapshot.busy || !snapshot.supported;
    deferredStorageAdd5m.style.display = snapshot.enabled ? 'block' : 'none';
    deferredStorageAdd5m.disabled = snapshot.busy;
    const progress =
      snapshot.progress === undefined ? '' : ` · ${Math.round(snapshot.progress * 100)}%`;
    deferredStorageDetail.style.color = snapshot.error ? '#ffac9f' : '#8fa6bc';
    deferredStorageDetail.textContent = !snapshot.supported
      ? 'Unavailable: this browser does not expose OPFS workers.'
      : snapshot.error
        ? snapshot.error
        : snapshot.busy
          ? `${snapshot.message ?? 'Updating cold slabs'}${progress}`
          : snapshot.enabled
            ? `${snapshot.coldInstances.toLocaleString()} cold · ${formatBytes(snapshot.logicalByteLength)} logical · ${formatBytes(snapshot.residentByteLength)} mapped · hot cap ${snapshot.hotInstanceLimit.toLocaleString()}`
            : snapshot.coldInstances > 0
              ? `Off · ${snapshot.coldInstances.toLocaleString()} cold rows retained`
              : 'Off · large additions currently stay resident';
  };
  if (deferredStorage) {
    renderDeferredStorage();
    deferredStorageToggle.onchange = () => {
      deferredStorageToggle.disabled = true;
      void deferredStorage
        .setEnabled(deferredStorageToggle.checked)
        .catch(console.error)
        .finally(renderDeferredStorage);
    };
    runButton(deferredStorageAdd5m, async () => {
      await deferredStorage.addRandom(5_000_000);
      renderDeferredStorage();
    });
  }

  const cullingRange = root.querySelector<HTMLInputElement>('[data-role=culling-range]')!;
  const cullingNumber = root.querySelector<HTMLInputElement>('[data-role=culling-number]')!;
  const setCulling = (value: number) => {
    const next = Math.max(0, Math.min(4000, Number.isFinite(value) ? value : 600));
    cullingRange.value = String(Math.min(2200, next));
    cullingNumber.value = String(next);
    controller.setCullingRange(next);
  };
  cullingRange.oninput = () => setCulling(Number(cullingRange.value));
  cullingNumber.onchange = () => setCulling(Number(cullingNumber.value));

  const selectedModel = root.querySelector<HTMLElement>('[data-role=selected-model]')!;
  const selectedEmpty = root.querySelector<HTMLElement>('[data-role=selected-empty]')!;
  const selectedForm = root.querySelector<HTMLElement>('[data-role=selected-form]')!;
  const selectedName = root.querySelector<HTMLInputElement>('[data-role=selected-name]')!;
  const selectedAnimation = root.querySelector<HTMLSelectElement>(
    '[data-role=selected-animation]'
  )!;
  const selectedSpeed = root.querySelector<HTMLInputElement>('[data-role=selected-speed]')!;
  const selectedSpeedValue = root.querySelector<HTMLOutputElement>(
    '[data-role=selected-speed-value]'
  )!;
  const selectedFacing = root.querySelector<HTMLInputElement>('[data-role=selected-facing]')!;
  const selectedScale = root.querySelector<HTMLInputElement>('[data-role=selected-scale]')!;
  const publishedFields = root.querySelector<HTMLElement>('[data-role=published-fields]')!;
  const transformInputs = new Map<string, HTMLInputElement>();
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('[data-transform]'))) {
    const property = input.dataset.transform!;
    transformInputs.set(property, input);
    input.onchange = () =>
      controller.setSelectedTransform({
        [property]: Number(input.value),
      } as EqShowcaseTransformPatch);
  }
  selectedName.onchange = () => controller.setSelectedName(selectedName.value);
  selectedAnimation.onchange = () => controller.setSelectedAnimation(selectedAnimation.value);
  selectedSpeed.oninput = () => {
    const speed = Number(selectedSpeed.value);
    selectedSpeedValue.value = `${speed.toFixed(2).replace(/\.00$/, '')}×`;
    controller.setSelectedAnimationSpeed(speed);
  };
  selectedFacing.oninput = () => {
    const degrees = Number(selectedFacing.value);
    transformInputs.get('rotationDegrees')!.value = String(degrees);
    controller.setSelectedTransform({ rotationDegrees: degrees });
  };
  selectedScale.oninput = () => {
    const scale = Number(selectedScale.value);
    transformInputs.get('scale')!.value = scale.toFixed(2);
    controller.setSelectedTransform({ scale });
  };

  const renderPublished = (selection: EqShowcaseSelection) => {
    publishedFields.replaceChildren();
    if (!selection.published.length) return;
    const heading = document.createElement('div');
    heading.textContent = 'APPEARANCE & EQUIPMENT';
    heading.style.cssText =
      'font:700 9px system-ui;letter-spacing:.12em;color:#8495aa;margin:10px 0 5px';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;gap:6px';
    for (const property of selection.published) {
      const label = document.createElement('label');
      label.title = property.description ?? '';
      label.style.cssText =
        'display:grid;grid-template-columns:90px 1fr;align-items:center;gap:8px;color:#b9c6d6;font:10px system-ui';
      const caption = document.createElement('span');
      caption.textContent = property.label;
      const select = document.createElement('select');
      select.disabled = property.readonly;
      select.style.cssText = CONTROL_CSS;
      for (const option of property.values ?? []) {
        const element = document.createElement('option');
        element.value = JSON.stringify(option.value);
        element.textContent = option.label;
        element.title = option.description ?? '';
        element.selected = option.value === property.value;
        select.appendChild(element);
      }
      select.onchange = () =>
        controller.setSelectedPublished(property.name, JSON.parse(select.value));
      label.append(caption, select);
      grid.appendChild(label);
    }
    publishedFields.append(heading, grid);
  };

  const renderSelection = (selection: EqShowcaseSelection | undefined) => {
    selectedEmpty.style.display = selection ? 'none' : 'grid';
    selectedForm.style.display = selection ? 'block' : 'none';
    selectedModel.textContent = selection
      ? `${selection.modelLabel} · ${selection.kind === 'npc' ? 'NPC' : 'Playable'} · #${selection.index + 1}`
      : 'Click a model in the world';
    if (!selection) return;
    selectedName.value = selection.name;
    const animationSignature = selection.animations.map(animation => animation.name).join('\u0000');
    if (selectedAnimation.dataset.signature !== animationSignature) {
      selectedAnimation.replaceChildren(
        ...selection.animations.map(animation => {
          const option = document.createElement('option');
          option.value = animation.name;
          option.textContent = animation.label;
          option.title = animation.name;
          return option;
        })
      );
      selectedAnimation.dataset.signature = animationSignature;
    }
    selectedAnimation.value = selection.animation;
    const speed = Math.max(0.1, Math.min(3, selection.animationSpeed));
    selectedSpeed.value = String(speed);
    selectedSpeedValue.value = `${speed.toFixed(2).replace(/\.00$/, '')}×`;
    transformInputs.get('x')!.value = selection.position.x.toFixed(2);
    transformInputs.get('y')!.value = selection.position.y.toFixed(2);
    transformInputs.get('z')!.value = selection.position.z.toFixed(2);
    transformInputs.get('rotationDegrees')!.value = selection.rotationDegrees.toFixed(0);
    transformInputs.get('scale')!.value = selection.scale.toFixed(2);
    selectedFacing.value = String(Math.max(-180, Math.min(180, selection.rotationDegrees)));
    selectedScale.value = String(Math.max(0.05, Math.min(5, selection.scale)));
    renderPublished(selection);
  };
  const unsubscribeSelection = controller.subscribeSelection(renderSelection);

  let draggingSelected = false;
  const moveSelected = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    controller.moveSelectedFromScreen(event.clientX - rect.left, event.clientY - rect.top);
  };
  const onCanvasPointerDown = (event: PointerEvent) => {
    if (!event.shiftKey || event.button !== 0 || !controller.selected) return;
    draggingSelected = true;
    canvas.setPointerCapture?.(event.pointerId);
    moveSelected(event);
    event.preventDefault();
    event.stopPropagation();
  };
  const onCanvasPointerMove = (event: PointerEvent) => {
    if (!draggingSelected) return;
    moveSelected(event);
    event.preventDefault();
    event.stopPropagation();
  };
  const onCanvasPointerUp = (event: PointerEvent) => {
    if (!draggingSelected) return;
    draggingSelected = false;
    canvas.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  canvas.addEventListener('pointerdown', onCanvasPointerDown, true);
  canvas.addEventListener('pointermove', onCanvasPointerMove, true);
  canvas.addEventListener('pointerup', onCanvasPointerUp, true);

  const dropZone = root.querySelector<HTMLElement>('[data-role=glb-drop]')!;
  const fileInput = root.querySelector<HTMLInputElement>('[data-role=glb-input]')!;
  const dropState = root.querySelector<HTMLElement>('[data-role=glb-state]')!;
  const showDropState = (message: string, tone: 'busy' | 'success' | 'error') => {
    dropState.style.color =
      tone === 'error' ? '#ffac9f' : tone === 'success' ? '#9ee6bd' : '#efd28e';
    dropState.textContent = message;
  };
  const setDragging = (active: boolean) => {
    dropZone.style.transform = active ? 'scale(1.015)' : 'none';
    dropZone.style.borderColor = active ? '#efd28e' : 'rgba(214,173,92,.58)';
  };
  const ingestFiles = async (files: File[]) => {
    const glbs = files.filter(file => file.name.toLowerCase().endsWith('.glb'));
    if (!glbs.length) return showDropState('No .glb files found.', 'error');
    let loaded = 0;
    const failures: string[] = [];
    for (const [index, file] of glbs.entries()) {
      showDropState(`Baking ${index + 1} of ${glbs.length} · ${file.name}`, 'busy');
      try {
        await controller.addGlb(await file.arrayBuffer(), file.name);
        loaded++;
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : String(cause));
      }
    }
    showDropState(
      failures.length
        ? `${loaded} added · ${failures[0]}`
        : `${loaded} model${loaded === 1 ? '' : 's'} added`,
      failures.length ? 'error' : 'success'
    );
  };
  dropZone.onclick = () => fileInput.click();
  dropZone.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  };
  fileInput.onchange = () => {
    void ingestFiles(Array.from(fileInput.files ?? [])).finally(() => {
      fileInput.value = '';
    });
  };
  dropZone.ondragover = event => {
    event.preventDefault();
    setDragging(true);
  };
  dropZone.ondragenter = event => {
    event.preventDefault();
    setDragging(true);
  };
  dropZone.ondragleave = event => {
    if (!dropZone.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  dropZone.ondrop = event => {
    event.preventDefault();
    setDragging(false);
    void ingestFiles(Array.from(event.dataTransfer?.files ?? []));
  };

  const status = root.querySelector<HTMLElement>('[data-role=status]')!;
  const perf = root.querySelector<HTMLElement>('[data-role=perf]')!;
  const error = root.querySelector<HTMLElement>('[data-role=error]')!;
  const update = (stats: EqShowcaseStats) => {
    for (const model of controller.models) ensureModelPill(model);
    const coldInstances = deferredStorage?.snapshot().coldInstances ?? 0;
    const totalInstances = stats.instances + coldInstances;
    status.style.display = stats.current ? 'block' : 'none';
    status.textContent = stats.current ?? '';
    perf.innerHTML = `${totalInstances.toLocaleString()} total<br>${stats.instances.toLocaleString()} hot · ${stats.visible.toLocaleString()} visible<br>${stats.cullingMode === 'wasm-simd' ? 'WASM SIMD' : 'CPU'}`;
    root.querySelector<HTMLElement>('[data-role=culling-label]')!.textContent =
      stats.cullingMode === 'wasm-simd' ? 'WASM culling' : 'CPU culling';
    const loaded = new Set(stats.loadedCodes);
    for (const [code, pill] of modelPills) {
      const active = loaded.has(code);
      pill.style.background = active ? 'rgba(214,173,92,.24)' : 'rgba(174,190,210,.07)';
      pill.style.borderColor = active ? 'rgba(214,173,92,.72)' : 'rgba(174,190,210,.28)';
      pill.style.color = active ? '#fff0c9' : '#cbd4df';
    }
    if (document.activeElement !== cullingRange && document.activeElement !== cullingNumber) {
      cullingRange.value = String(Math.min(2200, stats.cullingRange));
      cullingNumber.value = String(stats.cullingRange);
    }
    error.style.display = stats.lastError ? 'block' : 'none';
    error.textContent = stats.lastError ?? '';
    renderDeferredStorage();
  };
  update(controller.stats);

  let frame = 0;
  let last = performance.now();
  let frames = 0;
  const fps = document.createElement('div');
  fps.dataset.role = 'showcase-diagnostics';
  fps.style.cssText = [
    'position:absolute',
    'left:16px',
    'top:58px',
    'z-index:30',
    'min-width:220px',
    'padding:10px 12px',
    'border:1px solid rgba(125,211,252,.3)',
    'border-radius:10px',
    'background:rgba(7,15,25,.88)',
    'box-shadow:0 12px 30px rgba(0,0,0,.28)',
    'backdrop-filter:blur(10px)',
    'color:#d6e5f6',
    'font:11px/1.45 ui-monospace,monospace',
    'font-variant-numeric:tabular-nums',
    'pointer-events:none',
  ].join(';');
  parent.appendChild(fps);
  const tick = (now: number) => {
    frames++;
    if (now - last >= 500) {
      const stats = controller.stats;
      renderDeferredStorage();
      const coldInstances = deferredStorage?.snapshot().coldInstances ?? 0;
      const totalInstances = stats.instances + coldInstances;
      const measuredFps = (frames * 1000) / (now - last);
      const timing = diagnostics?.sample();
      const rawFps = timing?.fps ?? measuredFps;
      const frameMs = timing?.frameMs ?? 1000 / Math.max(1, measuredFps);
      const gpuMs =
        timing?.gpuMs !== undefined && timing.gpuMs > 0 ? `${timing.gpuMs.toFixed(2)} ms` : 'n/a';
      const culling = stats.cullingMode === 'wasm-simd' ? 'WASM SIMD' : 'CPU';
      const backing = diagnostics
        ? `${diagnostics.renderBackend} · ${diagnostics.storageBackend}`
        : culling;
      fps.innerHTML = `
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px">
          <strong style="color:#7dd3fc;font:700 10px system-ui;letter-spacing:.12em">SHADO DIAGNOSTICS</strong>
          <strong style="color:#f8fafc;font-size:15px">RAW ${rawFps.toFixed(0)} FPS</strong>
        </div>
        <div style="margin:5px 0 6px;color:#94a3b8">VAT · SoA · ${backing}</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:2px 14px">
          <span>Visible / hot / total</span><b>${stats.visible.toLocaleString()} / ${stats.instances.toLocaleString()} / ${totalInstances.toLocaleString()}</b>
          ${coldInstances ? `<span>OPFS cold</span><b style="color:#7dd3fc">${coldInstances.toLocaleString()}</b>` : ''}
          <span>Cull</span><b style="color:#fde68a">${culling} · ${stats.cullingRange}m</b>
          <span>Reducer</span><b>${stats.reducerMs.toFixed(3)} ms <span style="color:#64748b">(${stats.reducerAverageMs.toFixed(3)} avg)</span></b>
          ${stats.vatActorsPerModel ? `<span>VAT/model limit</span><b style="color:#86efac">${stats.vatActorsPerModel.toLocaleString()}</b>` : ''}
          <span>GPU frame</span><b>${gpuMs}</b>
          <span>Frame</span><b>${frameMs.toFixed(2)} ms</b>
        </div>
        ${stats.current ? '<div style="margin-top:6px;color:#fbbf24">VAT baking</div>' : ''}`;
      frames = 0;
      last = now;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    update,
    dispose() {
      cancelAnimationFrame(frame);
      unsubscribeSelection();
      canvas.removeEventListener('pointerdown', onCanvasPointerDown, true);
      canvas.removeEventListener('pointermove', onCanvasPointerMove, true);
      canvas.removeEventListener('pointerup', onCanvasPointerUp, true);
      root.removeEventListener('keydown', onRootKeyDown);
      root.remove();
      mobileLauncher.remove();
      responsiveStyle.remove();
      fps.remove();
    },
  };
}

/** @deprecated Use createShadoVatShowcaseUi. */
export const createEqShowcaseUi = createShadoVatShowcaseUi;
