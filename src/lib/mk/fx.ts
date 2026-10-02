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
  /** A complete OBS scene-item transform (used for DSK items that keep their own look). Wins over every other field. */
  raw?: Record<string, unknown>;
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

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** A spot picked by hand: 0..1 across the free space (0,0 = top-left, 1,1 = bottom-right). */
export interface PlacePos {
  x: number;
  y: number;
}

/** DSK placement picked by hand: spot + size (share of the picture width). */
export interface DskPlace extends PlacePos {
  size: number;
}
export const DSK_PLACE_SIZES = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 1];

/** Bounding box for a hand-placed DSK: the item is fitted inside it by OBS, so any source keeps its shape. */
export function dskPlaceRect(place: DskPlace, W: number, H: number): FxRect {
  const bw = Math.max(2, W * place.size);
  const bh = Math.max(2, H * place.size);
  return {
    x: clamp01(place.x) * (W - bw),
    y: clamp01(place.y) * (H - bh),
    sx: 1,
    sy: 1,
    cl: 0,
    cr: 0,
    ct: 0,
    cb: 0,
    bw,
    bh,
  };
}

/** Put an OBS item transform inside the squeezed program area (position, scale and bounds follow the region). */
export function rawIn(base: Record<string, unknown>, region: FxRect): Record<string, unknown> {
  const n = (k: string, d = 0) => (typeof base[k] === "number" ? (base[k] as number) : d);
  return {
    ...base,
    positionX: region.x + n("positionX") * region.sx,
    positionY: region.y + n("positionY") * region.sy,
    scaleX: n("scaleX", 1) * region.sx,
    scaleY: n("scaleY", 1) * region.sy,
    boundsWidth: n("boundsWidth") * region.sx,
    boundsHeight: n("boundsHeight") * region.sy,
  };
}

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
export function pipFrame(
  corner: Corner,
  size: number,
  t: number,
  W: number,
  H: number,
  pos?: PlacePos | null,
): FxPair {
  const w = W * size;
  const h = H * size;
  const m = Math.min(W, H) * 0.04;
  // A physically picked spot (pos: 0..1 across the free space) wins over the corner.
  const x = pos ? m + clamp01(pos.x) * (W - 2 * m - w) : corner.endsWith("r") ? W - m - w : m;
  const y = pos ? m + clamp01(pos.y) * (H - 2 * m - h) : corner.startsWith("b") ? H - m - h : m;
  return {
    a: rect(0, 0, W, H, W, H),
    b: rect(x + (w * (1 - t)) / 2, y + (h * (1 - t)) / 2, w * t, h * t, W, H),
  };
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

// ---------------------------------------------------------------------------------------------
// STAGE scenes. OBS Studio Mode (the ⋮ menu beside "Transition" → "Duplicate Scene", ON by default) puts a
// private COPY of the scene on program when you take it. Moving / showing / hiding items of that scene
// afterwards changes the original (the controller's screenshot shows it) but NOT the copy on air.
// So MK never animates the on-air scene itself: "MK LIVE A", "MK LIVE B" and "MK FX" are thin shells that
// hold ONE nested item, their STAGE scene, and all the animation happens inside the stage. A nested scene is
// shared with the copy, so every change reaches program whatever the Studio Mode settings are.
// ---------------------------------------------------------------------------------------------
const STAGE_SUFFIX = " STAGE";
/** The scene whose items MK really moves for a shell scene ("MK LIVE A" -> "MK LIVE A STAGE"); other scenes map to themselves. */
export const stageOf = (scene: string) =>
  scene === FX_SCENE || LIVE_BUSES.includes(scene) ? `${scene}${STAGE_SUFFIX}` : scene;
/** Inverse of stageOf: the shell scene that is on air for a stage scene. */
export const shellOf = (scene: string) =>
  scene.endsWith(STAGE_SUFFIX) && stageOf(scene.slice(0, -STAGE_SUFFIX.length)) === scene
    ? scene.slice(0, -STAGE_SUFFIX.length)
    : scene;
export const isStage = (name: string | null | undefined) => !!name && shellOf(name) !== name;

export interface PipSlot {
  /** Scene assigned to this PIP. Stays until the operator changes it. */
  scene: string | null;
  corner: Corner;
  size: number;
  /** Spot picked by hand in Settings (null = use `corner`). */
  pos?: PlacePos | null;
}

export type AdLayout = "r" | "l" | "b" | "t";
export const AD_LAYOUTS: { id: AdLayout; label: string }[] = [
  { id: "r", label: "SIDE ▶" },
  { id: "l", label: "◀ SIDE" },
  { id: "b", label: "BOTTOM" },
  { id: "t", label: "TOP" },
];
export const AD_SIZES = [0.2, 0.25, 0.3, 0.35];

/** Where the program picture sits in the Squeeze Merge "frame" look (the vMix look): 3 x 3 grid. */
export type Anchor = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br";
export const ANCHORS: Anchor[] = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];
export const ANCHOR_GLYPH: Record<Anchor, string> = {
  tl: "◤",
  t: "▲",
  tr: "◥",
  l: "◀",
  c: "●",
  r: "▶",
  bl: "◣",
  b: "▼",
  br: "◢",
};

