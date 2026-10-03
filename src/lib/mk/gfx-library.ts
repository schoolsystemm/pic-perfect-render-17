// Saved graphics ("looks"): build a design in the Graphics Studio, save it under a
// name, load it any time, and share it as a file or a link. Stored in this browser.
import { useSyncExternalStore } from "react";

import { cleanScrolls } from "./config";
import { safeImage } from "./graphics";
import {
  BADGE_STYLES,
  CLOCK_STYLES,
  DEFAULT_GRAPHICS,
  FULL_KINDS,
  GFX_ANIMS,
  GFX_FONTS,
  GFX_IDS,
  LOWER_STYLES,
  TICKER_STYLES,
  type GfxId,
  type GraphicsConfig,
} from "./types";

const KEY = "mkvision.graphics.library.v1";
const MAX_ITEMS = 60;
/** Links longer than this are unreliable in chat apps — fall back to a file. */
export const MAX_LINK_CHARS = 6000;

export type LayerData<K extends GfxId = GfxId> = GraphicsConfig[K];

export interface SavedGraphic {
  id: string;
  name: string;
  layer: GfxId;
  data: LayerData;
  created: number;
}

interface SharePack {
  app: "mkvision";
  v: 1;
  items: { name: string; layer: GfxId; data: unknown }[];
}

// ------------------------------------------------------------------ sanitize
// Anything imported (file, pasted code, link) is untrusted: rebuild it field by
// field from the defaults so only known keys with valid values get through.

