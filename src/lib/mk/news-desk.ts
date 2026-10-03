// News Desk: one reusable template for every news time.
//
//   bulletin = one news time (Morning 6AM, Midday, Prime 9PM…): studio mark, clock label, scroll lines, look
//   story    = one item in the bulletin, with an "updates" tag and any number of changing tags
//   tag      = a main tag + a below tag. The News Tags layer cycles a story's tags by itself.
//
// Playout re-uses MK VISION's existing OBS layers (Logo, Clock, Ticker, News Tags) through
// engine.airGraphic(), exactly like the Graphics Rundown. Bulletins are saved in this browser.
import { useSyncExternalStore } from "react";

import { engine } from "./engine";
import { applyTheme, GFX_THEMES } from "./gfx-themes";
import { uid } from "./gfx-rundown";
import type { GfxId, GraphicsConfig, NewsTag } from "./types";

const KEY = "mkvision.news.bulletins.v1";
const BACKUP = "mkvision.news.bulletins.v1.backup";
const MAX_BULLETINS = 30;
const MAX_STORIES = 60;
const MAX_TAGS = 20;

export interface NewsStory {
  id: string;
  /** Name shown in the story list (not on air). */
  name: string;
  /** The small "updates" tag on air above the main tag. */
  kicker: string;
  tags: NewsTag[];
  /** Seconds per tag. 0 = use the bulletin's default. */
  seconds: number;
  /** true = keep going round the tags until the next story, false = play once and hold the last tag. */
  loop: boolean;
}

export interface NewsBulletin {
  id: string;
  /** "Morning News 6AM", "Prime Bulletin"… */
  name: string;
  themeId: string;
  /** Text mark for the studio logo. An uploaded logo image (Graphics Studio → Logo) wins over it. */
  logoText: string;
  clockLabel: string;
  scrollLabel: string;
  /** One headline per line. They run together along the scroll. */
  scrollLines: string;
  scrollSpeed: number;
  /** Default seconds each tag stays up. */
  tagSeconds: number;
  stories: NewsStory[];
}

// ------------------------------------------------------------------ makers

export const makeTag = (main = "", below = ""): NewsTag => ({ main, below });

export const makeStory = (name = "New story"): NewsStory => ({
  id: uid(),
  name,
  kicker: "LIVE UPDATES",
  tags: [makeTag("Main tag", "Below tag")],
  seconds: 0,
  loop: true,
});

export function makeBulletin(name = "New bulletin"): NewsBulletin {
  return {
    id: uid(),
    name,
    themeId: GFX_THEMES[0]!.id,
    logoText: "NEWS",
    clockLabel: "EAT",
    scrollLabel: "LATEST",
    scrollLines: "Headline one goes here\nHeadline two goes here\nHeadline three goes here",
    scrollSpeed: 45,
    tagSeconds: 6,
    stories: [makeStory("Story 1")],
  };
}

function seedBulletins(): NewsBulletin[] {
  const story = (name: string, kicker: string, tags: [string, string][]): NewsStory => ({
    id: uid(),
    name,
    kicker,
    tags: tags.map(([m, b]) => makeTag(m, b)),
    seconds: 0,
    loop: true,
  });
  const morning = makeBulletin("Morning News · 6 AM");
  morning.logoText = "MORNING NEWS";
  morning.stories = [
    story("Lead: transport plan", "LIVE UPDATES", [
      ["City unveils 10-year transport plan", "Rapid bus corridors and commuter rail upgrades"],
      ["Five counties to be connected by 2036", "Construction starts next year"],
      ["Commuters welcome the plan", "Concerns remain over fares"],
      ["Governor to address residents today", "Statement expected at noon"],
    ]),
    story("Weather", "WEATHER", [
      ["Heavy rain expected in the west", "Flood warning in low-lying areas"],
      ["Sunny spells across the coast", "Highs of 31°C"],
    ]),
  ];
  const prime = makeBulletin("Prime Bulletin · 9 PM");
  prime.logoText = "PRIME NEWS";
  prime.stories = [
    story("Top story", "TOP STORY", [
      ["Tonight’s top story goes here", "Supporting line goes here"],
    ]),
  ];
  return [morning, prime];
}

// ------------------------------------------------------------------ sanitize (storage + imports are untrusted)

const text = (v: unknown, fallback: string, max: number) =>
  typeof v === "string" ? v.slice(0, max) : fallback;