/** How the picture gets there. */
export type AdStyle = "smooth" | "pop" | "linear" | "cut";
export const AD_STYLES: { id: AdStyle; label: string; hint: string }[] = [
  { id: "smooth", label: "SMOOTH", hint: "Eases in and out" },
  { id: "pop", label: "POP", hint: "Overshoots a little, then settles" },
  { id: "linear", label: "LINEAR", hint: "Constant speed" },
  { id: "cut", label: "CUT", hint: "Instant, no animation" },
];
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const adEase = (style: AdStyle): ((t: number) => number) =>
  style === "pop" ? easeOutBack : style === "linear" ? (t) => t : ease;

export interface AdConfig {
  /** Any OBS source: a scene, image, video, browser source (animated graphic)… */
  scene: string | null;
  /**
   * frame = the advertisement is a full-screen graphic BEHIND the program picture; the picture shrinks into
   * `anchor` and the graphic shows around it (vMix look). strip = the ad is a bar beside the picture (`layout`).
   */
  look: "frame" | "strip";
  /** Frame look: where the program picture sits. */
  anchor: Anchor;
  /** Strip look: which side the bar is on. */
  layout: AdLayout;
  /** Share of the picture the advertisement takes (0.15 .. 0.4); the program picture becomes 1 - size. */
  size: number;
  /** fit = whole ad visible; fill = ad covers its area (cropped). */
  fit: "fit" | "fill";
  /** How the picture moves in and out. */
  style: AdStyle;
}

export const DEFAULT_PIPS: PipSlot[] = [
  { scene: null, corner: "br", size: 0.3 },
  { scene: null, corner: "bl", size: 0.3 },
];
export const DEFAULT_AD: AdConfig = {
  scene: null,
  look: "frame",
  anchor: "tr",
  layout: "r",
  size: 0.25,
  fit: "fit",
  style: "smooth",
};

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
export function pipRect(
  corner: Corner,
  size: number,
  W: number,
  H: number,
  pos?: PlacePos | null,
): FxRect {
  return pipFrame(corner, size, 1, W, H, pos).b as FxRect;
}

/** PiP grows out of its slot: t 0 = nothing, 1 = in place. null while invisible. */
export function pipAt(
  corner: Corner,
  size: number,
  t: number,
  W: number,
  H: number,
  pos?: PlacePos | null,
): FxRect | null {
  return pipFrame(corner, size, t, W, H, pos).b;
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
export function sqmTargets(
  layout: AdLayout,
  size: number,
  W: number,
  H: number,
): { main: FxRect; ad: FxRect } {
  const s = 1 - size;
  const mw = W * s;
  const mh = H * s;
  const main = (x: number, y: number): FxRect => ({
    x,
    y,
    sx: s,
    sy: s,
    cl: 0,
    cr: 0,
    ct: 0,
    cb: 0,
  });
  const ad = (x: number, y: number, bw: number, bh: number): FxRect => ({
    x,
    y,
    sx: 1,
    sy: 1,
    cl: 0,
    cr: 0,
    ct: 0,
    cb: 0,
    bw,
    bh,
  });
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
export function sqmRest(
  layout: AdLayout,
  size: number,
  W: number,
  H: number,
): { main: FxRect; ad: FxRect } {
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
  const out: FxRect = {
    ...r,
    x: region.x + r.x * region.sx,
    y: region.y + r.y * region.sy,
    sx: r.sx * region.sx,
    sy: r.sy * region.sy,
  };
  if (r.bw !== undefined && r.bh !== undefined) {
    out.bw = r.bw * region.sx;
    out.bh = r.bh * region.sy;
  }
  if (r.raw) out.raw = rawIn(r.raw, region);
  return out;
}

/** A named, ready-made Squeeze Merge (advertisement + look + position + size + style), picked from a drop-down on the live screen. */
export interface AdPreset {
  name: string;
  ad: AdConfig;
}

/** Frame look, fully in: the program picture (uniformly scaled, so never squashed) sits at `anchor`; the ad is the full canvas behind it. */
export function frameTargets(
  anchor: Anchor,
  size: number,
  W: number,
  H: number,
): { main: FxRect; ad: FxRect } {
  const s = 1 - size;
  const mw = W * s;
  const mh = H * s;
  const col = anchor.endsWith("l") ? 0 : anchor.endsWith("r") ? W - mw : (W - mw) / 2;
  const row = anchor.startsWith("t") ? 0 : anchor.startsWith("b") ? H - mh : (H - mh) / 2;
  const main: FxRect = { x: col, y: row, sx: s, sy: s, cl: 0, cr: 0, ct: 0, cb: 0 };
  const ad: FxRect = { x: 0, y: 0, sx: 1, sy: 1, cl: 0, cr: 0, ct: 0, cb: 0, bw: W, bh: H };
  return { main, ad };
}

/** Frame look at rest: program full screen; the ad is already full-canvas behind it (the picture hides it). */
export function frameRest(W: number, H: number): { main: FxRect; ad: FxRect } {
  return {
    main: { ...FULL_RECT },
    ad: { x: 0, y: 0, sx: 1, sy: 1, cl: 0, cr: 0, ct: 0, cb: 0, bw: W, bh: H },
  };
}
