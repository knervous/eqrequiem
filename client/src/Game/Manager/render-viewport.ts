export type CssViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedRenderViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Converts a CSS-pixel rectangle into Babylon's normalized, bottom-origin
 * viewport space. This deliberately does not use backing-buffer dimensions:
 * hardware scaling and device pixel ratio do not affect normalized layout.
 */
export function normalizeRenderViewport(
  bounds: CssViewportBounds,
  canvas: CssViewportBounds,
): NormalizedRenderViewport {
  if (
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const left = clamp((bounds.x - canvas.x) / canvas.width);
  const right = clamp(
    (bounds.x + bounds.width - canvas.x) / canvas.width,
  );
  const bottom = clamp(
    (canvas.y + canvas.height - bounds.y - bounds.height) / canvas.height,
  );
  const top = clamp((canvas.y + canvas.height - bounds.y) / canvas.height);
  return {
    x: left,
    y: bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, top - bottom),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
