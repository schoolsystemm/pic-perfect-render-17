// Location tags: a small label ("KISUMU · LIVE") for each camera. With Merge on, every pane gets its own tag at the
// top of the pane (or wherever you place it by hand); without Merge the picture gets the tag of the cam on air.
// Each tag is an OBS browser source sized to its pane, so what you place is placed inside that pane.
import type { PlacePos } from "./fx";
import type { GfxFont } from "./types";


const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const color = (c: string, fallback: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
function rgba(hexColor: string, opacity: number, fallback = "#0a0c10") {
  let h = color(hexColor, fallback).slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const FONT: Record<GfxFont, string> = {
  sans: "'Segoe UI',Arial,sans-serif",
  condensed: "'Barlow Condensed','Arial Narrow','Roboto Condensed',Arial,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "Consolas,'JetBrains Mono',monospace",
};
const font = (f: string) => FONT[f as GfxFont] ?? FONT.sans;
const scale = (n: number) => Math.max(0.3, Math.min(3, (Number(n) || 100) / 100));
const spot = (v: unknown): PlacePos | null => {
  if (!v || typeof v !== "object") return null;
  const { x, y } = v as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
};
/** 0 = the item's edge touches that side of the pane, 1 = the opposite edge, whatever its size. */
const placeCss = (at: PlacePos, k = 1) => {
  const x = (at.x * 100).toFixed(3);
  const y = (at.y * 100).toFixed(3);
  return `position:absolute;left:${x}%;top:${y}%;transform-origin:0 0;transform:scale(${k}) translate(-${x}%,-${y}%)`;
};
const BASE = "html,body{margin:0;background:transparent;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}";
const page = (css: string, body: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>${body}</body></html>`)}`;

export const TAG_SLOTS = 6;
export const TAG_SCENES: string[] = Array.from({ length: TAG_SLOTS }, (_, i) => `MK TAG ${i + 1}`);
export const TAG_INPUTS: string[] = Array.from({ length: TAG_SLOTS }, (_, i) => `MK Tag Text ${i + 1}`);

export type TagStyle = "pill" | "bar" | "glass" | "plain";
export const TAG_STYLES: { id: TagStyle; label: string }[] = [
  { id: "pill", label: "Pill" },
  { id: "bar", label: "Bar" },
  { id: "glass", label: "Glass" },
  { id: "plain", label: "Plain" },
];
export type TagAnchor = "tl" | "tc" | "tr";

/** A saved location you can pick for any cam's tag. The emoji (a flag, a pin...) is shown before the name. */
export interface TagPlace {
  name: string;
  emoji: string;
}
export const TAG_PLACE_MAX = 40;
/** The text a tag shows for a saved location. */
export const placeText = (p: TagPlace) => `${p.emoji.trim()} ${p.name.trim()}`.trim();

export interface TagConfig {
  /** Your saved locations (Graphics Studio → Live FX & Tags). Each cam's tag is picked from this list, or typed. */
  places: TagPlace[];
  /** Location text per cam scene name. Empty = no tag for that cam. */
  labels: Record<string, string>;
  /** A hand-placed spot inside the pane, per cam scene (0..1 across the free space). Wins over the default spot. */
  spots: Record<string, PlacePos>;
  /** Default hand-placed spot for every pane. null = the top edge, at `anchor`. */
  at: PlacePos | null;
  /** Where the tag sits along the top edge when nothing is placed by hand. */
  anchor: TagAnchor;
  /** Percent, 100 = default. */
  size: number;
  style: TagStyle;
  accent: string;
  bg: string;
  bgOpacity: number;
  textColor: string;
  font: GfxFont;
  /** Show a pin before the text. */
  pin: boolean;
}

export const DEFAULT_TAGS: TagConfig = {
  places: [],
  labels: {},
  spots: {},
  at: null,
  anchor: "tl",
  size: 100,
  style: "pill",
  accent: "#e5322d",
  bg: "#0a0c10",
  bgOpacity: 85,
  textColor: "#ffffff",
  font: "sans",
  pin: true,
};

const FONTS: GfxFont[] = ["sans", "condensed", "serif", "mono"];
const hex = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fb);

/** Clean stored / imported tag settings into a safe TagConfig. */
export function cleanTags(raw: unknown): TagConfig {
  const r = (raw ?? {}) as Partial<TagConfig>;
  const labels: Record<string, string> = {};
  if (r.labels && typeof r.labels === "object") {
    for (const [k, v] of Object.entries(r.labels).slice(0, 64)) if (typeof v === "string" && k) labels[k.slice(0, 80)] = v.slice(0, 60);
  }
  const spots: Record<string, PlacePos> = {};
  if (r.spots && typeof r.spots === "object") {
    for (const [k, v] of Object.entries(r.spots).slice(0, 64)) {
      const p = spot(v);
      if (p && k) spots[k.slice(0, 80)] = p;
    }
  }
  const places: TagPlace[] = [];
  if (Array.isArray(r.places)) {
    for (const p of r.places.slice(0, TAG_PLACE_MAX)) {
      const q = (p ?? {}) as Partial<TagPlace>;
      const name = typeof q.name === "string" ? q.name.trim().slice(0, 50) : "";
      const emoji = typeof q.emoji === "string" ? q.emoji.trim().slice(0, 8) : "";
      if (name) places.push({ name, emoji });
    }
  }
  return {
    places,
    labels,
    spots,
    at: spot(r.at),
    anchor: r.anchor === "tc" || r.anchor === "tr" || r.anchor === "tl" ? r.anchor : DEFAULT_TAGS.anchor,
    size: num(r.size, DEFAULT_TAGS.size, 40, 250),
    style: TAG_STYLES.some((s) => s.id === r.style) ? (r.style as TagStyle) : DEFAULT_TAGS.style,
    accent: hex(r.accent, DEFAULT_TAGS.accent),
    bg: hex(r.bg, DEFAULT_TAGS.bg),
    bgOpacity: num(r.bgOpacity, DEFAULT_TAGS.bgOpacity, 0, 100),
    textColor: hex(r.textColor, DEFAULT_TAGS.textColor),
    font: FONTS.includes(r.font as GfxFont) ? (r.font as GfxFont) : DEFAULT_TAGS.font,
    pin: r.pin !== false,
  };
}

/** The spot used for one cam's tag: its own, else the default, else null (= top edge at the anchor). */
export const tagSpot = (cfg: TagConfig, scene: string): PlacePos | null => cfg.spots[scene] ?? cfg.at;

const ANCHOR: Record<TagAnchor, string> = {
  tl: "top:3vh;left:2vw",
  tc: "top:3vh;left:50%;transform:translateX(-50%)",
  tr: "top:3vh;right:2vw",
};
const ANCHOR_ORIGIN: Record<TagAnchor, string> = { tl: "top left", tc: "top center", tr: "top right" };

/**
 * The page for one tag. It is drawn at the size of its PANE (vh / vw are the pane's own), so the tag scales with
 * the pane and a hand-placed spot is a spot inside that pane.
 */
export function tagUrl(label: string, cfg: TagConfig, at: PlacePos | null): string {
  const text = esc(label.trim().slice(0, 60));
  if (!text) return page("", "");
  const k = scale(cfg.size);
  const where = at
    ? placeCss(at, k)
    : cfg.anchor === "tc"
      ? `position:absolute;top:3vh;left:50%;transform:translateX(-50%) scale(${k});transform-origin:top center`
      : `position:absolute;${ANCHOR[cfg.anchor]};transform:scale(${k});transform-origin:${ANCHOR_ORIGIN[cfg.anchor]}`;
  const a = color(cfg.accent, DEFAULT_TAGS.accent);
  const txt = color(cfg.textColor, "#ffffff");
  const bgc = rgba(cfg.bg, cfg.bgOpacity);
  const look =
    cfg.style === "bar"
      ? `background:${bgc};border-left:.9vh solid ${a};border-radius:.5vh`
      : cfg.style === "glass"
        ? `background:${rgba(cfg.bg, Math.min(cfg.bgOpacity, 55))};backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.25);border-radius:1vh`
        : cfg.style === "plain"
          ? `background:transparent;text-shadow:0 .2vh .8vh rgba(0,0,0,.9),0 0 .3vh rgba(0,0,0,.9)`
          : `background:${bgc};border-radius:5vh;border:.25vh solid ${a}`;
  const pin = cfg.pin ? `<span class="p" style="color:${a}">&#9679;</span>` : "";
  const css = `.t{${where};display:flex;align-items:center;gap:1vh;${look};color:${txt};font-family:${font(cfg.font)};font-weight:700;font-size:4.4vh;line-height:1;letter-spacing:.05em;text-transform:uppercase;padding:1.2vh 2.4vh;white-space:nowrap;max-width:96%;overflow:hidden;animation:in .45s ease both}
.p{font-size:.8em}
@keyframes in{from{opacity:0;margin-top:-1.5vh}to{opacity:1;margin-top:0}}`;
  return page(css, `<div class="t">${pin}<span>${text}</span></div>`);
}

export interface TagSlot {
  /** Which MK TAG n scene this slot uses. */
  slot: number;
  /** The cam scene the tag belongs to. */
  scene: string;
  label: string;
  /** Page url for the browser source. */
  url: string;
  /** Browser source size = the pane's visible size, in canvas pixels. */
  w: number;
  h: number;
  /** Top-left of the pane on the canvas. */
  x: number;
  y: number;
}
