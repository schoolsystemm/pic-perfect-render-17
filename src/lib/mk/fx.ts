// Picture effects (Squeeze, PiP, Merge). OBS has no such transitions, so MK builds them in a helper
// scene called "MK FX": it nests the camera scenes as scene items, and the effect is just those items
// being moved / scaled / cropped frame by frame. This file is pure geometry — no OBS, no UI.
import type { Corner } from "./types";

export const FX_SCENE = "MK FX";

/** One layer's placement on the canvas, in OBS scene-item terms (top-left aligned). */
export interface FxRect {
  /** Optional bounds box (canvas px): the item is fitted inside it by OBS (used for the advertisement). */
  bw?: number;
  bh?: number;
  /** With a bounds box: cover it (cropped) instead of fitting inside it. */
  fill?: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
  cl: number;
  cr: number;
  ct: number;
  cb: number;
}

/** null = layer hidden. */
export type FxPair = { a: FxRect | null; b: FxRect | null };

export type SqueezeDir = "l" | "r" | "u" | "d";
export const SQUEEZE_DIRS: SqueezeDir[] = ["l", "u", "r", "d"];
export const SQUEEZE_GLYPH: Record<SqueezeDir, string> = { l: "◀", u: "▲", r: "▶", d: "▼" };

export const PIP_CORNERS: Corner[] = ["tl", "tr", "br", "bl"];
export const PIP_GLYPH: Record<Corner, string> = { tl: "◤", tr: "◥", br: "◢", bl: "◣" };
export const PIP_SIZES = [0.2, 0.3, 0.4];

export type FxLayoutKind = "pip" | "merge";

export interface FxConfig {
  pipCorner: Corner;
  /** Inset width as a fraction of the picture (0.2 .. 0.4). */
  pipSize: number;
  squeezeDir: SqueezeDir;
}

export const DEFAULT_FX: FxConfig = { pipCorner: "br", pipSize: 0.3, squeezeDir: "l" };

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const rect = (x: number, y: number, w: number, h: number, W: number, H: number): FxRect | null =>
  w < 2 || h < 2 ? null : { x, y, sx: w / W, sy: h / H, cl: 0, cr: 0, ct: 0, cb: 0 };

/** Old picture is squeezed out, new picture is squeezed in behind it. t: 0 = all A, 1 = all B. */
export function squeezeFrame(dir: SqueezeDir, t: number, W: number, H: number): FxPair {
  switch (dir) {
    case "l":
      return { a: rect(0, 0, W * (1 - t), H, W, H), b: rect(W * (1 - t), 0, W * t, H, W, H) };
    case "r":
      return { a: rect(W * t, 0, W * (1 - t), H, W, H), b: rect(0, 0, W * t, H, W, H) };
    case "u":
      return { a: rect(0, 0, W, H * (1 - t), W, H), b: rect(0, H * (1 - t), W, H * t, W, H) };
    case "d":
      return { a: rect(0, H * t, W, H * (1 - t), W, H), b: rect(0, 0, W, H * t, W, H) };
  }
}

/** Picture-in-picture: B grows out of its corner slot over a full-screen A. t: 0 = no inset, 1 = inset in place. */
export function pipFrame(corner: Corner, size: number, t: number, W: number, H: number): FxPair {
  const w = W * size;
  const h = H * size;
  const m = Math.min(W, H) * 0.04;
  const x = corner.endsWith("r") ? W - m - w : m;
  const y = corner.startsWith("b") ? H - m - h : m;
  return { a: rect(0, 0, W, H, W, H), b: rect(x + (w * (1 - t)) / 2, y + (h * (1 - t)) / 2, w * t, h * t, W, H) };
}

/**
 * Merge: the two pictures slide together into a split screen (A left, B right). Each half shows the
 * CENTRE of its picture (cropped, not squashed). t: 0 = all A, 1 = split.
 */
export function mergeFrame(t: number, W: number, H: number): FxPair {
  const c = (W / 4) * t;
  const base = { y: 0, sx: 1, sy: 1, ct: 0, cb: 0 };
  return {
    a: { ...base, x: 0, cl: c, cr: c },
    b: t < 0.002 ? null : { ...base, x: W * (1 - t / 2), cl: c, cr: c },
  };
}

// ---------------------------------------------------------------------------------------------
// Live compositor: persistent PIP 1 / PIP 2, Squeeze Merge (advertisement) and Move transitions.
// OBS scenes used (all created by MK, hidden from the pickers):
//   MK LIVE A / MK LIVE B  two program "buses". Each nests every cam scene plus the overlays on top.
//   MK PIP 1 / MK PIP 2    one scene each that holds the scene assigned to that PIP (persistent).
// While anything live is on, OBS program is one of the buses; a normal OBS take (cut / fade / T-bar)
// goes bus A <-> bus B, so PIPs and the advertisement stay up through every transition.
// ---------------------------------------------------------------------------------------------
export const LIVE_BUSES: [string, string] = ["MK LIVE A", "MK LIVE B"];
export const PIP_SCENES: [string, string] = ["MK PIP 1", "MK PIP 2"];
export const isLiveBus = (name: string | null | undefined) => !!name && LIVE_BUSES.includes(name);

