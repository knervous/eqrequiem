import { useEffect, useRef, useState } from 'react';
import {
  importLegacyZoneMetadata,
  validateShadoWorldAuthoring,
  type ShadoWorldObjectStamp,
  type ShadoWorldAuthoringRegion,
  type ShadoWorldRegionKind,
} from '@knervous/shado/world';
import type { WorldDevState } from './WorldPlayground';
import type { WorldRegionEditorCommand, WorldRegionEditorState } from './WorldRegionEditor';

const REGION_KINDS: ShadoWorldRegionKind[] = [
  'visibility-cell', 'streaming', 'water', 'lava', 'safe',
  'zone-line', 'audio', 'trigger', 'semantic',
];

export function WorldEditorPanel() {
  const [state, setState] = useState<WorldDevState>(
    () => window.__shadoWorldDev ?? { status: 'loading' }
  );
  const [regions, setRegions] = useState<WorldRegionEditorState | undefined>(
    () => window.__shadoWorldRegions
  );
  const [draft, setDraft] = useState<ShadoWorldAuthoringRegion>();
  const draftDirty = useRef(false);
  const selectedDraftId = useRef<string | undefined>(undefined);
  const [metadataText, setMetadataText] = useState('{}');
  const [editError, setEditError] = useState<string>();
  const [showBounds, setShowBounds] = useState(false);
  const [showTiles, setShowTiles] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [soloSelected, setSoloSelected] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [navigationMode, setNavigationMode] = useState<'orbit' | 'pan'>('orbit');
  const [glbStatus, setGlbStatus] = useState<string>();
  const [objectDraft, setObjectDraft] = useState<ShadoWorldObjectStamp>();
  const [objectFilter, setObjectFilter] = useState('');
  const [stampPrototype, setStampPrototype] = useState('');
  const [objectAssetStatus, setObjectAssetStatus] = useState<string>();
  useEffect(() => {
    const worldListener = (event: Event) =>
      setState((event as CustomEvent<WorldDevState>).detail);
    const regionListener = (event: Event) => {
      const next = (event as CustomEvent<WorldRegionEditorState>).detail;
      setRegions(next);
      const selectedObject = next.document.objects.stamps.find(
        stamp => stamp.id === next.selectedObjectId
      );
      setObjectDraft(selectedObject ? structuredClone(selectedObject) : undefined);
      setStampPrototype(current => current || next.document.objects.prototypes[0]?.id || '');
      const selected = next.document.regions.find(region => region.id === next.selectedId);
      const selectionChanged = selected?.id !== selectedDraftId.current;
      selectedDraftId.current = selected?.id;
      if (selectionChanged) draftDirty.current = false;
      setDraft(current => {
        if (selected && draftDirty.current && current?.id === selected.id) {
          return { ...current, center: [...selected.center], size: [...selected.size] };
        }
        return selected ? structuredClone(selected) : undefined;
      });
      if (!selected || !draftDirty.current) {
        setMetadataText(JSON.stringify(selected?.metadata ?? {}, null, 2));
      }
      setEditError(undefined);
    };
    window.addEventListener('shado-world-state', worldListener);
    window.addEventListener('shado-world-region-state', regionListener);
    const imported = (event: Event) => {
      const detail = (event as CustomEvent<{ name: string; meshes: number }>).detail;
      setGlbStatus(`${detail.name} · ${detail.meshes} meshes`);
    };
    const importError = (event: Event) => setEditError((event as CustomEvent<string>).detail);
    window.addEventListener('shado-world-glb-imported', imported);
    window.addEventListener('shado-world-glb-import-error', importError);
    const objectImported = (event: Event) => {
      const detail = (event as CustomEvent<{ prototype: string; name: string }>).detail;
      setObjectAssetStatus(`${detail.prototype} previewing ${detail.name}`);
    };
    const objectLoadError = (event: Event) => {
      const detail = (event as CustomEvent<{ prototype: string; error: string }>).detail;
      setObjectAssetStatus(`${detail.prototype}: placeholder (${detail.error})`);
    };
    window.addEventListener('shado-world-object-imported', objectImported);
    window.addEventListener('shado-world-object-load-error', objectLoadError);
    return () => {
      window.removeEventListener('shado-world-state', worldListener);
      window.removeEventListener('shado-world-region-state', regionListener);
      window.removeEventListener('shado-world-glb-imported', imported);
      window.removeEventListener('shado-world-glb-import-error', importError);
      window.removeEventListener('shado-world-object-imported', objectImported);
      window.removeEventListener('shado-world-object-load-error', objectLoadError);
    };
  }, []);
  const updateOptions = (detail: Record<string, boolean | string>) =>
    window.dispatchEvent(new CustomEvent('shado-world-options', { detail }));
  const command = (detail: WorldRegionEditorCommand) =>
    window.dispatchEvent(new CustomEvent('shado-world-region-command', { detail }));
  const updateDraft = (next: Partial<ShadoWorldAuthoringRegion>) => {
    draftDirty.current = true;
    setDraft(current => current ? { ...current, ...next } : current);
  };
  const apply = () => {
    if (!draft) return;
    try {
      const metadata = JSON.parse(metadataText) as unknown;
      if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
        throw new Error('Metadata must be a JSON object');
      }
      const region = { ...draft, metadata: metadata as Record<string, unknown> };
      draftDirty.current = false;
      command({ type: 'update', region });
      setEditError(undefined);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };
  const exportDocument = () => {
    if (!regions) return;
    const blob = new Blob([`${JSON.stringify(regions.document, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${regions.document.world}.authoring.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importDocument = async (file: File | undefined) => {
    if (!file || !regions) return;
    try {
      const document = validateShadoWorldAuthoring(
        JSON.parse(await file.text()),
        regions.document.world
      );
      command({ type: 'replace-document', document });
      setEditError(undefined);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };
  const importLegacyMetadata = async (file: File | undefined) => {
    if (!file || !regions) return;
    try {
      const document = importLegacyZoneMetadata(
        JSON.parse(await file.text()),
        regions.document.world
      );
      command({ type: 'replace-document', document });
      setEditError(undefined);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };
  const updateObject = (next: Partial<ShadoWorldObjectStamp>) => {
    setObjectDraft(current => current ? { ...current, ...next } : current);
  };
  return (
    <aside className="world-editor-panel">
      <header className="world-editor-header">
        <div>
          <h2>World development</h2>
          <small>Region authoring</small>
          <p className={`world-editor-status is-${state.status}`}>{state.status}</p>
        </div>
        <span>{regions?.document.regions.length ?? 0} authored</span>
      </header>
      {state.error && <p className="world-editor-error">{state.error}</p>}
      {editError && <p className="world-editor-error">{editError}</p>}

      <div className="world-editor-modebar" aria-label="Camera navigation">
        <span>Camera</span>
        {(['orbit', 'pan'] as const).map(mode => (
          <button key={mode} type="button" aria-label={`${capitalize(mode)} camera`} aria-pressed={navigationMode === mode} onClick={() => {
            setNavigationMode(mode);
            updateOptions({ navigationMode: mode });
          }}>{capitalize(mode)}</button>
        ))}
      </div>

      <div className="world-editor-toolbar">
        <button type="button" onClick={() => command({ type: 'add', kind: 'semantic' })}>
          Add region
        </button>
        <button type="button" disabled={!draft} onClick={() => draft && command({ type: 'duplicate', id: draft.id })}>
          Duplicate
        </button>
        <button className="is-danger" type="button" disabled={!draft} onClick={() => draft && command({ type: 'delete', id: draft.id })}>
          Delete
        </button>
      </div>

      <label className="world-editor-field">
        Region
        <select
          value={regions?.selectedId ?? ''}
          onChange={event => command({ type: 'select', id: event.target.value || undefined })}
        >
          <option value="">No selection</option>
          {regions?.document.regions.map(region => (
            <option key={region.id} value={region.id}>{region.name} · {region.kind}</option>
          ))}
        </select>
      </label>

      {draft && (
        <section className="world-region-form">
          <TransformControls state={regions} command={command} allowRotate={false} />
          <label className="world-editor-field">
            Stable ID
            <input value={draft.id} readOnly />
          </label>
          <label className="world-editor-field">
            Name
            <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} />
          </label>
          <label className="world-editor-field">
            Region kind
            <select value={draft.kind} onChange={event => updateDraft({ kind: event.target.value as ShadoWorldRegionKind })}>
              {REGION_KINDS.map(kind => <option key={kind}>{kind}</option>)}
            </select>
          </label>
          <label className="world-editor-check">
            <input type="checkbox" checked={draft.enabled} onChange={event => updateDraft({ enabled: event.target.checked })} />
            Enabled
          </label>
          <Vec3Editor label="Center" value={draft.center} onChange={center => updateDraft({ center })} />
          <Vec3Editor label="Size" value={draft.size} min={0.01} onChange={size => updateDraft({ size })} />
          <details className="world-editor-metadata">
            <summary>Phase and metadata</summary>
            <label className="world-editor-field">
              Phase mask
              <input type="number" min="0" max="4294967295" value={draft.phaseMask} onChange={event => updateDraft({ phaseMask: Number(event.target.value) >>> 0 })} />
            </label>
            <label className="world-editor-field">
              Tags
              <input value={draft.tags.join(', ')} onChange={event => updateDraft({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} />
            </label>
            <label className="world-editor-field">
              Metadata JSON
              <textarea rows={6} value={metadataText} onChange={event => {
                draftDirty.current = true;
                setMetadataText(event.target.value);
              }} />
            </label>
          </details>
          <button className="world-editor-apply" type="button" onClick={apply}>
            Apply changes
          </button>
        </section>
      )}

      <details className="world-editor-objects" open>
        <summary>
          Stamped objects ({regions?.document.objects.stamps.length.toLocaleString() ?? 0})
        </summary>
        <label className="world-editor-field">
          Find object
          <input
            value={objectFilter}
            placeholder="model or stamp ID"
            onChange={event => setObjectFilter(event.target.value)}
          />
        </label>
        <label className="world-editor-field">
          Object
          <select
            value={regions?.selectedObjectId ?? ''}
            onChange={event => command({
              type: 'object-select',
              id: event.target.value || undefined,
            })}
          >
            <option value="">No object selected</option>
            {(regions?.document.objects.stamps ?? [])
              .filter(stamp => {
                const query = objectFilter.trim().toLowerCase();
                return !query || stamp.id.toLowerCase().includes(query)
                  || stamp.prototype.toLowerCase().includes(query);
              })
              .slice(0, 500)
              .map(stamp => (
                <option key={stamp.id} value={stamp.id}>
                  {stamp.id} · {stamp.prototype}
                </option>
              ))}
          </select>
        </label>
        <div className="world-editor-toolbar">
          <select
            aria-label="Object prototype to stamp"
            value={stampPrototype}
            onChange={event => setStampPrototype(event.target.value)}
          >
            {(regions?.document.objects.prototypes ?? []).map(prototype => (
              <option key={prototype.id} value={prototype.id}>{prototype.id}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!stampPrototype}
            onClick={() => command({ type: 'object-add', prototype: stampPrototype })}
          >
            Stamp at camera
          </button>
          <button
            type="button"
            disabled={!stampPrototype}
            aria-pressed={regions?.stampPrototype === stampPrototype}
            onClick={() => command({
              type: 'object-stamp-mode',
              prototype: regions?.stampPrototype ? undefined : stampPrototype,
            })}
          >
            {regions?.stampPrototype ? 'Cancel surface stamp' : 'Stamp on surface'}
          </button>
        </div>
        {objectDraft && (
          <section className="world-region-form">
            <TransformControls state={regions} command={command} allowRotate />
            <label className="world-editor-field">
              Stable ID
              <input value={objectDraft.id} readOnly />
            </label>
            <label className="world-editor-field">
              Prototype
              <select
                value={objectDraft.prototype}
                onChange={event => updateObject({ prototype: event.target.value })}
              >
                {regions?.document.objects.prototypes.map(prototype => (
                  <option key={prototype.id} value={prototype.id}>{prototype.id}</option>
                ))}
              </select>
            </label>
            <label className="world-editor-check">
              <input
                type="checkbox"
                checked={objectDraft.enabled}
                onChange={event => updateObject({ enabled: event.target.checked })}
              />
              Enabled
            </label>
            <Vec3Editor
              label="Position"
              value={objectDraft.position}
              onChange={position => updateObject({ position })}
            />
            <Vec3Editor
              label="Rotation °"
              value={objectDraft.rotationDegrees}
              onChange={rotationDegrees => updateObject({ rotationDegrees })}
            />
            <Vec3Editor
              label="Scale"
              value={objectDraft.scale}
              min={0.001}
              onChange={scale => updateObject({ scale })}
            />
            <div className="world-editor-toolbar">
              <button
                type="button"
                onClick={() => command({ type: 'object-update', stamp: objectDraft })}
              >
                Apply object
              </button>
              <button
                type="button"
                onClick={() => command({ type: 'object-frame', id: objectDraft.id })}
              >
                Frame
              </button>
              <button
                type="button"
                onClick={() => command({ type: 'object-duplicate', id: objectDraft.id })}
              >
                Duplicate
              </button>
              <button
                className="is-danger"
                type="button"
                onClick={() => command({ type: 'object-delete', id: objectDraft.id })}
              >
                Delete
              </button>
            </div>
            <label className="world-editor-import">
              Load prototype preview GLB
              <input
                type="file"
                accept="model/gltf-binary,.glb"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) {
                    window.dispatchEvent(new CustomEvent('shado-world-import-object-glb', {
                      detail: { prototype: objectDraft.prototype, file },
                    }));
                  }
                  event.target.value = '';
                }}
              />
            </label>
            {objectAssetStatus && (
              <p className="world-editor-import-status">{objectAssetStatus}</p>
            )}
          </section>
        )}
      </details>

      <div className="world-editor-toolbar">
        <button type="button" onClick={exportDocument} disabled={!regions}>Export</button>
        <label className="world-editor-import">
          Import / replace
          <input type="file" accept="application/json,.json" onChange={event => void importDocument(event.target.files?.[0])} />
        </label>
        <label className="world-editor-import">
          Import legacy metadata
          <input
            type="file"
            accept="application/json,.json"
            onChange={event => void importLegacyMetadata(event.target.files?.[0])}
          />
        </label>
        <label className="world-editor-import">
          Import GLB
          <input type="file" accept="model/gltf-binary,.glb" onChange={event => {
            const file = event.target.files?.[0];
            if (file) window.dispatchEvent(new CustomEvent('shado-world-import-glb', { detail: { file } }));
            event.target.value = '';
          }} />
        </label>
      </div>
      {glbStatus && <p className="world-editor-import-status">Previewing {glbStatus}</p>}

      <details>
        <summary>Display and runtime diagnostics</summary>
        <div className="world-editor-toggles">
          <Toggle label="Regions and gizmos" checked={showRegions} onChange={value => { setShowRegions(value); updateOptions({ showRegions: value }); }} />
          <Toggle label="Stamped objects" checked={showObjects} onChange={value => { setShowObjects(value); updateOptions({ showObjects: value }); }} />
          <Toggle label="Solo selected region" checked={soloSelected} onChange={value => { setSoloSelected(value); updateOptions({ soloSelectedRegion: value }); }} />
          <Toggle label="Cluster bounds" checked={showBounds} onChange={value => { setShowBounds(value); updateOptions({ showClusterBounds: value }); }} />
          <Toggle label="Streaming tiles" checked={showTiles} onChange={value => { setShowTiles(value); updateOptions({ showTiles: value }); }} />
          <Toggle label="Freeze culling" checked={freeze} onChange={value => { setFreeze(value); updateOptions({ freezeCulling: value }); }} />
        </div>
        <dl>
          <dt>Zone</dt><dd>{state.name ?? 'qey2hh1'}</dd>
          <dt>Triangles</dt><dd>{state.triangles?.toLocaleString() ?? '—'}</dd>
          <dt>Visible clusters</dt><dd>{state.visibleClusters ?? '—'} / {state.clusters ?? '—'}</dd>
          <dt>Cells / portals</dt><dd>{state.cells ?? '—'} / {state.portals ?? '—'}</dd>
          <dt>Packets / chunks</dt><dd>{state.packets ?? '—'} / {state.renderChunks ?? '—'}</dd>
          <dt>Visible objects</dt><dd>{state.visibleObjects ?? '—'} / {state.objectStamps ?? '—'}</dd>
          <dt>Object models</dt><dd>{state.objectPrototypes ?? '—'}</dd>
          <dt>Reducer</dt><dd>{state.reducerMs == null ? '—' : `${state.reducerMs.toFixed(3)} ms`}</dd>
          <dt>Layout checksum</dt><dd>{state.layoutHash ?? '—'}</dd>
        </dl>
      </details>
      <p className="world-editor-note">
        Left-drag orbits; Pan mode makes left-drag pan. Right-drag pans at any time and the wheel zooms. Region changes are saved locally; export the sidecar before preprocessing.
      </p>
    </aside>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="world-editor-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}

function Vec3Editor({ label, value, min, onChange }: {
  label: string;
  value: [number, number, number];
  min?: number;
  onChange(value: [number, number, number]): void;
}) {
  return (
    <fieldset className="world-editor-vec3">
      <legend>{label}</legend>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => (
        <label key={axis}>{axis}<input type="number" step="any" min={min} value={formatNumber(value[index])} onChange={event => {
          const next = [...value] as [number, number, number];
          next[index] = min == null ? Number(event.target.value) : Math.max(min, Number(event.target.value));
          onChange(next);
        }} /></label>
      ))}
    </fieldset>
  );
}

function TransformControls({ state, command, allowRotate }: {
  state?: WorldRegionEditorState;
  command(detail: WorldRegionEditorCommand): void;
  allowRotate: boolean;
}) {
  const mode = state?.transformMode ?? 'move';
  const snap = state?.snapStep ?? 1;
  const target = mode === 'move' ? 'center' : 'size';
  const modes = allowRotate ? (['move', 'rotate', 'scale'] as const) : (['move', 'scale'] as const);
  return (
    <div className="world-editor-transform">
      <div className="world-editor-modebar" aria-label="Region transform">
        <span>Transform</span>
        {modes.map(next => (
          <button key={next} type="button" aria-label={`${capitalize(next)} region`} aria-pressed={mode === next} onClick={() => command({ type: 'transform-mode', mode: next })}>{capitalize(next)}</button>
        ))}
        <button
          type="button"
          aria-label="Frame selection"
          onClick={() => state?.selectedObjectId
            ? command({ type: 'object-frame', id: state.selectedObjectId })
            : command({ type: 'frame-selection' })}
        >
          Frame
        </button>
      </div>
      <label className="world-editor-snap">{mode === 'rotate' ? 'Degrees' : 'Snap'}
        <input aria-label="Transform snap step" type="number" min="0" step="0.25" value={snap} onChange={event => command({ type: 'snap-step', value: Number(event.target.value) })} />
      </label>
      {mode !== 'rotate' && <div className="world-editor-nudges" aria-label={`${capitalize(mode)} nudges`}>
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <div key={axis}>
            <span>{axis}</span>
            <button type="button" aria-label={`${capitalize(mode)} ${axis} negative`} onClick={() => command({ type: 'nudge', target, axis: index as 0 | 1 | 2, amount: -snap })}>−</button>
            <button type="button" aria-label={`${capitalize(mode)} ${axis} positive`} onClick={() => command({ type: 'nudge', target, axis: index as 0 | 1 | 2, amount: snap })}>+</button>
          </div>
        ))}
      </div>}
    </div>
  );
}

function formatNumber(value: number) {
  return Number(value.toFixed(3));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
