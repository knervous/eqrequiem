import type { PackedDQVAT } from './VATBuilder';

export type VATHeadlessBakeRequest = {
  id: number;
  model: ArrayBuffer;
  clipNames?: string[];
  useHalf?: boolean;
  detectScale?: boolean;
  /** The consumer merges source vertices with their world transforms. */
  mergeWorldSpace?: boolean;
  /** Prefer the skinned mesh whose name starts with this value. */
  meshNamePrefix?: string;
};

export type VATHeadlessBakeResponse =
  | { id: number; packed: PackedDQVAT }
  | { id: number; error: string };

let requestId = 0;
const workerSource = new Map<string, Promise<string>>();

async function createWorker(url: string): Promise<{ worker: Worker; objectUrl?: string }> {
  const resolved = new URL(url, globalThis.location?.href);
  let source = workerSource.get(resolved.href);
  if (!source) {
    // Always materialize the bundled worker as a blob. Besides supporting the
    // cross-origin Babylon Playground URL, this prevents a browser's Worker
    // script cache from keeping an older bake runtime after a local rebuild.
    source = fetch(resolved, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`Failed to fetch VAT bake worker: ${response.status}`);
      return response.text();
    });
    workerSource.set(resolved.href, source);
  }
  const objectUrl = URL.createObjectURL(new Blob([await source], { type: 'text/javascript' }));
  return { worker: new Worker(objectUrl), objectUrl };
}

/** Bake one GLB completely off-thread with Babylon NullEngine. */
export async function bakeVatWithHeadlessWorker(
  workerUrl: string,
  model: ArrayBuffer,
  options: Omit<VATHeadlessBakeRequest, 'id' | 'model'> = {}
): Promise<PackedDQVAT> {
  const { worker, objectUrl } = await createWorker(workerUrl);
  const id = ++requestId;
  try {
    return await new Promise<PackedDQVAT>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<VATHeadlessBakeResponse>) => {
        if (event.data.id !== id) return;
        if ('error' in event.data) reject(new Error(event.data.error));
        else resolve(event.data.packed);
      };
      worker.onerror = event => reject(new Error(event.message || 'Headless VAT worker failed'));
      const request: VATHeadlessBakeRequest = { id, model, ...options };
      worker.postMessage(request, [model]);
    });
  } finally {
    worker.terminate();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
