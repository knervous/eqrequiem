import { asPrelude } from './prelude';

export function genericASModuleSource(): string {
  return `${asPrelude()}/* @generated generic kernels */

// ---- mat4 helpers ----

// write translation from SoA into a mat4 column 3 (offset offT = off + 12)
export function mat4_setTranslation_SoA(
  base: usize, count: i32, strideF: i32, offTF: i32,
  tx: usize, ty: usize, tz: usize
): void {
  for (let i = 0; i < count; i++) {
    const li = <usize>((i * strideF + offTF) << 2);
    const ii = <usize>(i << 2);
    store<f32>(base + li + 0, load<f32>(tx + ii));
    store<f32>(base + li + 4, load<f32>(ty + ii));
    store<f32>(base + li + 8, load<f32>(tz + ii));
  }
}

// multiply the 3×3 part by per-instance scale s[i]
export function mat4_uniformScale_FromArray(
  base: usize, count: i32, strideF: i32, offF: i32, sPtr: usize
): void {
  for (let i = 0; i < count; i++) {
    const m = base + <usize>(((i * strideF + offF) << 2));
    const s = load<f32>(sPtr + <usize>(i << 2));
    // row0 (col 0..2)
    store<f32>(m +  0, load<f32>(m +  0) * s);
    store<f32>(m +  4, load<f32>(m +  4) * s);
    store<f32>(m +  8, load<f32>(m +  8) * s);
    // row1
    store<f32>(m + 16, load<f32>(m + 16) * s);
    store<f32>(m + 20, load<f32>(m + 20) * s);
    store<f32>(m + 24, load<f32>(m + 24) * s);
    // row2
    store<f32>(m + 32, load<f32>(m + 32) * s);
    store<f32>(m + 36, load<f32>(m + 36) * s);
    store<f32>(m + 40, load<f32>(m + 40) * s);
  }
}

// absolute scale: write baseR (seeded 3×3) * s[i] into the 3×3
// baseR points to N*12 f32 (three padded rows)
export function mat4_uniformScaleAbs_FromArray(
  base: usize, count: i32, strideF: i32, offF: i32, sPtr: usize, baseR: usize
): void {
  for (let i = 0; i < count; i++) {
    const m = base + <usize>(((i * strideF + offF) << 2));
    const bi = baseR + <usize>((i * 12) << 2);
    const s = load<f32>(sPtr + <usize>(i << 2));
    // row0
    store<f32>(m +  0, load<f32>(bi +  0) * s);
    store<f32>(m +  4, load<f32>(bi +  4) * s);
    store<f32>(m +  8, load<f32>(bi +  8) * s);
    // row1
    store<f32>(m + 16, load<f32>(bi + 16) * s);
    store<f32>(m + 20, load<f32>(bi + 20) * s);
    store<f32>(m + 24, load<f32>(bi + 24) * s);
    // row2
    store<f32>(m + 32, load<f32>(bi + 32) * s);
    store<f32>(m + 36, load<f32>(bi + 36) * s);
    store<f32>(m + 40, load<f32>(bi + 40) * s);
  }
}

// ---- vec4 helpers ----

export function vec4_setRGBA_SoA(
  base: usize, count: i32, strideF: i32, offF: i32,
  rp: usize, gp: usize, bp: usize, ap: usize
): void {
  for (let i = 0; i < count; i++) {
    const c = base + <usize>(((i * strideF + offF) << 2));
    const ii = <usize>(i << 2);
    store<f32>(c +  0, load<f32>(rp + ii));
    store<f32>(c +  4, load<f32>(gp + ii));
    store<f32>(c +  8, load<f32>(bp + ii));
    store<f32>(c + 12, load<f32>(ap + ii));
  }
}

export function vec4_mulRGBA(
  base: usize, count: i32, strideF: i32, offF: i32,
  r: f32, g: f32, b: f32, a: f32
): void {
  for (let i = 0; i < count; i++) {
    const c = base + <usize>(((i * strideF + offF) << 2));
    store<f32>(c +  0, load<f32>(c +  0) * r);
    store<f32>(c +  4, load<f32>(c +  4) * g);
    store<f32>(c +  8, load<f32>(c +  8) * b);
    store<f32>(c + 12, load<f32>(c + 12) * a);
  }
}

export function vec4_setXYZ_SoA(
  base: usize, count: i32, strideF: i32, offF: i32,
  tx: usize, ty: usize, tz: usize, setWToOne: i32
): void {
  for (let i = 0; i < count; i++) {
    const v = base + <usize>(((i * strideF + offF) << 2));
    const ii = <usize>(i << 2);
    store<f32>(v +  0, load<f32>(tx + ii));
    store<f32>(v +  4, load<f32>(ty + ii));
    store<f32>(v +  8, load<f32>(tz + ii));
    if (setWToOne) store<f32>(v + 12, 1.0);
  }
}

// Write scalar field from array
export function f32_set_FromArray(
  base: usize, count: i32, strideF: i32, offF: i32, src: usize
): void {
  for (let i = 0; i < count; i++) {
    const dst = base + <usize>(((i * strideF + offF) << 2));
    const s   = load<f32>(src + <usize>(i << 2));
    store<f32>(dst, s);
  }
}

export let gTime: f32 = 0.0;
export function resetTime(): void { gTime = 0.0; }

// ---- fast trig (range-reduced) ---------------------------------------------
const PI  : f32 = 3.141592653589793;
const TAU : f32 = 6.283185307179586;
const HPI : f32 = 1.5707963267948966;
const INV_TAU: f32 = 1.0 / TAU;

// Range-reduce to [-PI, PI] using cheap integer wrap
@inline function wrapPI(x: f32): f32 {
  let k = <i32>(x * INV_TAU);   // truncate toward 0
  x -= f32(k) * TAU;
  if (x >  PI)  x -= TAU;
  if (x < -PI)  x += TAU;
  return x;
}

// Fast sine (parabolic + correction), max err ~1e-3 on [-PI, PI]
@inline function sinFast(x: f32): f32 {
  x = wrapPI(x);
  const B: f32 = 1.2732395447351628;   // 4/PI
  const C: f32 = 0.4052847345693511;   // 4/PI^2
  const P: f32 = 0.225;
  let y = x * (B - C * Mathf.abs(x));
  return y + P * (y * Mathf.abs(y) - y);
}

@inline function cosFast(x: f32): f32 {
  return sinFast(x + HPI);
}

export function orbitDelta(
  base: usize, count: i32, strideF: i32,
  offTransF: i32, offColorF: i32,
  deltaTime: f32, phaseStep: f32,
  radMin: f32, radRange: f32, wobbleAmp: f32
): void {
  if (deltaTime == 0.0) return;

  let t0: f32 = gTime;
  let t1: f32 = t0 + deltaTime;
  let tm: f32 = t0 + 0.5 * deltaTime;

  // global (per-frame) factorPools for delta identities
  // cos(B)-cos(A) = -2 sin((A+B)/2) * sin((B-A)/2)
  // sin(B)-sin(A) =  2 cos((A+B)/2) * sin((B-A)/2)
  const s_quarterX: f32 = sinFast(0.25 * deltaTime);  // for 0.5*t terms
  const s_halfY   : f32 = sinFast(0.45 * deltaTime);  // for 0.9*t terms

  // hue sweep constants (120° shifts)
  const COS120: f32 = -0.5;
  const SIN120: f32 =  0.8660254037844386;
  const COLOR_SPEED: f32 = 0.15;
  const PHASE_COLOR: f32 = 0.10;

  for (let i = 0; i < count; i++) {
    const ph  = f32(i) * phaseStep;
    const rad = radMin + radRange * (f32(i) * 0.61803 % 1.0);

    // --- X/Z move (freq 0.5): mid angle once
    const midXZ: f32 = 0.5 * tm + ph;
    const sMid: f32  = sinFast(midXZ);
    const cMid: f32  = cosFast(midXZ);

    const dx: f32 = rad * (-2.0 * sMid * s_quarterX); // cos delta
    const dz: f32 = rad * ( 2.0 * cMid * s_quarterX); // sin delta

    // --- Y move (freq 0.9, phase 2*ph): mid angle once
    const midY: f32 = 0.9 * tm + 2.0 * ph;
    const dy: f32   = 0.8 * (2.0 * cosFast(midY) * s_halfY);

    // apply translation delta
    const tv: usize = base + <usize>(((i * strideF + offTransF) << 2));
    store<f32>(tv +  0, load<f32>(tv +  0) + dx);
    store<f32>(tv +  4, load<f32>(tv +  4) + dy);
    store<f32>(tv +  8, load<f32>(tv +  8) + dz);

    // --- color: compute cos/sin once at hue, derive 120° and 240°
    const hue = t1 * COLOR_SPEED + ph * PHASE_COLOR;
    const a   = TAU * hue;
    const c0  = cosFast(a);
    const s0  = sinFast(a);

    // cos(a+120) = c0*COS120 - s0*SIN120
    // cos(a+240) = c0*COS120 + s0*SIN120
    const r: f32 = 0.5 + 0.5 * c0;
    const g: f32 = 0.5 + 0.5 * (c0 * COS120 - s0 * SIN120);
    const b: f32 = 0.5 + 0.5 * (c0 * COS120 + s0 * SIN120);

    // brightness pulse in alpha
    const pulse: f32 = 0.65 + 0.35 * sinFast(t1 * 0.7 + ph * 0.5);

    const cv: usize = base + <usize>(((i * strideF + offColorF) << 2));
    store<f32>(cv +  0, r);
    store<f32>(cv +  4, g);
    store<f32>(cv +  8, b);
    store<f32>(cv + 12, pulse);
  }

  gTime = t1;
}
`;
}