export interface PipSlot {
  /** Scene assigned to this PIP. Stays until the operator changes it. */
  scene: string | null;
  corner: Corner;
  size: number;
}

export type AdLayout = "r" | "l" | "b" | "t";
export const AD_LAYOUTS: { id: AdLayout; label: string }[] = [
  { id: "r", label: "SIDE ▶" },
  { id: "l", label: "◀ SIDE" },
  { id: "b", label: "BOTTOM" },
  { id: "t", label: "TOP" },
];
export const AD_SIZES = [0.2, 0.25, 0.3, 0.35];

export interface AdConfig {
  /** Any OBS source: a scene, image, video, browser source (animated graphic)… */
  scene: string | null;
  layout: AdLayout;
  /** Share of the picture the advertisement takes (0.15 .. 0.4). */
  size: number;
  /** fit = whole ad visible; fill = ad covers its area (cropped). */
  fit: "fit" | "fill";
}

export const DEFAULT_PIPS: PipSlot[] = [
  { scene: null, corner: "br", size: 0.3 },
  { scene: null, corner: "bl", size: 0.3 },
];
export const DEFAULT_AD: AdConfig = { scene: null, layout: "r", size: 0.25, fit: "fit" };

export const FULL_RECT: FxRect = { x: 0, y: 0, sx: 1, sy: 1, cl: 0, cr: 0, ct: 0, cb: 0 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpRect(a: FxRect, b: FxRect, t: number): FxRect {
  const r: FxRect = {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
    cl: lerp(a.cl, b.cl, t),
    cr: lerp(a.cr, b.cr, t),
    ct: lerp(a.ct, b.ct, t),
    cb: lerp(a.cb, b.cb, t),
  };
  if (a.bw !== undefined && b.bw !== undefined && a.bh !== undefined && b.bh !== undefined) {
    r.bw = lerp(a.bw, b.bw, t);
    r.bh = lerp(a.bh, b.bh, t);
    const fill = b.fill ?? a.fill;
    if (fill !== undefined) r.fill = fill;
  }
  return r;
}

/** Final PiP rectangle for a corner + size (the same geometry the old PIP button uses). */
export function pipRect(corner: Corner, size: number, W: number, H: number): FxRect {
  return pipFrame(corner, size, 1, W, H).b as FxRect;
}

/** PiP grows out of its slot: t 0 = nothing, 1 = in place. null while invisible. */
export function pipAt(corner: Corner, size: number, t: number, W: number, H: number): FxRect | null {
  return pipFrame(corner, size, t, W, H).b;
}

/** Move (push) transition: A slides out, B slides in behind it. No scaling. t: 0 = all A, 1 = all B. */
export function moveFrame(dir: SqueezeDir, t: number, W: number, H: number): FxPair {
  const at = (x: number, y: number): FxRect => ({ x, y, sx: 1, sy: 1, cl: 0, cr: 0, ct: 0, cb: 0 });
  switch (dir) {
    case "l":
      return { a: at(-W * t, 0), b: at(W * (1 - t), 0) };
    case "r":
      return { a: at(W * t, 0), b: at(-W * (1 - t), 0) };
    case "u":
      return { a: at(0, -H * t), b: at(0, H * (1 - t)) };
    case "d":
      return { a: at(0, H * t), b: at(0, -H * (1 - t)) };
  }
}

/** Where the program picture and the advertisement sit once Squeeze Merge is fully in. */
export function sqmTargets(layout: AdLayout, size: number, W: number, H: number): { main: FxRect; ad: FxRect } {
  const s = 1 - size;
  const mw = W * s;
  const mh = H * s;
  const main = (x: number, y: number): FxRect => ({ x, y, sx: s, sy: s, cl: 0, cr: 0, ct: 0, cb: 0 });
  const ad = (x: number, y: number, bw: number, bh: number): FxRect => ({ x, y, sx: 1, sy: 1, cl: 0, cr: 0, ct: 0, cb: 0, bw, bh });
  switch (layout) {
    case "r":
      return { main: main(0, (H - mh) / 2), ad: ad(mw, 0, W - mw, H) };
    case "l":
      return { main: main(W - mw, (H - mh) / 2), ad: ad(0, 0, W - mw, H) };
    case "b":
      return { main: main((W - mw) / 2, 0), ad: ad(0, mh, W, H - mh) };
    case "t":
      return { main: main((W - mw) / 2, H - mh), ad: ad(0, 0, W, H - mh) };
  }
}

/** Squeeze Merge at rest: program full screen, advertisement parked just outside the picture. */
export function sqmRest(layout: AdLayout, size: number, W: number, H: number): { main: FxRect; ad: FxRect } {
  const end = sqmTargets(layout, size, W, H).ad;
  const ad = { ...end };
  if (layout === "r") ad.x = W;
  else if (layout === "l") ad.x = -(end.bw ?? 0);
  else if (layout === "b") ad.y = H;
  else ad.y = -(end.bh ?? 0);
  return { main: { ...FULL_RECT }, ad };
}

/** Put a full-canvas rect inside `region` (the squeezed program area). */
export function placeIn(r: FxRect, region: FxRect): FxRect {
  return { ...r, x: region.x + r.x * region.sx, y: region.y + r.y * region.sy, sx: r.sx * region.sx, sy: r.sy * region.sy };
}