const clampNum = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function cleanStory(raw: unknown): NewsStory | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const tags = (Array.isArray(r["tags"]) ? (r["tags"] as unknown[]) : [])
    .slice(0, MAX_TAGS)
    .map((t) => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return makeTag(text(o["main"], "", 160), text(o["below"], "", 200));
    });
  return {
    id: text(r["id"], "", 40) || uid(),
    name: text(r["name"], "Story", 80) || "Story",
    kicker: text(r["kicker"], "", 40),
    tags: tags.length ? tags : [makeTag()],
    seconds: clampNum(r["seconds"], 0, 0, 120),
    loop: r["loop"] !== false,
  };
}

export function cleanBulletin(raw: unknown, freshId = false): NewsBulletin | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || !Array.isArray(r["stories"])) return null;
  const stories = (r["stories"] as unknown[])
    .slice(0, MAX_STORIES)
    .map(cleanStory)
    .filter((s): s is NewsStory => !!s);
  const d = makeBulletin();
  return {
    id: !freshId && typeof r["id"] === "string" && r["id"] ? r["id"].slice(0, 40) : uid(),
    name: text(r["name"], "Bulletin", 60).trim() || "Bulletin",
    themeId: GFX_THEMES.some((t) => t.id === r["themeId"]) ? (r["themeId"] as string) : d.themeId,
    logoText: text(r["logoText"], d.logoText, 24),
    clockLabel: text(r["clockLabel"], d.clockLabel, 12),
    scrollLabel: text(r["scrollLabel"], d.scrollLabel, 24),
    scrollLines: text(r["scrollLines"], "", 1200),
    scrollSpeed: clampNum(r["scrollSpeed"], d.scrollSpeed, 8, 120),
    tagSeconds: clampNum(r["tagSeconds"], d.tagSeconds, 2, 120),
    stories: stories.length ? stories : [makeStory("Story 1")],
  };
}

function load(): NewsBulletin[] | null {
  if (typeof window === "undefined") return null;
  for (const k of [KEY, BACKUP]) {
    try {
      const v = window.localStorage.getItem(k);
      if (!v) continue;
      const list = JSON.parse(v) as unknown;
      const out = (Array.isArray(list) ? list : [])
        .map((b) => cleanBulletin(b))
        .filter((b): b is NewsBulletin => !!b);
      if (out.length) return out;
    } catch {
      /* try the backup */
    }
  }
  return null;
}

// ------------------------------------------------------------------ pure helpers (also used by the preview)

const oneLine = (v = "") =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" | ");

/** The News Tags layer settings for a story of a bulletin. */
export function storyPatch(
  b: NewsBulletin,
  s: NewsStory,
  start = 0,
  run = 0,
): Partial<GraphicsConfig["news"]> {
  return {
    kicker: s.kicker,
    tags: s.tags.filter((t) => t.main.trim() || t.below.trim()),
    seconds: s.seconds > 0 ? s.seconds : b.tagSeconds,
    loop: s.loop,
    start,
    run,
  };
}

/** The whole picture of a bulletin + story, for the preview monitor. */
export function previewGraphics(
  base: GraphicsConfig,
  b: NewsBulletin,
  s: NewsStory | undefined,
  run: number,
): GraphicsConfig {
  const th = GFX_THEMES.find((t) => t.id === b.themeId) ?? GFX_THEMES[0]!;
  const g = applyTheme(base, th);
  return {
    ...g,
    logo: { ...g.logo, image: base.logo.image, text: b.logoText },
    clock: { ...g.clock, label: b.clockLabel },
    ticker: {
      ...g.ticker,
      label: b.scrollLabel,
      text: oneLine(b.scrollLines),
      speed: b.scrollSpeed,
      direction: "left",
      loop: true,
    },
    news: s ? { ...g.news, ...storyPatch(b, s, 0, run), anim: "slide" } : g.news,
  };
}

// ------------------------------------------------------------------ store

interface Snapshot {
  bulletins: NewsBulletin[];
  bulletinId: string;
  storyId: string;
  /** Story that is on air now (undefined = no story on air). */
  liveStoryId: string | undefined;
  /** Is the bulletin furniture (logo, clock, scroll) on air? */
  furnitureOn: boolean;
  /** Bumped on every play so the preview restarts too. */
  run: number;
  log: { t: string; msg: string }[];
}

