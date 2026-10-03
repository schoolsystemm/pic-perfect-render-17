// Graphics Rundown: the operator's playlist of broadcast graphics (ported from OnAir Studio).
//
//   template  = a kind of graphic (lower third, ticker, headline card…) with its own fields
//   package   = a ready-made set of coordinated graphics added to the rundown in one tap
//   show      = a named rundown + one theme
//   TAKE      = put that item on one of MK VISION's existing OBS graphics layers (live, right now)
//
// Nothing here talks to OBS directly: every take goes through engine.airGraphic(), the same path
// the rest of the Graphics system uses, so layers, scenes and saved looks keep working unchanged.
import { useSyncExternalStore } from "react";

import { engine } from "./engine";
import { applyTheme, GFX_THEMES, type GfxTheme } from "./gfx-themes";
import type { GfxAnim, GfxId, GraphicsConfig } from "./types";

// ------------------------------------------------------------------ model

export type Transition = GfxAnim;
export const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: "slide", label: "Slide" },
  { id: "fade", label: "Fade" },
  { id: "wipe", label: "Wipe" },
  { id: "scale", label: "Pop" },
  { id: "reveal", label: "Reveal" },
];

export type FieldType = "text" | "textarea" | "number";
export interface Field {
  key: string;
  label: string;
  type: FieldType;
}

export type TemplateCategory = "News" | "Sports" | "General";

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Which MK graphics layer this template goes on air through. */
  layer: GfxId;
  fields: Field[];
  defaults: Record<string, string>;
  durationSec: number;
  /** Turns the item's fields into the layer's settings. */
  patch: (d: Record<string, string>) => Record<string, unknown>;
}

export interface RundownItem {
  id: string;
  templateId: string;
  name: string;
  data: Record<string, string>;
  transition: Transition;
  animMs: number;
  /** Seconds on air before it leaves by itself. 0 = hold until cleared. */
  durationSec: number;
  packageId?: string;
  packageName?: string;
}

export interface PackageItemSpec {
  templateId: string;
  name: string;
  data?: Record<string, string>;
  transition?: Transition;
  animMs?: number;
  durationSec?: number;
}

export interface GraphicPackage {
  id: string;
  name: string;
  shortName: string;
  description: string;
  themeId: string;
  items: PackageItemSpec[];
}

export interface RundownShow {
  id: string;
  name: string;
  theme: GfxTheme;
  items: RundownItem[];
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const oneLine = (v = "") =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" | ");

// ------------------------------------------------------------------ templates

