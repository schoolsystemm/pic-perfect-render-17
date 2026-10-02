// Merge = split screen with 2..6 panes and borders. Pure geometry, no OBS, no UI.
// Every pane shows the CENTRE of its picture (cropped, never squashed). The borders are the gaps between the
// panes (and optionally around them): a solid colour item sits under the panes and shows through the gaps.
import { FULL_RECT, type FxRect } from "./fx";

export const MERGE_MIN_PANES = 2;
export const MERGE_MAX_PANES = 6;
export const MERGE_BG = "MK MERGE BG";
export const MERGE_COLOR_INPUT = "MK Merge Colour";
export const MERGE_PANES: string[] = Array.from({ length: MERGE_MAX_PANES }, (_, i) => `MK PANE ${i + 1}`);

/** One cell of a layout, as fractions of the whole picture (0..1). */
export interface MergeCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MergeLayoutDef {
  id: string;
  label: string;
  panes: number;
  cells: MergeCell[];
}

const c = (x: number, y: number, w: number, h: number): MergeCell => ({ x, y, w, h });

/** n equal columns / rows / grid helpers. */
const cols = (n: number): MergeCell[] => Array.from({ length: n }, (_, i) => c(i / n, 0, 1 / n, 1));
const rows = (n: number): MergeCell[] => Array.from({ length: n }, (_, i) => c(0, i / n, 1, 1 / n));
const grid = (nc: number, nr: number): MergeCell[] =>
  Array.from({ length: nc * nr }, (_, i) => c((i % nc) / nc, Math.floor(i / nc) / nr, 1 / nc, 1 / nr));

export const MERGE_LAYOUTS: MergeLayoutDef[] = [
  { id: "2c", label: "2 SIDE", panes: 2, cells: cols(2) },
  { id: "2r", label: "2 STACK", panes: 2, cells: rows(2) },
  { id: "3c", label: "3 COLS", panes: 3, cells: cols(3) },
  { id: "3r", label: "3 ROWS", panes: 3, cells: rows(3) },
  { id: "3L", label: "1+2 ▶", panes: 3, cells: [c(0, 0, 2 / 3, 1), c(2 / 3, 0, 1 / 3, 0.5), c(2 / 3, 0.5, 1 / 3, 0.5)] },
  { id: "3T", label: "1+2 ▼", panes: 3, cells: [c(0, 0, 1, 2 / 3), c(0, 2 / 3, 0.5, 1 / 3), c(0.5, 2 / 3, 0.5, 1 / 3)] },
  { id: "4g", label: "2x2", panes: 4, cells: grid(2, 2) },
  { id: "4c", label: "4 COLS", panes: 4, cells: cols(4) },
  {
    id: "4L",
    label: "1+3 ▶",
    panes: 4,
    cells: [c(0, 0, 0.75, 1), c(0.75, 0, 0.25, 1 / 3), c(0.75, 1 / 3, 0.25, 1 / 3), c(0.75, 2 / 3, 0.25, 1 / 3)],
  },
  {
    id: "4B",
    label: "1+3 ▼",
    panes: 4,
    cells: [c(0, 0, 1, 0.75), c(0, 0.75, 1 / 3, 0.25), c(1 / 3, 0.75, 1 / 3, 0.25), c(2 / 3, 0.75, 1 / 3, 0.25)],
  },
  {
    id: "5L",
    label: "1+4 ▶",
    panes: 5,
    cells: [c(0, 0, 0.75, 1), c(0.75, 0, 0.25, 0.25), c(0.75, 0.25, 0.25, 0.25), c(0.75, 0.5, 0.25, 0.25), c(0.75, 0.75, 0.25, 0.25)],
  },
  {
    id: "5B",
    label: "1+4 ▼",
    panes: 5,
    cells: [c(0, 0, 1, 0.75), c(0, 0.75, 0.25, 0.25), c(0.25, 0.75, 0.25, 0.25), c(0.5, 0.75, 0.25, 0.25), c(0.75, 0.75, 0.25, 0.25)],
  },
  {
    id: "5m",
    label: "2+3",
    panes: 5,
    cells: [c(0, 0, 0.5, 0.5), c(0.5, 0, 0.5, 0.5), c(0, 0.5, 1 / 3, 0.5), c(1 / 3, 0.5, 1 / 3, 0.5), c(2 / 3, 0.5, 1 / 3, 0.5)],
  },
  { id: "6g", label: "3x2", panes: 6, cells: grid(3, 2) },
  { id: "6v", label: "2x3", panes: 6, cells: grid(2, 3) },
  {
    id: "6L",
    label: "1+5 ▶",
    panes: 6,
    cells: [
      c(0, 0, 0.8, 1),
      c(0.8, 0, 0.2, 0.2),
      c(0.8, 0.2, 0.2, 0.2),
      c(0.8, 0.4, 0.2, 0.2),
      c(0.8, 0.6, 0.2, 0.2),
      c(0.8, 0.8, 0.2, 0.2),
    ],
  },
];

export const mergeLayoutById = (id: string): MergeLayoutDef => MERGE_LAYOUTS.find((l) => l.id === id) ?? MERGE_LAYOUTS[0]!;