class NewsStore {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private loaded = false;
  private past: NewsBulletin[][] = [];
  private lastCmd = 0;
  private backupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const bulletins = seedBulletins();
    this.snap = {
      bulletins,
      bulletinId: bulletins[0]!.id,
      storyId: bulletins[0]!.stories[0]!.id,
      liveStoryId: undefined,
      furnitureOn: false,
      run: 0,
      log: [],
    };
  }

  private ensure() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    const saved = load();
    if (saved) {
      this.snap = {
        ...this.snap,
        bulletins: saved,
        bulletinId: saved[0]!.id,
        storyId: saved[0]!.stories[0]!.id,
      };
    }
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
        window.localStorage.setItem(KEY, JSON.stringify(this.snap.bulletins));
      } catch {
        /* storage full — keep running in memory */
      }
    }
    this.listeners.forEach((l) => l());
  }

  private say(msg: string) {
    this.emit({
      log: [{ t: new Date().toLocaleTimeString(), msg }, ...this.snap.log].slice(0, 40),
    });
  }

  get bulletin(): NewsBulletin {
    return (
      this.snap.bulletins.find((b) => b.id === this.snap.bulletinId) ?? this.snap.bulletins[0]!
    );
  }
  get story(): NewsStory | undefined {
    return (
      this.bulletin.stories.find((s) => s.id === this.snap.storyId) ?? this.bulletin.stories[0]
    );
  }

  // ---- editing
  private mutate(fn: (list: NewsBulletin[]) => NewsBulletin[]) {
    this.past.push(this.snap.bulletins);
    if (this.past.length > 80) this.past.shift();
    this.emit({ bulletins: fn(this.snap.bulletins) }, true);
  }
  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.emit({ bulletins: p }, true);
    this.fixSelection();
  }
  private fixSelection() {
    const b = this.bulletin;
    if (b.id !== this.snap.bulletinId) this.emit({ bulletinId: b.id });
    if (!b.stories.some((s) => s.id === this.snap.storyId))
      this.emit({ storyId: b.stories[0]?.id ?? "" });
  }

  selectBulletin(id: string) {
    const b = this.snap.bulletins.find((x) => x.id === id);
    if (b) this.emit({ bulletinId: id, storyId: b.stories[0]?.id ?? "" });
  }
  selectStory(id: string) {
    this.emit({ storyId: id });
  }
  patchBulletin(patch: Partial<NewsBulletin>) {
    const id = this.snap.bulletinId;
    this.mutate((l) => l.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  patchStory(storyId: string, patch: Partial<NewsStory>) {
    const id = this.snap.bulletinId;
    this.mutate((l) =>
      l.map((b) =>
        b.id === id
          ? { ...b, stories: b.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s)) }
          : b,
      ),
    );
  }
  newBulletin(name: string) {
    const b = makeBulletin(name);
    this.mutate((l) => [...l, b].slice(0, MAX_BULLETINS));
    this.emit({ bulletinId: b.id, storyId: b.stories[0]!.id });
  }
  duplicateBulletin() {
    const src = this.bulletin;
    const copy: NewsBulletin = {
      ...structuredClone(src),
      id: uid(),
      name: `${src.name} copy`,
      stories: src.stories.map((s) => ({ ...structuredClone(s), id: uid() })),
    };
    this.mutate((l) => [...l, copy].slice(0, MAX_BULLETINS));
    this.emit({ bulletinId: copy.id, storyId: copy.stories[0]?.id ?? "" });
  }
  deleteBulletin(): boolean {
    if (this.snap.bulletins.length < 2) return false;
    const rest = this.snap.bulletins.filter((b) => b.id !== this.snap.bulletinId);
    this.mutate(() => rest);
    this.emit({ bulletinId: rest[0]!.id, storyId: rest[0]!.stories[0]?.id ?? "" });
    return true;
  }
  addStory() {
    const s = makeStory(`Story ${this.bulletin.stories.length + 1}`);
    this.patchBulletin({ stories: [...this.bulletin.stories, s].slice(0, MAX_STORIES) });
    this.emit({ storyId: s.id });
  }
  duplicateStory(id: string) {
    const list = [...this.bulletin.stories];
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return;
    const copy = { ...structuredClone(list[i]!), id: uid(), name: `${list[i]!.name} copy` };
    list.splice(i + 1, 0, copy);
    this.patchBulletin({ stories: list.slice(0, MAX_STORIES) });
    this.emit({ storyId: copy.id });
  }
  removeStory(id: string) {
    if (this.bulletin.stories.length < 2) return;
    this.patchBulletin({ stories: this.bulletin.stories.filter((s) => s.id !== id) });
    this.fixSelection();
  }
  moveStory(id: string, d: -1 | 1) {
    const list = [...this.bulletin.stories];
    const i = list.findIndex((s) => s.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.patchBulletin({ stories: list });
  }
  setTags(storyId: string, tags: NewsTag[]) {
    this.patchStory(storyId, { tags: tags.slice(0, MAX_TAGS) });
  }

  exportJson(): string {
    return JSON.stringify({ app: "mkvision-news", v: 1, bulletin: this.bulletin }, null, 2);
  }
  importJson(raw: string): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("That is not a News Desk file");
    }
    const f = parsed as { app?: string; bulletin?: unknown };
    const b = f && f.app === "mkvision-news" ? cleanBulletin(f.bulletin, true) : null;
    if (!b) throw new Error("That is not a News Desk file");
    this.mutate((l) => [...l, b].slice(0, MAX_BULLETINS));
    this.emit({ bulletinId: b.id, storyId: b.stories[0]?.id ?? "" });
    return b.name;
  }

  // ---- playout
  private guard() {
    const n = Date.now();
    if (n - this.lastCmd < 250) return false;
    this.lastCmd = n;
    return true;
  }
  private graphics(): GraphicsConfig {
    return engine.getSnapshot().config.graphics;
  }

  /** Logo, clock and scroll go on air with this bulletin's look. */
  async startBulletin() {
    if (!this.guard()) return;
    const b = this.bulletin;
    const g = previewGraphics(this.graphics(), b, undefined, this.snap.run);
    const jobs: [GfxId, Record<string, unknown>][] = [
      ["logo", { text: b.logoText, textColor: g.logo.textColor }],
      ["clock", { ...g.clock }],
      ["ticker", { ...g.ticker }],
    ];
    let ok = true;
    for (const [layer, patch] of jobs) ok = (await engine.airGraphic(layer, patch as never)) && ok;
    if (ok) {
      this.emit({ furnitureOn: true });
      this.say(`BULLETIN ON AIR · ${b.name}`);
    }
  }

  /** Put a story's tags on air; they cycle by themselves. */
  async playStory(id?: string, start = 0) {
    if (!this.guard()) return;
    const b = this.bulletin;
    const s = b.stories.find((x) => x.id === (id ?? this.snap.storyId));
    if (!s) return;
    const run = this.snap.run + 1;
    const th = GFX_THEMES.find((t) => t.id === b.themeId) ?? GFX_THEMES[0]!;
    const look = applyTheme(this.graphics(), th).news;
    const ok = await engine.airGraphic("news", {
      primary: look.primary,
      accent: look.accent,
      bg: look.bg,
      textColor: look.textColor,
      font: look.font,
      ...storyPatch(b, s, start, run),
    } as never);
    if (ok) {
      this.emit({ liveStoryId: s.id, storyId: s.id, run });
      this.say(`PLAY ${s.name}${start ? ` · from tag ${start + 1}` : ""}`);
    }
  }

  replay() {
    const id = this.snap.liveStoryId ?? this.snap.storyId;
    void this.playStory(id);
  }

  /** Jump to tag number n (0 = first) of the story on air; it carries on cycling from there. */
  playTag(n: number) {
    const s = this.bulletin.stories.find((x) => x.id === this.snap.liveStoryId);
    if (!s) return;
    void this.playStory(s.id, Math.max(0, Math.min(s.tags.length - 1, n)));
  }

  /** NEXT STORY: select the next one and play it (the current one is replaced). */
  nextStory(d: 1 | -1 = 1) {
    const list = this.bulletin.stories;
    const i = list.findIndex((s) => s.id === (this.snap.liveStoryId ?? this.snap.storyId));
    const n = list[Math.max(0, Math.min(list.length - 1, i + d))];
    if (!n) return;
    if (n.id === this.snap.liveStoryId && d === 1 && i === list.length - 1) {
      this.say("That was the last story");
      return;
    }
    this.emit({ storyId: n.id });
    void this.playStory(n.id);
  }

  async clearTags() {
    await engine.clearGraphic("news");
    this.emit({ liveStoryId: undefined });
    this.say("TAGS OFF");
  }

  async allOff() {
    await Promise.all(
      (["news", "logo", "clock", "ticker"] as GfxId[]).map((l) => engine.clearGraphic(l)),
    );
    this.emit({ liveStoryId: undefined, furnitureOn: false });
    this.say("ALL OFF");
  }
}

export const newsDesk = new NewsStore();

export function useNewsDesk() {
  return useSyncExternalStore(newsDesk.subscribe, newsDesk.getSnapshot, newsDesk.getSnapshot);
}