export const TEMPLATES: Template[] = [
  {
    id: "lower-third",
    name: "Presenter Lower Third",
    category: "News",
    layer: "lower",
    durationSec: 8,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "title", label: "Designation", type: "text" },
    ],
    defaults: { name: "AMINA WANJIKU", title: "Anchor, Evening Bulletin" },
    patch: (d) => ({ style: "presenter", name: d["name"], title: d["title"] }),
  },
  {
    id: "guest-strap",
    name: "Interview Guest Strap",
    category: "News",
    layer: "lower",
    durationSec: 8,
    fields: [
      { key: "name", label: "Guest name", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "org", label: "Organisation", type: "text" },
    ],
    defaults: { name: "Dr. Peter Otieno", role: "Economist", org: "Institute of Policy Studies" },
    patch: (d) => ({
      style: "guest",
      name: d["name"],
      title: `${d["role"] ?? ""} • ${d["org"] ?? ""}`,
    }),
  },
  {
    id: "breaking",
    name: "Breaking News Banner",
    category: "News",
    layer: "breaking",
    durationSec: 0,
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "headline", label: "Headline", type: "text" },
    ],
    defaults: {
      label: "BREAKING NEWS",
      headline: "Parliament passes new climate bill after overnight session",
    },
    patch: (d) => ({ label: d["label"], headline: d["headline"] }),
  },
  {
    id: "ticker",
    name: "News Ticker",
    category: "News",
    layer: "ticker",
    durationSec: 0,
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "items", label: "Items (one per line)", type: "textarea" },
      { key: "speed", label: "Speed (seconds per pass)", type: "number" },
      { key: "direction", label: "Direction (left/right)", type: "text" },
    ],
    defaults: {
      label: "LATEST",
      items:
        "Markets close higher on strong export data\nNational team names squad for qualifiers\nHeavy rains expected in the western region tomorrow\nUniversity open day set for Saturday",
      speed: "40",
      direction: "left",
    },
    patch: (d) => ({
      style: "news",
      label: d["label"],
      text: oneLine(d["items"]),
      speed: Math.max(5, Math.min(120, num(d["speed"], 40))),
      direction: d["direction"] === "right" ? "right" : "left",
      loop: true,
    }),
  },
  {
    id: "location",
    name: "Live Location Bug",
    category: "News",
    layer: "badge",
    durationSec: 0,
    fields: [
      { key: "tag", label: "Tag", type: "text" },
      { key: "location", label: "Location", type: "text" },
    ],
    defaults: { tag: "LIVE", location: "NAIROBI" },
    patch: (d) => ({ style: "location", text: d["tag"], location: d["location"] }),
  },
  {
    id: "headline",
    name: "Headline Card",
    category: "News",
    layer: "full",
    durationSec: 10,
    fields: [
      { key: "kicker", label: "Kicker", type: "text" },
      { key: "headline", label: "Headline", type: "textarea" },
      { key: "body", label: "Body", type: "textarea" },
    ],
    defaults: {
      kicker: "TOP STORY",
      headline: "City unveils 10-year plan for public transport",
      body: "New rapid bus corridors and commuter rail upgrades will connect five counties by 2036.",
    },
    patch: (d) => ({
      kind: "headline",
      kicker: d["kicker"],
      headline: d["headline"],
      body: d["body"],
    }),
  },
  {
    id: "quote",
    name: "Quote Card",
    category: "News",
    layer: "full",
    durationSec: 10,
    fields: [
      { key: "quote", label: "Quote", type: "textarea" },
      { key: "author", label: "Author", type: "text" },
    ],
    defaults: {
      quote: "We will not build the future by repeating the past.",
      author: "Minister of Education",
    },
    patch: (d) => ({ kind: "quote", quote: d["quote"], author: d["author"] }),
  },
  {
    id: "scoreboard",
    name: "Match Scoreboard",
    category: "Sports",
    layer: "score",
    durationSec: 0,
    fields: [
      { key: "home", label: "Home", type: "text" },
      { key: "homeScore", label: "Home score", type: "number" },
      { key: "away", label: "Away", type: "text" },
      { key: "awayScore", label: "Away score", type: "number" },
      { key: "clock", label: "Clock", type: "text" },
    ],
    defaults: { home: "LEO", homeScore: "2", away: "RHI", awayScore: "1", clock: "67:12" },
    patch: (d) => ({
      home: d["home"],
      homeScore: d["homeScore"],
      away: d["away"],
      awayScore: d["awayScore"],
      clock: d["clock"],
    }),
  },
  {
    id: "player",
    name: "Player ID",
    category: "Sports",
    layer: "lower",
    durationSec: 6,
    fields: [
      { key: "number", label: "Number", type: "text" },
      { key: "name", label: "Player", type: "text" },
      { key: "info", label: "Info", type: "text" },
    ],
    defaults: { number: "10", name: "BRIAN MUTUA", info: "Forward • 7 goals this season" },
    patch: (d) => ({ style: "sport", number: d["number"], name: d["name"], title: d["info"] }),
  },
  {
    id: "standings",
    name: "League Standings",
    category: "Sports",
    layer: "full",
    durationSec: 12,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "rows", label: "Rows: Team, P, Pts (one per line)", type: "textarea" },
    ],
    defaults: {
      title: "PREMIER LEAGUE TABLE",
      rows: "Leopards, 12, 28\nRhinos, 12, 25\nFalcons, 12, 22\nSharks, 12, 19\nEagles, 12, 15",
    },
    patch: (d) => ({ kind: "standings", title: d["title"], rows: d["rows"] }),
  },
  {
    id: "countdown",
    name: "Countdown Timer",
    category: "General",
    layer: "full",
    durationSec: 0,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "seconds", label: "Seconds", type: "number" },
      { key: "subtitle", label: "Subtitle", type: "text" },
    ],
    defaults: { title: "WE'RE LIVE IN", seconds: "300", subtitle: "Campus TV Graduation Special" },
    patch: (d) => ({
      kind: "countdown",
      title: d["title"],
      seconds: Math.max(0, num(d["seconds"], 300)),
      subtitle: d["subtitle"],
    }),
  },
  {
    id: "clock",
    name: "Digital Clock",
    category: "General",
    layer: "clock",
    durationSec: 0,
    fields: [{ key: "label", label: "Label", type: "text" }],
    defaults: { label: "EAT" },
    patch: (d) => ({ style: "split", label: d["label"] }),
  },
  {
    id: "logo",
    name: "Station Logo Bug",
    category: "General",
    layer: "logo",
    durationSec: 0,
    fields: [
      { key: "text", label: "Text mark (an uploaded logo image in Design wins)", type: "text" },
    ],
    defaults: { text: "UTV" },
    patch: (d) => ({ text: d["text"] }),
  },
  {
    id: "social",
    name: "Social Handle",
    category: "General",
    layer: "social",
    durationSec: 6,
    fields: [
      { key: "platform", label: "Platform", type: "text" },
      { key: "handle", label: "Handle", type: "text" },
    ],
    defaults: { platform: "FOLLOW US", handle: "@campustv" },
    patch: (d) => ({ platform: d["platform"], handle: d["handle"] }),
  },
  {
    id: "announcement",
    name: "Full-screen Announcement",
    category: "General",
    layer: "full",
    durationSec: 10,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "subtitle", label: "Subtitle", type: "text" },
    ],
    defaults: { title: "UP NEXT", subtitle: "The Sports Hour — 8:00 PM" },
    patch: (d) => ({ kind: "announcement", title: d["title"], subtitle: d["subtitle"] }),
  },
  {
    id: "credits",
    name: "End Credits",
    category: "General",
    layer: "full",
    durationSec: 0,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "lines", label: "Role — Name (one per line)", type: "textarea" },
      { key: "speed", label: "Roll seconds", type: "number" },
    ],
    defaults: {
      title: "CAMPUS TV",
      lines:
        "Producer — Grace Njeri\nDirector — Kevin Ouma\nGraphics — Faith Akinyi\nCamera — Daniel Kiprop\nSound — Lucy Mwende",
      speed: "20",
    },
    patch: (d) => ({
      kind: "credits",
      title: d["title"],
      lines: d["lines"],
      speed: Math.max(5, num(d["speed"], 20)),
    }),
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