const HEX = /^#[0-9a-fA-F]{3,8}$/;
/** A hand-placed spot: both parts 0..1, otherwise null (= use the default / corner). */
const cleanAt = (v: unknown): { x: number; y: number } | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o["x"] !== "number" || typeof o["y"] !== "number") return null;
  return { x: num(o["x"], 0.5, 0, 1), y: num(o["y"], 0.5, 0, 1) };
};
const isCorner = (v: unknown) => v === "tl" || v === "tr" || v === "bl" || v === "br";
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], fallback: T): T =>
  list.some((l) => l.id === v) ? (v as T) : fallback;
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const str = (v: unknown, fallback: string, max = 200) => (typeof v === "string" ? v.slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function sanitizeLayer<K extends GfxId>(layer: K, raw: unknown): LayerData<K> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const D = DEFAULT_GRAPHICS;
  switch (layer) {
    case "logo": {
      const d = D.logo;
      return {
        image: safeImage(r["image"]),
        pos: isCorner(r["pos"]) ? r["pos"] : d.pos,
        at: cleanAt(r["at"]),
        size: num(r["size"], d.size, 3, 60),
        opacity: num(r["opacity"], d.opacity, 5, 100),
        text: str(r["text"], d.text, 24),
        textColor: hex(r["textColor"], d.textColor),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
      } as LayerData<K>;
    }
    case "lower": {
      const d = D.lower;
      const presets = Array.isArray(r["presets"])
        ? (r["presets"] as unknown[])
            .slice(0, 12)
            .map((p) => ({
              name: str((p as Record<string, unknown>)?.["name"], "", 80),
              title: str((p as Record<string, unknown>)?.["title"], "", 80),
            }))
            .filter((p) => p.name)
        : [];
      return {
        at: cleanAt(r["at"]),
        name: str(r["name"], d.name, 80),
        title: str(r["title"], d.title, 80),
        number: str(r["number"], d.number, 4),
        accent: hex(r["accent"], d.accent),
        primary: hex(r["primary"], d.primary),
        presets,
        size: num(r["size"], d.size, 30, 300),
        style: oneOf(r["style"], LOWER_STYLES, d.style),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
        bg: hex(r["bg"], d.bg),
        bgOpacity: num(r["bgOpacity"], d.bgOpacity, 0, 100),
        text: hex(r["text"], d.text),
        font: oneOf(r["font"], GFX_FONTS, d.font),
      } as LayerData<K>;
    }
    case "ticker": {
      const d = D.ticker;
      return {
        at: cleanAt(r["at"]),
        text: str(r["text"], d.text, 400),
        label: str(r["label"], d.label, 24),
        speed: num(r["speed"], d.speed, 8, 120),
        accent: hex(r["accent"], d.accent),
        size: num(r["size"], d.size, 30, 300),
        direction: r["direction"] === "right" ? "right" : "left",
        pos: r["pos"] === "top" ? "top" : "bottom",
        style: oneOf(r["style"], TICKER_STYLES, d.style),
        bg: hex(r["bg"], d.bg),
        bgOpacity: num(r["bgOpacity"], d.bgOpacity, 0, 100),
        textColor: hex(r["textColor"], d.textColor),
        font: oneOf(r["font"], GFX_FONTS, d.font),
        loop: bool(r["loop"], d.loop),
        scrolls: Array.isArray(r["scrolls"]) ? cleanScrolls(r["scrolls"]) : d.scrolls,
      } as LayerData<K>;
    }
    case "clock": {
      const d = D.clock;
      return {
        label: str(r["label"], d.label, 12),
        accent: hex(r["accent"], d.accent),
        style: oneOf(r["style"], CLOCK_STYLES, d.style),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
        pos: isCorner(r["pos"]) ? r["pos"] : d.pos,
        at: cleanAt(r["at"]),
        seconds: bool(r["seconds"], d.seconds),
        h24: bool(r["h24"], d.h24),
        size: num(r["size"], d.size, 30, 300),
        bg: hex(r["bg"], d.bg),
        bgOpacity: num(r["bgOpacity"], d.bgOpacity, 0, 100),
        textColor: hex(r["textColor"], d.textColor),
        font: oneOf(r["font"], GFX_FONTS, d.font),
      } as LayerData<K>;
    }
    case "badge": {
      const d = D.badge;
      return {
        text: str(r["text"], d.text, 24),
        location: str(r["location"], d.location, 32),
        locBg: hex(r["locBg"], d.locBg),
        pos: isCorner(r["pos"]) ? r["pos"] : d.pos,
        at: cleanAt(r["at"]),
        color: hex(r["color"], d.color),
        size: num(r["size"], d.size, 30, 300),
        style: oneOf(r["style"], BADGE_STYLES, d.style),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
        textColor: hex(r["textColor"], d.textColor),
        font: oneOf(r["font"], GFX_FONTS, d.font),
      } as LayerData<K>;
    }
    case "breaking": {
      const d = D.breaking;
      return {
        label: str(r["label"], d.label, 24),
        headline: str(r["headline"], d.headline, 200),
        accent: hex(r["accent"], d.accent),
        bg: hex(r["bg"], d.bg),
        textColor: hex(r["textColor"], d.textColor),
        size: num(r["size"], d.size, 30, 300),
        font: oneOf(r["font"], GFX_FONTS, d.font),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
      } as LayerData<K>;
    }
    case "score": {
      const d = D.score;
      return {
        home: str(r["home"], d.home, 8),
        away: str(r["away"], d.away, 8),
        homeScore: str(r["homeScore"], d.homeScore, 3),
        awayScore: str(r["awayScore"], d.awayScore, 3),
        clock: str(r["clock"], d.clock, 10),
        pos: isCorner(r["pos"]) ? r["pos"] : d.pos,
        // Missing = the top-centre default; an explicit null = "use the corner".
        at: r["at"] === undefined ? d.at : cleanAt(r["at"]),
        size: num(r["size"], d.size, 30, 300),
        primary: hex(r["primary"], d.primary),
        accent: hex(r["accent"], d.accent),
        bg: hex(r["bg"], d.bg),
        textColor: hex(r["textColor"], d.textColor),
        font: oneOf(r["font"], GFX_FONTS, d.font),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
      } as LayerData<K>;
    }
    case "social": {
      const d = D.social;
      return {
        platform: str(r["platform"], d.platform, 32),
        handle: str(r["handle"], d.handle, 40),
        accent: hex(r["accent"], d.accent),
        bg: hex(r["bg"], d.bg),
        textColor: hex(r["textColor"], d.textColor),
        size: num(r["size"], d.size, 30, 300),
        font: oneOf(r["font"], GFX_FONTS, d.font),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
      } as LayerData<K>;
    }
    case "full": {
      const d = D.full;
      return {
        kind: oneOf(r["kind"], FULL_KINDS, d.kind),
        kicker: str(r["kicker"], d.kicker, 60),
        headline: str(r["headline"], d.headline, 200),
        body: str(r["body"], d.body, 400),
        quote: str(r["quote"], d.quote, 300),
        author: str(r["author"], d.author, 80),
        title: str(r["title"], d.title, 80),
        subtitle: str(r["subtitle"], d.subtitle, 120),
        rows: str(r["rows"], d.rows, 800),
        seconds: num(r["seconds"], d.seconds, 0, 86400),
        lines: str(r["lines"], d.lines, 1200),
        speed: num(r["speed"], d.speed, 5, 300),
        primary: hex(r["primary"], d.primary),
        secondary: hex(r["secondary"], d.secondary),
        accent: hex(r["accent"], d.accent),
        textColor: hex(r["textColor"], d.textColor),
        font: oneOf(r["font"], GFX_FONTS, d.font),
        anim: oneOf(r["anim"], GFX_ANIMS, d.anim),
      } as LayerData<K>;
    }
  }
}

// -------------------------------------------------------------------- store

type Listener = () => void;