/** How the merge looks and what it shows. Saved as a preset, like the Squeeze Merge looks. */
export interface MergeConfig {
  /** Layout id from MERGE_LAYOUTS (decides the number of panes). */
  layout: string;
  /** Scene shown in each pane. null = automatic: pane 1 = PGM cam, pane 2 = PVW cam, the rest = the next free cams. */
  scenes: (string | null)[];
  /** Border thickness between panes, in 1080p pixels (0 = no border, panes touch). */
  border: number;
  /** Also draw the border round the outside of the whole picture. */
  outer: boolean;
  /** Border colour, #rrggbb. */
  color: string;
  /** How the panes move in and out. */
  style: "smooth" | "pop" | "linear" | "cut";
}

export interface MergePreset {
  name: string;
  merge: MergeConfig;
}

export const DEFAULT_MERGE: MergeConfig = {
  layout: "2c",
  scenes: [null, null, null, null, null, null],
  border: 6,
  outer: false,
  color: "#000000",
  style: "smooth",
};

export const MERGE_BORDER_CHOICES = [0, 3, 6, 10, 16, 24];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);

/** Clean any stored / imported merge settings into a safe MergeConfig. */
export function cleanMerge(raw: unknown): MergeConfig {
  const r = (raw ?? {}) as Partial<MergeConfig>;
  const layout = MERGE_LAYOUTS.some((l) => l.id === r.layout) ? (r.layout as string) : DEFAULT_MERGE.layout;
  const scenes = Array.from({ length: MERGE_MAX_PANES }, (_, i) => {
    const s = Array.isArray(r.scenes) ? r.scenes[i] : null;
    return typeof s === "string" && s ? s : null;
  });
  return {
    layout,
    scenes,
    border: typeof r.border === "number" && Number.isFinite(r.border) ? clamp(Math.round(r.border), 0, 60) : DEFAULT_MERGE.border,
    outer: r.outer === true,
    color: hex(r.color, DEFAULT_MERGE.color),
    style: r.style === "pop" || r.style === "linear" || r.style === "cut" || r.style === "smooth" ? r.style : DEFAULT_MERGE.style,
  };
}

/** OBS colour-source value (0xAABBGGRR) for #rrggbb. */
export function obsColor(color: string): number {
  const h = hex(color, "#000000").slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * The rectangles of a merge on a W x H canvas, at progress t (0 = panes collapsed in their cells' centres,
 * 1 = in place). The background sits at full canvas; each pane is its cell shrunk by half the border, with the
 * source covering the pane (cropped, not squashed). null = pane hidden.
 */
export function mergeRects(cfg: MergeConfig, W: number, H: number, t = 1): { bg: FxRect | null; panes: (FxRect | null)[] } {
  const def = mergeLayoutById(cfg.layout);
  const b = clamp(cfg.border, 0, 60) * (H / 1080);
  const half = b / 2;
  const tt = clamp(t, 0, 1);
  // Edges on the picture border get a full border (or nothing); edges shared with a neighbour get half a gap each.
  const inset = (onOuter: boolean) => (onOuter ? (cfg.outer ? b : 0) : half);
  const panes = def.cells.map((cell): FxRect | null => {
    if (tt < 0.002) return null;
    const left = cell.x * W;
    const top = cell.y * H;
    const right = (cell.x + cell.w) * W;
    const bottom = (cell.y + cell.h) * H;
    const x0 = left + inset(left <= 0.5);
    const y0 = top + inset(top <= 0.5);
    const x1 = right - inset(right >= W - 0.5);
    const y1 = bottom - inset(bottom >= H - 0.5);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cw = Math.max(2, x1 - x0) * tt;
    const ch = Math.max(2, y1 - y0) * tt;
    // Cover: scale the full-canvas source so it fills the pane, crop the overflow evenly (centre of the picture).
    const s = Math.max(cw / W, ch / H);
    const cropX = Math.max(0, (W - cw / s) / 2);
    const cropY = Math.max(0, (H - ch / s) / 2);
    return { x: cx - cw / 2, y: cy - ch / 2, sx: s, sy: s, cl: cropX, cr: cropX, ct: cropY, cb: cropY };
  });
  // The border colour grows from the centre with the panes (so it never flashes over the picture).
  const bg: FxRect | null =
    tt < 0.002 ? null : tt >= 1 ? { ...FULL_RECT } : { ...FULL_RECT, x: (W * (1 - tt)) / 2, y: (H * (1 - tt)) / 2, sx: tt, sy: tt };
  return { bg, panes };
}

/** The scene shown in each pane right now: the chosen scene, or the automatic one (PGM, PVW, then free cams). */
export function resolvePaneScenes(
  cfg: MergeConfig,
  cams: string[],
  pgm: string | null,
  pvw: string | null,
): string[] {
  const n = mergeLayoutById(cfg.layout).panes;
  const used = new Set<string>();
  const out: (string | null)[] = Array.from({ length: n }, (_, i) => cfg.scenes[i] ?? null);
  out.forEach((s) => s && used.add(s));
  const auto = (i: number): string | null => {
    if (i === 0 && pgm && !used.has(pgm)) return pgm;
    if (i === 1 && pvw && !used.has(pvw)) return pvw;
    return cams.find((cam) => !used.has(cam)) ?? null;
  };
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    const pick = auto(i);
    out[i] = pick;
    if (pick) used.add(pick);
  }
  return out.map((s, i) => s ?? cams[i % Math.max(1, cams.length)] ?? "");
}
