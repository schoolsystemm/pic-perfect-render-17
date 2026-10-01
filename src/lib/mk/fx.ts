// Picture effects (Squeeze, PiP, Merge). OBS has no such transitions, so MK builds them in a helper
// scene called "MK FX": it nests the camera scenes as scene items, and the effect is just those items
// being moved / scaled / cropped frame by frame. This file is pure geometry — no OBS, no UI.
import type { Corner } from "./types";

export const FX_SCENE = "MK FX";

/** One layer's placement on the canvas, in OBS scene-item terms (top-left aligned). */
export interface FxRect {
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