class GraphicsLibrary {
  private items: SavedGraphic[] = [];
  private loaded = false;
  private listeners = new Set<Listener>();

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as SavedGraphic[]) : [];
      this.items = (Array.isArray(list) ? list : [])
        .filter((i) => i && GFX_IDS.includes(i.layer))
        .map((i) => ({
          id: String(i.id),
          name: str(i.name, "Untitled", 60),
          layer: i.layer,
          data: sanitizeLayer(i.layer, i.data),
          created: Number(i.created) || Date.now(),
        }));
    } catch {
      this.items = [];
    }
  }

  private persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* storage full or unavailable — keep running in memory */
    }
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): SavedGraphic[] => {
    this.load();
    return this.items;
  };

  /** Save (or overwrite, when the same name + layer exists) a design. */
  save(name: string, layer: GfxId, data: LayerData): SavedGraphic {
    this.load();
    const clean = sanitizeLayer(layer, JSON.parse(JSON.stringify(data)));
    const nm = name.trim().slice(0, 60) || "Untitled";
    const existing = this.items.find((i) => i.layer === layer && i.name.toLowerCase() === nm.toLowerCase());
    if (existing) {
      this.items = this.items.map((i) => (i === existing ? { ...i, data: clean, created: Date.now() } : i));
      this.persist();
      return this.items.find((i) => i.id === existing.id)!;
    }
    const item: SavedGraphic = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: nm,
      layer,
      data: clean,
      created: Date.now(),
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.persist();
    return item;
  }

  /** Overwrite one saved design with new settings (keeps its name and place in the list). */
  update(id: string, data: LayerData): SavedGraphic | undefined {
    this.load();
    const cur = this.items.find((i) => i.id === id);
    if (!cur) return undefined;
    const clean = sanitizeLayer(cur.layer, JSON.parse(JSON.stringify(data)));
    this.items = this.items.map((i) => (i.id === id ? { ...i, data: clean, created: Date.now() } : i));
    this.persist();
    return this.items.find((i) => i.id === id);
  }

  /** A copy under a free name ("Name copy", "Name copy 2"…). */
  duplicate(id: string): SavedGraphic | undefined {
    this.load();
    const cur = this.items.find((i) => i.id === id);
    if (!cur) return undefined;
    let nm = `${cur.name} copy`.slice(0, 60);
    for (let n = 2; this.items.some((i) => i.layer === cur.layer && i.name.toLowerCase() === nm.toLowerCase()); n++) {
      nm = `${cur.name.slice(0, 50)} copy ${n}`;
    }
    return this.save(nm, cur.layer, cur.data);
  }

  remove(id: string) {
    this.load();
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }

  rename(id: string, name: string) {
    this.load();
    const nm = name.trim().slice(0, 60);
    if (!nm) return;
    this.items = this.items.map((i) => (i.id === id ? { ...i, name: nm } : i));
    this.persist();
  }

  /** Add imported items. Returns how many were added. */
  addMany(list: { name: string; layer: GfxId; data: LayerData }[]): number {
    let n = 0;
    for (const i of list) {
      this.save(i.name, i.layer, i.data);
      n++;
    }
    return n;
  }
}

export const gfxLibrary = new GraphicsLibrary();

const EMPTY: SavedGraphic[] = [];

export function useGfxLibrary(): SavedGraphic[] {
  return useSyncExternalStore(gfxLibrary.subscribe, gfxLibrary.getSnapshot, () => EMPTY);
}

// -------------------------------------------------------------------- share

const toPack = (items: Pick<SavedGraphic, "name" | "layer" | "data">[]): SharePack => ({
  app: "mkvision",
  v: 1,
  items: items.map((i) => ({ name: i.name, layer: i.layer, data: i.data })),
});

/** Pretty JSON for a downloadable `.mkgfx.json` file. */
export const exportJson = (items: Pick<SavedGraphic, "name" | "layer" | "data">[]) =>
  JSON.stringify(toPack(items), null, 2);

/** Parse a file / pasted JSON into sanitized items. Throws a readable error. */
export function parsePack(text: string): { name: string; layer: GfxId; data: LayerData }[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That is not a MK VISION graphics file");
  }
  const pack = raw as Partial<SharePack>;
  if (!pack || pack.app !== "mkvision" || !Array.isArray(pack.items)) {
    throw new Error("That is not a MK VISION graphics file");
  }
  const out = pack.items
    .filter((i) => i && GFX_IDS.includes(i.layer))
    .slice(0, 20)
    .map((i) => ({ name: str(i.name, "Imported", 60), layer: i.layer, data: sanitizeLayer(i.layer, i.data) }));
  if (!out.length) throw new Error("No graphics found in that file");
  return out;
}

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (code: string) => {
  const pad = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Share code for one design. Logos are left out of codes (too big) — use a file for those. */
export function shareCode(item: Pick<SavedGraphic, "name" | "layer" | "data">): string {
  const data = item.layer === "logo" ? { ...(item.data as GraphicsConfig["logo"]), image: null } : item.data;
  return b64url(JSON.stringify(toPack([{ ...item, data }])));
}

export function shareLink(item: Pick<SavedGraphic, "name" | "layer" | "data">): string | null {
  if (typeof window === "undefined") return null;
  const code = shareCode(item);
  if (code.length > MAX_LINK_CHARS) return null;
  return `${window.location.origin}/graphics?share=${code}`;
}

/** Decode a share code or a full share link. */
export function parseShare(input: string) {
  const trimmed = input.trim();
  const m = /[?&]share=([A-Za-z0-9_-]+)/.exec(trimmed);
  const code = m ? m[1]! : trimmed;
  if (trimmed.startsWith("{")) return parsePack(trimmed);
  try {
    return parsePack(fromB64url(code));
  } catch {
    throw new Error("That share code is not valid");
  }
}
