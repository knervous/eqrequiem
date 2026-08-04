// AtlasBuilder.ts
import { MaxRectsPacker, PACKING_LOGIC, type IRectangle } from 'maxrects-packer';
import { RawTexture2DArray, Texture, Scene, BABYLON } from '../../babylon';
type DebugOptions = {
  export?: boolean; // download PNGs + JSON
  name?: string; // filename prefix
};
type Source = { id: string; tex: Texture }; // CHANGED
type RectUV = { u0: number; v0: number; u1: number; v1: number };
type PixelRect = { x: number; y: number; w: number; h: number };
type EntryInfo = { layer: number; rect: RectUV; px?: PixelRect };
export type ArrayAtlas = {
  texture: RawTexture2DArray;
  layerCount: number;
  pageSize: number;
  entries: Record<string, EntryInfo>;
};

/**
 * Copy one sprite into the page buffer verbatim.
 *
 * Canvas compositing is deliberately avoided here. `putImageData` +
 * `drawImage` round-trips through premultiplied storage, so every texel with
 * alpha < 255 comes back with its RGB scaled toward the transparent page —
 * fully transparent texels come back pure black. UE-style assets keep real
 * color under a zero-alpha dye mask, and losing it rendered whole modules
 * black.
 */
export function blit(
  page: Uint8ClampedArray,
  pageSize: number,
  img: ImageData,
  dx: number,
  dy: number
) {
  const rowBytes = img.width * 4;
  for (let row = 0; row < img.height; row++) {
    const targetY = dy + row;
    if (targetY < 0 || targetY >= pageSize) continue;
    const sourceStart = row * rowBytes;
    page.set(
      img.data.subarray(sourceStart, sourceStart + rowBytes),
      (targetY * pageSize + dx) * 4
    );
  }
}

/** Clamp-to-edge bleed around a placed rect, in the raw page buffer. */
export function extrude(
  page: Uint8ClampedArray,
  pageSize: number,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number
) {
  if (b <= 0) return;
  const left = Math.max(0, x - b);
  const right = Math.min(pageSize, x + w + b);
  const top = Math.max(0, y - b);
  const bottom = Math.min(pageSize, y + h + b);
  for (let targetY = top; targetY < bottom; targetY++) {
    const sourceY = Math.min(y + h - 1, Math.max(y, targetY));
    const insideRows = targetY >= y && targetY < y + h;
    for (let targetX = left; targetX < right; targetX++) {
      if (insideRows && targetX >= x && targetX < x + w) continue;
      const sourceX = Math.min(x + w - 1, Math.max(x, targetX));
      const source = (sourceY * pageSize + sourceX) * 4;
      const target = (targetY * pageSize + targetX) * 4;
      page[target] = page[source];
      page[target + 1] = page[source + 1];
      page[target + 2] = page[source + 2];
      page[target + 3] = page[source + 3];
    }
  }
}
async function readTextureToImageData(scene: Scene, tex: Texture): Promise<ImageData> {
  const it = (tex as any).getInternalTexture?.() ?? (tex as any)._texture;
  if (!it) throw new Error('Texture has no InternalTexture');

  // Ensure the texture is ready on GPU
  if (!tex.isReady()) {
    await new Promise<void>(resolve => {
      const obs = tex.onLoadObservable?.addOnce?.(() => resolve()) || setTimeout(resolve, 0);
      if (!obs) resolve();
    });
  }

  const w = it.width,
    h = it.height;

  // Fast path: uncompressed UNSIGNED_BYTE. Legacy Babylon assets commonly
  // decode JPEGs as RGB while glTF textures are usually RGBA; read both and
  // normalize to the atlas' RGBA8 contract.
  if (!it.is3D && !it.isCube) {
    const source = (await tex.readPixels()) as ArrayBufferView | null;
    if (!source) throw new Error('readTextureToImageData: texture returned no pixels');
    const values = source as unknown as ArrayLike<number>;
    const channels = values.length / Math.max(1, w * h);
    if (channels === 4 || channels === 3 || channels === 1) {
      const rgba = new Uint8ClampedArray(w * h * 4);
      const isByte = source instanceof Uint8Array || source instanceof Uint8ClampedArray;
      const isFloat = source instanceof Float32Array || source instanceof Float64Array;
      const channel = (index: number) => {
        const value = Number(values[index] ?? 0);
        if (isByte) return value;
        if (isFloat) return Math.round(Math.max(0, Math.min(1, value)) * 255);
        // Half/unsigned-short texture readback.
        return Math.round(Math.max(0, Math.min(65535, value)) / 257);
      };
      for (let pixel = 0; pixel < w * h; pixel++) {
        const sourceOffset = pixel * channels;
        const targetOffset = pixel * 4;
        rgba[targetOffset] = channel(sourceOffset);
        rgba[targetOffset + 1] = channels >= 3 ? channel(sourceOffset + 1) : channel(sourceOffset);
        rgba[targetOffset + 2] = channels >= 3 ? channel(sourceOffset + 2) : channel(sourceOffset);
        rgba[targetOffset + 3] = channels === 4 ? channel(sourceOffset + 3) : 255;
      }
      return new ImageData(rgba, w, h);
    }
  }

  throw new Error('readTextureToImageData: Unsupported texture type for readPixels');
}

