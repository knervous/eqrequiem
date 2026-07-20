import type {
  EqShowcaseController,
  EqShowcaseSelection,
  EqShowcaseStats,
  EqShowcaseTransformPatch,
} from './EqShowcaseTypes';

export type EqShowcaseUiHandle = {
  update(stats: EqShowcaseStats): void;
  dispose(): void;
};

const CONTROL_CSS = [
  'width:100%', 'box-sizing:border-box', 'padding:7px 9px',
  'border:1px solid rgba(145,170,199,.3)', 'border-radius:7px',
  'background:#111c2b', 'color:#f5e9c8', 'font:11px system-ui',
].join(';');

const BUTTON_CSS = [
  'padding:7px 8px', 'border:1px solid rgba(214,173,92,.4)', 'border-radius:8px',
  'background:rgba(214,173,92,.1)', 'color:#f5e9c8', 'cursor:pointer',
  'font:650 11px system-ui',
].join(';');

/** Shared DOM overlay used unchanged by the Vite sandbox and Babylon Playground. */
export function createEqShowcaseUi(
  canvas: HTMLCanvasElement,
  controller: EqShowcaseController
): EqShowcaseUiHandle {
  const parent = canvas.parentElement ?? document.body;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  const root = document.createElement('aside');
  root.dataset.eqShowcase = 'controls';
  root.style.cssText = [
    'position:absolute', 'inset:12px 12px 12px auto', 'z-index:30', 'width:360px',
    'max-width:calc(100vw - 24px)', 'height:calc(100vh - 24px)',
    'display:grid', 'grid-template-rows:minmax(0,1fr) minmax(0,1fr)', 'gap:10px',
    'color:#f5e9c8', 'font:12px/1.4 Inter,system-ui,sans-serif',
  ].join(';');

  const panelCss = [
    'min-height:0', 'overflow:auto', 'padding:13px',
    'border:1px solid rgba(255,255,255,.16)', 'border-radius:14px',
    'background:linear-gradient(155deg,rgba(9,17,30,.96),rgba(25,34,48,.91))',
    'box-shadow:0 18px 50px rgba(0,0,0,.35)', 'backdrop-filter:blur(14px)',
  ].join(';');

  root.innerHTML = `
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

      <label style="display:grid;grid-template-columns:auto minmax(80px,1fr) 58px;align-items:center;gap:7px;margin-top:9px;color:#bdc9d8;font:600 10px system-ui">
        <span data-role="culling-label">WASM culling</span>
        <input data-role="culling-range" type="range" min="0" max="600" step="10" value="180" style="width:100%;accent-color:#d6ad5c">
        <input data-role="culling-number" type="number" min="0" max="2000" step="10" value="180" aria-label="Culling distance in meters" style="${CONTROL_CSS};padding:4px 5px;text-align:right">
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

  const modelPills = new Map<string, HTMLButtonElement>();
  const modelList = root.querySelector<HTMLElement>('[data-role=models]')!;
  const babylonModelList = root.querySelector<HTMLElement>('[data-role=babylon-models]')!;
  const ensureModelPill = (model: EqShowcaseController['models'][number]) => {
    if (modelPills.has(model.code)) return;
    const pill = document.createElement('button');
    pill.textContent = model.custom ? `✦ ${model.label}` : model.label;
    pill.title = model.sourceUrl
      ? `${model.sourceUrl} · load and VAT-bake on demand`
      : model.custom ? `${model.label} · dropped GLB` : `Bake ${model.label} on demand`;
    pill.style.cssText = 'padding:3px 6px;border:1px solid rgba(174,190,210,.28);border-radius:999px;background:rgba(174,190,210,.07);color:#cbd4df;cursor:pointer;font:600 9px system-ui';
    pill.onclick = () => {
      pill.disabled = true;
      controller.loadModel(model.code).catch(console.error).finally(() => { pill.disabled = false; });
    };
    modelPills.set(model.code, pill);
    (model.catalog === 'babylon' ? babylonModelList : modelList).appendChild(pill);
  };
  for (const model of controller.models) ensureModelPill(model);

  const runButton = (button: HTMLButtonElement, action: () => void | Promise<void>) => {
    button.onclick = () => {
      button.disabled = true;
      Promise.resolve(action()).catch(console.error).finally(() => { button.disabled = false; });
    };
  };
  runButton(root.querySelector<HTMLButtonElement>('[data-role=load-all]')!, () => controller.loadAll());
  const buttons = root.querySelector<HTMLElement>('[data-role=buttons]')!;
  const addButton = (label: string, action: () => void | Promise<void>) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = BUTTON_CSS;
    runButton(button, action);
    buttons.appendChild(button);
  };
  addButton('Add 10', () => controller.addRandom(10));
  addButton('Add 1,000', () => controller.addRandom(1000));
  addButton('Remove', () => controller.removeRandom());
  addButton('Shuffle', () => controller.shuffle());
  let namesVisible = true;
  addButton('Names', () => { namesVisible = !namesVisible; controller.setNameplatesEnabled(namesVisible); });

  const cullingRange = root.querySelector<HTMLInputElement>('[data-role=culling-range]')!;
  const cullingNumber = root.querySelector<HTMLInputElement>('[data-role=culling-number]')!;
  const setCulling = (value: number) => {
    const next = Math.max(0, Math.min(2000, Number.isFinite(value) ? value : 180));
    cullingRange.value = String(Math.min(600, next));
    cullingNumber.value = String(next);
    controller.setCullingRange(next);
  };
  cullingRange.oninput = () => setCulling(Number(cullingRange.value));
  cullingNumber.onchange = () => setCulling(Number(cullingNumber.value));

  const selectedModel = root.querySelector<HTMLElement>('[data-role=selected-model]')!;
  const selectedEmpty = root.querySelector<HTMLElement>('[data-role=selected-empty]')!;
  const selectedForm = root.querySelector<HTMLElement>('[data-role=selected-form]')!;
  const selectedName = root.querySelector<HTMLInputElement>('[data-role=selected-name]')!;
  const selectedAnimation = root.querySelector<HTMLSelectElement>('[data-role=selected-animation]')!;
  const selectedSpeed = root.querySelector<HTMLInputElement>('[data-role=selected-speed]')!;
  const selectedSpeedValue = root.querySelector<HTMLOutputElement>('[data-role=selected-speed-value]')!;
  const selectedFacing = root.querySelector<HTMLInputElement>('[data-role=selected-facing]')!;
  const selectedScale = root.querySelector<HTMLInputElement>('[data-role=selected-scale]')!;
  const publishedFields = root.querySelector<HTMLElement>('[data-role=published-fields]')!;
  const transformInputs = new Map<string, HTMLInputElement>();
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('[data-transform]'))) {
    const property = input.dataset.transform!;
    transformInputs.set(property, input);
    input.onchange = () => controller.setSelectedTransform({
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
    heading.style.cssText = 'font:700 9px system-ui;letter-spacing:.12em;color:#8495aa;margin:10px 0 5px';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;gap:6px';
    for (const property of selection.published) {
      const label = document.createElement('label');
      label.title = property.description ?? '';
      label.style.cssText = 'display:grid;grid-template-columns:90px 1fr;align-items:center;gap:8px;color:#b9c6d6;font:10px system-ui';
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
      select.onchange = () => controller.setSelectedPublished(property.name, JSON.parse(select.value));
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
      selectedAnimation.replaceChildren(...selection.animations.map(animation => {
        const option = document.createElement('option');
        option.value = animation.name;
        option.textContent = animation.label;
        option.title = animation.name;
        return option;
      }));
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
    dropState.style.color = tone === 'error' ? '#ffac9f' : tone === 'success' ? '#9ee6bd' : '#efd28e';
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
      failures.length ? `${loaded} added · ${failures[0]}` : `${loaded} model${loaded === 1 ? '' : 's'} added`,
      failures.length ? 'error' : 'success',
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
    void ingestFiles(Array.from(fileInput.files ?? [])).finally(() => { fileInput.value = ''; });
  };
  dropZone.ondragover = event => { event.preventDefault(); setDragging(true); };
  dropZone.ondragenter = event => { event.preventDefault(); setDragging(true); };
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
    status.style.display = stats.current ? 'block' : 'none';
    status.textContent = stats.current ?? '';
    perf.innerHTML = `${stats.instances} instances<br>${stats.visible} visible<br>${stats.cullingMode === 'wasm-simd' ? 'WASM SIMD' : 'CPU'}`;
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
      cullingRange.value = String(Math.min(600, stats.cullingRange));
      cullingNumber.value = String(stats.cullingRange);
    }
    error.style.display = stats.lastError ? 'block' : 'none';
    error.textContent = stats.lastError ?? '';
  };
  update(controller.stats);

  let frame = 0;
  let last = performance.now();
  let frames = 0;
  const fps = document.createElement('div');
  fps.style.cssText = 'position:absolute;left:16px;top:16px;z-index:30;padding:8px 11px;border-radius:8px;background:rgba(11,19,32,.82);color:#d6e5f6;font:12px ui-monospace,monospace';
  parent.appendChild(fps);
  const tick = (now: number) => {
    frames++;
    if (now - last >= 500) {
      fps.textContent = controller.stats.current
        ? 'VAT baking'
        : `${Math.round(frames * 1000 / (now - last))} FPS · ${controller.stats.visible} visible`;
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
      root.remove();
      fps.remove();
    },
  };
}