const theme = (id: string): GfxTheme => GFX_THEMES.find((t) => t.id === id) ?? GFX_THEMES[0]!;

// ------------------------------------------------------------------ items + packages

let seq = 0;
export const uid = () =>
  `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function makeItem(
  templateId: string,
  id: string,
  data?: Record<string, string>,
  name?: string,
): RundownItem {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`Unknown graphic template: ${templateId}`);
  return {
    id,
    templateId,
    name: name ?? t.name,
    data: { ...t.defaults, ...data },
    transition: t.layer === "full" ? "fade" : t.layer === "ticker" ? "wipe" : "slide",
    animMs: 600,
    durationSec: t.durationSec,
  };
}

export const GRAPHIC_PACKAGES: GraphicPackage[] = [
  {
    id: "breaking-desk",
    name: "Breaking News Command",
    shortName: "BREAKING",
    description: "Urgent coverage with live bug, headline, alert strap and continuous ticker.",
    themeId: "news",
    items: [
      {
        templateId: "logo",
        name: "Breaking · Station ID",
        data: { text: "NEWS 24" },
        transition: "scale",
        durationSec: 0,
      },
      {
        templateId: "location",
        name: "Breaking · Live Location",
        data: { tag: "LIVE", location: "NEWSROOM" },
        transition: "wipe",
        durationSec: 0,
      },
      {
        templateId: "headline",
        name: "Breaking · Story Open",
        data: {
          kicker: "BREAKING NEWS",
          headline: "Major story developing now",
          body: "Our newsroom is following the latest developments. Stay with us for verified updates.",
        },
        transition: "reveal",
        animMs: 750,
        durationSec: 8,
      },
      {
        templateId: "breaking",
        name: "Breaking · Alert Strap",
        data: {
          label: "BREAKING NEWS",
          headline: "Major story developing — live updates as they happen",
        },
        transition: "wipe",
        animMs: 450,
        durationSec: 0,
      },
      {
        templateId: "ticker",
        name: "Breaking · Updates Ticker",
        data: {
          label: "LIVE UPDATES",
          items:
            "Newsroom teams are verifying the latest information\nCorrespondents are reporting live from the scene\nMore details will follow throughout this bulletin",
          speed: "34",
          direction: "left",
        },
        transition: "wipe",
        durationSec: 0,
      },
    ],
  },
  {
    id: "field-report",
    name: "Live Field Report",
    shortName: "LIVE",
    description: "A complete correspondent sequence for live reports from any location.",
    themeId: "university",
    items: [
      {
        templateId: "logo",
        name: "Live · Station ID",
        data: { text: "UTV" },
        transition: "fade",
        durationSec: 0,
      },
      {
        templateId: "location",
        name: "Live · Location Bug",
        data: { tag: "LIVE", location: "NAIROBI" },
        transition: "slide",
        durationSec: 0,
      },
      {
        templateId: "lower-third",
        name: "Live · Correspondent",
        data: { name: "AMINA WANJIKU", title: "Senior Correspondent" },
        transition: "slide",
        durationSec: 8,
      },
      {
        templateId: "headline",
        name: "Live · Report Intro",
        data: {
          kicker: "LIVE REPORT",
          headline: "The story from where it is happening",
          body: "Our correspondent brings context, reaction and the latest verified information from the scene.",
        },
        transition: "fade",
        durationSec: 8,
      },
      {
        templateId: "ticker",
        name: "Live · News Ticker",
        data: {
          label: "LATEST",
          items:
            "Live coverage continues across all platforms\nSend your questions to @campustv\nNext bulletin at the top of the hour",
          speed: "42",
          direction: "left",
        },
        transition: "wipe",
        durationSec: 0,
      },
    ],
  },
  {
    id: "studio-interview",
    name: "Studio Interview Suite",
    shortName: "INTERVIEW",
    description: "Elegant guest introduction, quote moment, social prompt and clean close.",
    themeId: "university",
    items: [
      {
        templateId: "logo",
        name: "Interview · Station ID",
        data: { text: "UTV" },
        transition: "fade",
        durationSec: 0,
      },
      {
        templateId: "guest-strap",
        name: "Interview · Guest Strap",
        data: { name: "Dr. Peter Otieno", role: "Economist", org: "Institute of Policy Studies" },
        transition: "slide",
        durationSec: 10,
      },
      {
        templateId: "quote",
        name: "Interview · Key Quote",
        data: {
          quote: "The decisions we make today will shape opportunity for the next generation.",
          author: "Dr. Peter Otieno",
        },
        transition: "reveal",
        durationSec: 9,
      },
      {
        templateId: "social",
        name: "Interview · Social Prompt",
        data: { platform: "JOIN THE CONVERSATION", handle: "@campustv" },
        transition: "slide",
        durationSec: 7,
      },
      {
        templateId: "announcement",
        name: "Interview · Coming Up",
        data: { title: "STILL TO COME", subtitle: "Your questions answered after the break" },
        transition: "fade",
        durationSec: 8,
      },
    ],
  },
  {
    id: "bulletin-prime",
    name: "Prime Bulletin",
    shortName: "BULLETIN",
    description: "A polished nightly-news flow from opener to headlines, stories and credits.",
    themeId: "event",
    items: [
      {
        templateId: "countdown",
        name: "Bulletin · Live Countdown",
        data: { title: "LIVE IN", seconds: "30", subtitle: "The Prime Bulletin" },
        transition: "scale",
        durationSec: 0,
      },
      {
        templateId: "announcement",
        name: "Bulletin · Program Open",
        data: { title: "PRIME NEWS", subtitle: "Clear facts. Complete context." },
        transition: "reveal",
        durationSec: 6,
      },
      {
        templateId: "logo",
        name: "Bulletin · Station ID",
        data: { text: "PRIME" },
        transition: "fade",
        durationSec: 0,
      },
      {
        templateId: "headline",
        name: "Bulletin · Lead Story",
        data: {
          kicker: "TOP STORY",
          headline: "Tonight’s lead story begins here",
          body: "A complete account with the people, facts and consequences that matter.",
        },
        transition: "fade",
        durationSec: 10,
      },
      {
        templateId: "lower-third",
        name: "Bulletin · Anchor Strap",
        data: { name: "AMINA WANJIKU", title: "Anchor, Prime News" },
        transition: "slide",
        durationSec: 8,
      },
      {
        templateId: "ticker",
        name: "Bulletin · Headlines Ticker",
        data: {
          label: "HEADLINES",
          items:
            "Top story: latest national developments\nBusiness: markets respond to new figures\nSport: national team prepares for qualifier\nWeather: rain expected in western counties",
          speed: "40",
          direction: "left",
        },
        transition: "wipe",
        durationSec: 0,
      },
      {
        templateId: "credits",
        name: "Bulletin · End Credits",
        data: {
          title: "PRIME NEWS",
          lines:
            "Producer — Grace Njeri\nDirector — Kevin Ouma\nGraphics — Faith Akinyi\nCamera — Daniel Kiprop\nSound — Lucy Mwende",
          speed: "20",
        },
        transition: "fade",
        durationSec: 0,
      },
    ],
  },
];

/** Rundown rows from a package. Every add gets its own group token ("<packId>~<token>") so adding the same
 *  package twice makes two separate groups; `packageSource` gets the package id back for "Save to library". */
export const packageSource = (packageId?: string) => (packageId ?? "").split("~")[0] ?? "";

export function makePackageItems(pack: GraphicPackage): RundownItem[] {
  const group = `${pack.id}~${uid().slice(-5)}`;
  return pack.items.map((spec) => ({
    ...makeItem(spec.templateId, uid(), spec.data, spec.name),
    ...(spec.transition ? { transition: spec.transition } : {}),
    ...(spec.animMs !== undefined ? { animMs: spec.animMs } : {}),
    ...(spec.durationSec !== undefined ? { durationSec: spec.durationSec } : {}),
    packageId: group,
    packageName: pack.name,
  }));
}

export const packageTheme = (pack: GraphicPackage) => theme(pack.themeId);

/** A rundown item as a package entry (what "Save to library" stores). */
export const itemToSpec = (i: RundownItem): PackageItemSpec => ({
  templateId: i.templateId,
  name: i.name,
  data: { ...i.data },
  transition: i.transition,
  animMs: i.animMs,
  durationSec: i.durationSec,
});

export function seedShows(): RundownShow[] {
  return [
    {
      id: "show-news",
      name: "Evening News Bulletin",
      theme: theme("news"),
      items: [
        "logo",
        "location",
        "lower-third",
        "guest-strap",
        "ticker",
        "headline",
        "quote",
        "breaking",
        "social",
        "announcement",
        "credits",
      ].map((t, i) => makeItem(t, `n${i + 1}`)),
    },
    {
      id: "show-sports",
      name: "Saturday Football",
      theme: theme("sports"),
      items: ["logo", "scoreboard", "player", "standings", "clock", "countdown"].map((t, i) =>
        makeItem(t, `s${i + 1}`),
      ),
    },
  ];
}

// ------------------------------------------------------------------ item -> layer settings

/**
 * What a TAKE of this item does to its OBS layer: the show's colours + font, then the item's own
 * fields, then the item's transition and speed. Only that one layer is touched.
 */
export function itemLayer(
  item: RundownItem,
  th: GfxTheme,
  base: GraphicsConfig,
): { layer: GfxId; patch: Record<string, unknown> } | null {
  const t = getTemplate(item.templateId);
  if (!t) return null;
  const themed = applyTheme(base, th)[t.layer] as unknown as Record<string, unknown>;
  const own = t.patch({ ...t.defaults, ...item.data });
  const patch: Record<string, unknown> = {
    ...themed,
    ...own,
    anim: item.transition,
    animMs: item.animMs,
  };
  // The lower third keeps its saved names; the theme must not wipe the logo image.
  if (t.layer === "logo") {
    const { image: _i, ...rest } = patch;
    void _i;
    return { layer: t.layer, patch: { ...rest } };
  }
  if (t.layer === "lower") {
    const { presets: _p, ...rest } = patch;
    void _p;
    return { layer: t.layer, patch: { ...rest } };
  }
  if (t.layer === "ticker") {
    const { scrolls: _s, ...rest } = patch;
    void _s;
    return { layer: t.layer, patch: { ...rest } };
  }
  return { layer: t.layer, patch };
}

/** The whole picture as it would look with this item taken (used by the PREVIEW monitor). */
export function previewConfig(
  item: RundownItem,
  th: GfxTheme,
  base: GraphicsConfig,
): { layer: GfxId; g: GraphicsConfig } | null {
  const r = itemLayer(item, th, base);
  if (!r) return null;
  return {
    layer: r.layer,
    g: { ...base, [r.layer]: { ...base[r.layer], ...r.patch } } as GraphicsConfig,
  };
}

// ------------------------------------------------------------------ store (shows, selection, live marks)

const KEY = "mkvision.gfx.rundown.v1";
const BACKUP = "mkvision.gfx.rundown.v1.backup";

interface Snapshot {
  shows: RundownShow[];
  showId: string;
  selId: string;
  autoPlay: boolean;
  /** layer -> id of the rundown item that is on air there. */
  live: Partial<Record<GfxId, string>>;
  log: { t: string; msg: string }[];
}

function sanitizeShows(raw: unknown): RundownShow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RundownShow[] = [];
  for (const s of raw as Partial<RundownShow>[]) {
    if (!s || typeof s.name !== "string" || !Array.isArray(s.items)) continue;
    const th = GFX_THEMES.find((t) => t.id === s.theme?.id) ?? s.theme;
    const items: RundownItem[] = [];
    for (const i of s.items as Partial<RundownItem>[]) {
      if (!i || typeof i.templateId !== "string" || !getTemplate(i.templateId)) continue;
      const base = makeItem(i.templateId, String(i.id ?? uid()));
      items.push({
        ...base,
        name: typeof i.name === "string" ? i.name.slice(0, 80) : base.name,
        data: {
          ...base.data,
          ...(i.data && typeof i.data === "object"
            ? Object.fromEntries(
                Object.entries(i.data).map(([k, v]) => [k, String(v).slice(0, 1200)]),
              )
            : {}),
        },
        transition: TRANSITIONS.some((t) => t.id === i.transition)
          ? (i.transition as Transition)
          : base.transition,
        animMs: Math.max(100, Math.min(3000, Number(i.animMs) || 600)),
        durationSec: Math.max(0, Number(i.durationSec) || 0),
        ...(i.packageId
          ? { packageId: String(i.packageId), packageName: String(i.packageName ?? "") }
          : {}),
      });
    }
    out.push({
      id: String(s.id ?? uid()),
      name: s.name.slice(0, 60),
      theme: { ...GFX_THEMES[0]!, ...(th ?? {}) },
      items,
    });
  }
  return out.length ? out : null;
}

function loadShows(): RundownShow[] | null {
  if (typeof window === "undefined") return null;
  for (const k of [KEY, BACKUP]) {
    try {
      const v = window.localStorage.getItem(k);
      if (v) {
        const s = sanitizeShows(JSON.parse(v));
        if (s) return s;
      }
    } catch {
      /* try the backup */
    }
  }
  return null;
}

class RundownStore {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private past: RundownShow[][] = [];
  private future: RundownShow[][] = [];
  private timers: Partial<Record<GfxId, ReturnType<typeof setTimeout>>> = {};
  private lastCmd = 0;
  private loaded = false;
  private backupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const shows = seedShows();
    this.snap = {
      shows,
      showId: shows[0]!.id,
      selId: shows[0]!.items[0]?.id ?? "",
      autoPlay: false,
      live: {},
      log: [],
    };
  }

  private ensure() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    const shows = loadShows();
    if (shows)
      this.snap = {
        ...this.snap,
        shows,
        showId: shows[0]!.id,
        selId: shows[0]!.items[0]?.id ?? "",
      };
    this.backupTimer = setInterval(() => {
      try {
        const v = window.localStorage.getItem(KEY);
        if (v) window.localStorage.setItem(BACKUP, v);
      } catch {
        /* ignore */
      }
    }, 60_000);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): Snapshot => {
    this.ensure();
    return this.snap;
  };

  private emit(next: Partial<Snapshot>, persist = false) {
    this.snap = { ...this.snap, ...next };
    if (persist) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(this.snap.shows));
      } catch {
        /* storage full — keep running in memory */
      }
    }
    this.listeners.forEach((l) => l());
  }

  private say(msg: string) {
    this.emit({
      log: [{ t: new Date().toLocaleTimeString(), msg }, ...this.snap.log].slice(0, 60),
    });
  }

  get show(): RundownShow {
    return this.snap.shows.find((s) => s.id === this.snap.showId) ?? this.snap.shows[0]!;
  }

  // ---- editing (with undo)
  private mutate(fn: (s: RundownShow[]) => RundownShow[]) {
    this.past.push(this.snap.shows);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.emit({ shows: fn(this.snap.shows) }, true);
  }
  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.future.push(this.snap.shows);
    this.emit({ shows: p }, true);
    this.fixSelection();
  }
  redo() {
    const f = this.future.pop();
    if (!f) return;
    this.past.push(this.snap.shows);
    this.emit({ shows: f }, true);
    this.fixSelection();
  }
  private fixSelection() {
    const show = this.snap.shows.find((s) => s.id === this.snap.showId) ?? this.snap.shows[0]!;
    if (show.id !== this.snap.showId) this.emit({ showId: show.id });
    if (!show.items.some((i) => i.id === this.snap.selId))
      this.emit({ selId: show.items[0]?.id ?? "" });
  }

  select(id: string) {
    this.emit({ selId: id });
  }
  setShow(id: string) {
    const s = this.snap.shows.find((x) => x.id === id);
    if (s) this.emit({ showId: id, selId: s.items[0]?.id ?? "" });
  }
  setAutoPlay(on: boolean) {
    this.emit({ autoPlay: on });
  }
  patchShow(patch: Partial<RundownShow>) {
    const id = this.snap.showId;
    this.mutate((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  patchItem(itemId: string, patch: Partial<RundownItem>) {
    const id = this.snap.showId;
    this.mutate((ss) =>
      ss.map((s) =>
        s.id === id
          ? { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
          : s,
      ),
    );
  }
  addTemplate(templateId: string) {
    const it = makeItem(templateId, uid());
    this.patchShow({ items: [...this.show.items, it] });
    this.emit({ selId: it.id });
  }
  addPackage(packOrId: string | GraphicPackage) {
    const pack =
      typeof packOrId === "string" ? GRAPHIC_PACKAGES.find((p) => p.id === packOrId) : packOrId;
    if (!pack) return;
    const items = makePackageItems(pack);
    this.patchShow({ theme: packageTheme(pack), items: [...this.show.items, ...items] });
    if (items[0]) this.emit({ selId: items[0].id });
    this.say(`ADDED ${pack.name.toUpperCase()} PACKAGE`);
  }
  duplicate(itemId: string) {
    const items = [...this.show.items];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const src = items[idx]!;
    items.splice(idx + 1, 0, { ...structuredClone(src), id: uid(), name: `${src.name} copy` });
    this.patchShow({ items });
  }
  remove(itemId: string) {
    this.patchShow({ items: this.show.items.filter((i) => i.id !== itemId) });
    this.fixSelection();
  }
  reorder(from: string, to: string) {
    const items = [...this.show.items];
    const a = items.findIndex((i) => i.id === from);
    const b = items.findIndex((i) => i.id === to);
    if (a < 0 || b < 0) return;
    const [moved] = items.splice(a, 1);
    if (!moved) return;
    items.splice(b, 0, moved);
    this.patchShow({ items });
  }
  newShow(name: string) {
    const s: RundownShow = { id: uid(), name, theme: GFX_THEMES[0]!, items: [] };
    this.mutate((ss) => [...ss, s]);
    this.emit({ showId: s.id, selId: "" });
  }
  renameShow(name: string) {
    this.patchShow({ name });
  }
  duplicateShow() {
    const s = { ...structuredClone(this.show), id: uid(), name: `${this.show.name} copy` };
    this.mutate((ss) => [...ss, s]);
    this.emit({ showId: s.id, selId: s.items[0]?.id ?? "" });
  }
  deleteShow(): boolean {
    if (this.snap.shows.length < 2) return false;
    const rest = this.snap.shows.filter((s) => s.id !== this.snap.showId);
    this.mutate(() => rest);
    this.emit({ showId: rest[0]!.id, selId: rest[0]!.items[0]?.id ?? "" });
    return true;
  }
  exportJson(): string {
    return JSON.stringify(this.show, null, 2);
  }
  importJson(text: string): string {
    const parsed = sanitizeShows([JSON.parse(text)]);
    if (!parsed) throw new Error("That file is not a graphics rundown export.");
    const s = { ...parsed[0]!, id: uid() };
    this.mutate((ss) => [...ss, s]);
    this.emit({ showId: s.id, selId: s.items[0]?.id ?? "" });
    this.say(`Imported ${s.name}`);
    return s.name;
  }

  // ---- playout
  private guard() {
    const n = Date.now();
    if (n - this.lastCmd < 200) return false;
    this.lastCmd = n;
    return true;
  }
  private config(): GraphicsConfig {
    return engine.getSnapshot().config.graphics;
  }
  private setLive(layer: GfxId, id: string | undefined) {
    const live = { ...this.snap.live };
    if (id) live[layer] = id;
    else delete live[layer];
    this.emit({ live });
  }

  /** Put an item on air: its layer gets the item's content and goes live. */
  async takeItem(item: RundownItem, th: GfxTheme = this.show.theme): Promise<boolean> {
    const r = itemLayer(item, th, this.config());
    if (!r) return false;
    clearTimeout(this.timers[r.layer]);
    const ok = await engine.airGraphic(r.layer, r.patch as never);
    if (!ok) return false;
    this.setLive(r.layer, item.id);
    this.say(`TAKE ${item.name}`);
    if (item.durationSec > 0) {
      this.timers[r.layer] = setTimeout(() => {
        void this.clearLayer(r.layer, true);
        if (this.snap.autoPlay) {
          const list = this.show.items;
          const next = list[list.findIndex((i) => i.id === item.id) + 1];
          if (next) {
            this.emit({ selId: next.id });
            setTimeout(() => void this.takeItem(next, th), item.animMs + 100);
          }
        }
      }, item.durationSec * 1000);
    }
    return true;
  }

  async clearLayer(layer: GfxId, quiet = false) {
    clearTimeout(this.timers[layer]);
    await engine.clearGraphic(layer);
    this.setLive(layer, undefined);
    if (!quiet) this.say(`CLEAR ${layer}`);
  }

  take() {
    const it = this.selected();
    if (it && this.guard()) void this.takeItem(it);
  }
  update() {
    const it = this.selected();
    if (!it || !this.guard()) return;
    const t = getTemplate(it.templateId);
    if (!t) return;
    if (!engine.getSnapshot().gfxActive[t.layer]) {
      void this.takeItem(it);
      return;
    }
    const r = itemLayer(it, this.show.theme, this.config());
    if (!r) return;
    void engine.airGraphic(r.layer, r.patch as never).then((ok) => {
      if (ok) {
        this.setLive(r.layer, it.id);
        this.say(`UPDATE ${it.name}`);
      }
    });
  }
  clear() {
    const it = this.selected();
    const t = it && getTemplate(it.templateId);
    if (t && this.guard()) void this.clearLayer(t.layer);
  }
  clearAll() {
    const active = engine.getSnapshot().gfxActive;
    (Object.keys(active) as GfxId[]).forEach((l) => {
      if (active[l]) void this.clearLayer(l, true);
    });
    this.say("CLEAR ALL");
  }
  move(d: number) {
    const list = this.show.items;
    const i = list.findIndex((x) => x.id === this.snap.selId);
    const n = list[Math.max(0, Math.min(list.length - 1, i + d))];
    if (n) this.emit({ selId: n.id });
    return n;
  }
  takeNext() {
    if (!this.guard()) return;
    const before = this.snap.selId;
    const n = this.move(1);
    if (n && n.id !== before) void this.takeItem(n);
  }
  /** T / L style shortcuts: toggle whichever layer, using its first item in the rundown. */
  toggleLayer(layer: GfxId) {
    if (engine.getSnapshot().gfxActive[layer]) {
      void this.clearLayer(layer);
      return;
    }
    const it = this.show.items.find((i) => getTemplate(i.templateId)?.layer === layer);
    if (it) void this.takeItem(it);
  }
  private selected() {
    return this.show.items.find((i) => i.id === this.snap.selId);
  }
}

export const rundown = new RundownStore();

export function useRundown() {
  return useSyncExternalStore(rundown.subscribe, rundown.getSnapshot, rundown.getSnapshot);
}