/** Packs with maxrects; each page becomes one layer of a 2D array. No network. */
export async function buildArrayAtlasFromSources(
  scene: Scene,
  sources: Source[],
  {
    pageSize = 2048,
    padding = 2,
    border = 0,
    bleed = 2,
    pot = true,
    square = true,
    allowRotation = false,
    logic = PACKING_LOGIC.MAX_EDGE,
    sampling = BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
    fit = 'cover' as 'cover' | 'contain',
    debug,
  }: {
    pageSize?: number;
    padding?: number;
    border?: number;
    bleed?: number;
    pot?: boolean;
    square?: boolean;
    allowRotation?: boolean;
    logic?: (typeof PACKING_LOGIC)[keyof typeof PACKING_LOGIC];
    mipmaps?: boolean;
    sampling?: number;
    fit?: 'cover' | 'contain';
    debug?: DebugOptions;
  } = {}
): Promise<ArrayAtlas> {
  // 0) Read pixels from existing textures -> ImageData[]
  const images = await Promise.all(sources.map(s => readTextureToImageData(scene, s.tex)));

  // 1) Describe rects for the packer
  const rects: IRectangle[] = images.map((img, i) => ({
    width: img.width,
    height: img.height,
    x: 0,
    y: 0,
    data: { id: sources[i].id, idx: i },
  }));

  // 2) Pack into pageSize×pageSize pages
  const packer = new MaxRectsPacker<IRectangle>(pageSize, pageSize, padding, {
    pot,
    square,
    allowRotation,
    border,
    smart: true,
    logic,
  });
  packer.addArray(rects);

  const bins = packer.bins;
  const layers = bins.length;

  // 3) Big pixel buffer for the array
  const layerStride = pageSize * pageSize * 4;
  const pixels = new Uint8Array(layerStride * layers);
  const entries: Record<string, EntryInfo> = {};

  // 4) Page buffer, plus a canvas used only when a sprite has to be rescaled
  const page = new Uint8ClampedArray(layerStride);
  let scaleCanvas: HTMLCanvasElement | undefined;
  const debugCanvases: HTMLCanvasElement[] = []; // <— capture pages for export

  bins.forEach((bin, layer) => {
    page.fill(0);

    for (const r of bin.rects) {
      const { id, idx } = r.data as { id: string; idx: number };
      const img = images[idx];

      // Compute placement
      let dx = r.x,
        dy = r.y,
        dw = r.width,
        dh = r.height;
      if (fit === 'contain') {
        const scale = Math.min(r.width / img.width, r.height / img.height);
        dw = Math.max(1, Math.round(img.width * scale));
        dh = Math.max(1, Math.round(img.height * scale));
        dx = r.x + Math.floor((r.width - dw) / 2);
        dy = r.y + Math.floor((r.height - dh) / 2);
      }

      if (dw === img.width && dh === img.height) {
        blit(page, pageSize, img, dx, dy);
      } else {
        // Rescaling still needs the canvas resampler, which premultiplies and
        // therefore darkens RGB under partially transparent texels. Rects are
        // created at each image's own size, so this is only reachable when a
        // caller opts into 'contain' or rotation.
        scaleCanvas ??= document.createElement('canvas');
        const scaleCtx = scaleCanvas.getContext('2d', { willReadFrequently: true })!;
        if (scaleCanvas.width !== dw || scaleCanvas.height !== dh) {
          scaleCanvas.width = dw;
          scaleCanvas.height = dh;
        }
        scaleCtx.clearRect(0, 0, dw, dh);
        const spriteBitmap = document.createElement('canvas');
        spriteBitmap.width = img.width;
        spriteBitmap.height = img.height;
        spriteBitmap.getContext('2d')!.putImageData(img, 0, 0);
        scaleCtx.drawImage(spriteBitmap, 0, 0, img.width, img.height, 0, 0, dw, dh);
        blit(page, pageSize, scaleCtx.getImageData(0, 0, dw, dh), dx, dy);
      }

      // clamp-to-edge bleed around the drawn rect
      extrude(page, pageSize, dx, dy, dw, dh, bleed);

      const u0 = dx / pageSize,
        v0 = dy / pageSize;
      const u1 = (dx + dw) / pageSize,
        v1 = (dy + dh) / pageSize;
      entries[id] = { layer, rect: { u0, v0, u1, v1 } };
    }

    pixels.set(page, layer * layerStride);

    if (debug?.export) {
      const clone = document.createElement('canvas');
      clone.width = pageSize;
      clone.height = pageSize;
      clone.getContext('2d')!.putImageData(new ImageData(page.slice(), pageSize, pageSize), 0, 0);
      debugCanvases.push(clone);
    }
  });

  // 5) Upload as Texture2DArray
  const texArr = new BABYLON.RawTexture2DArray(
    pixels,
    pageSize,
    pageSize,
    layers,
    BABYLON.Engine.TEXTUREFORMAT_RGBA,
    scene,
    false, // mipmaps
    /* invertY */ false, // <— was false
    sampling,
    BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
  );
  texArr.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texArr.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

  if (debug?.export) {
    await exportAtlasDebug({
      name: debug.name ?? 'atlas',
      pageSize,
      canvases: debugCanvases,
      entries,
    });
  }

  return { texture: texArr, layerCount: layers, pageSize, entries };
}

// Debug

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function downloadJSON(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function canvasToPNGBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b!), 'image/png');
  });
}

async function exportAtlasDebug(args: {
  name: string;
  pageSize: number;
  canvases: HTMLCanvasElement[];
  entries: Record<
    string,
    {
      layer: number;
      rect: { u0: number; v0: number; u1: number; v1: number };
      px?: { x: number; y: number; w: number; h: number };
    }
  >;
}) {
  const { name, canvases, entries, pageSize } = args;

  // 1) PNGs
  for (let i = 0; i < canvases.length; i++) {
    const blob = await canvasToPNGBlob(canvases[i]);
    downloadBlob(blob, `${name}_layer${i}.png`);
  }

  // 2) JSON manifest
  const manifest = {
    name,
    pageSize,
    layers: canvases.length,
    pages: Array.from({ length: canvases.length }, (_, i) => ({
      index: i,
      png: `${name}_layer${i}.png`,
    })),
    // include both GL-space rects and pixel-space rects
    entries, // { [id]: { layer, rect:{u0,v0,u1,v1}, px:{x,y,w,h} } }
  };
  await new Promise(res => setTimeout(res, 1000)); // let PNG downloads start first
  downloadJSON(manifest, `${name}.json`);
}
