// Local-only configuration persistence. OBS credentials never leave the device.
import {
  AD_LAYOUTS,
  AD_STYLES,
  ANCHORS,
  DEFAULT_AD,
  DEFAULT_FX,
  DEFAULT_PIPS,
  PIP_CORNERS,
  SQUEEZE_DIRS,
  type AdConfig,
  type AdPreset,
  type DskPlace,
  type FxConfig,
  type PipSlot,
  type PlacePos,
} from "./fx";
import { DEFAULT_MERGE, cleanMerge, type MergePreset } from "./merge";
import { cleanTags } from "./tags";
import {
  CAM_COUNT,
  DEFAULT_CONFIG,
  DEFAULT_DSKS,
  DEFAULT_GRAPHICS,
  DEFAULT_LIMITER,
  DEFAULT_SHORTCUTS,
  DSK_COUNT,
  type DskTarget,
  type GraphicsConfig,
  type MkConfig,
  type ScrollPreset,
} from "./types";

const STORAGE_KEY = "mkvision.config.v1";

type Stored = Omit<Partial<MkConfig>, "graphics"> & {
  dskScene?: string;
  dskSource?: string;
  graphics?: unknown;
};

interface LooseGraphics {
  // Older single-logo / single-lower-third format
  logo?: unknown;
  logoPos?: GraphicsConfig["logo"]["pos"];
  logoSize?: number;
  lowerName?: string;
  lowerTitle?: string;
  accent?: string;
  // Current format
  lower?: Partial<GraphicsConfig["lower"]>;
  ticker?: Partial<GraphicsConfig["ticker"]>;
  clock?: Partial<GraphicsConfig["clock"]>;
  badge?: Partial<GraphicsConfig["badge"]>;
  breaking?: Partial<GraphicsConfig["breaking"]>;
  score?: Partial<GraphicsConfig["score"]>;
  social?: Partial<GraphicsConfig["social"]>;
  full?: Partial<GraphicsConfig["full"]>;
}

/** Keep only well-formed scroll presets (storage and share links are untrusted). */
export function cleanScrolls(list: unknown[]): ScrollPreset[] {
  const out: ScrollPreset[] = [];
  for (const item of list) {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof p["text"] !== "string" || !p["text"].trim()) continue;
    const speed = Number(p["speed"]);
    out.push({
      name: (typeof p["name"] === "string" && p["name"].trim() ? p["name"] : p["text"]).slice(
        0,
        24,
      ),
      text: p["text"].slice(0, 400),
      label: typeof p["label"] === "string" ? p["label"].slice(0, 24) : "",
      speed: Number.isFinite(speed) ? Math.max(8, Math.min(120, speed)) : 22,
      direction: p["direction"] === "right" ? "right" : "left",
      loop: p["loop"] !== false,
    });
    if (out.length >= 12) break;
  }
  return out;
}

function mergeGraphics(raw: unknown): GraphicsConfig {
  const D = DEFAULT_GRAPHICS;
  const r = (raw ?? {}) as LooseGraphics;
  if (r.logoPos !== undefined || r.lowerName !== undefined || typeof r.logo === "string") {
    return {
      ...D,
      logo: {
        image: typeof r.logo === "string" ? r.logo : null,
        pos: r.logoPos ?? D.logo.pos,
        at: null,
        size: r.logoSize ?? D.logo.size,
        opacity: D.logo.opacity,
        text: D.logo.text,
        textColor: D.logo.textColor,
        anim: D.logo.anim,
      },
      lower: {
        ...D.lower,
        name: r.lowerName ?? D.lower.name,
        title: r.lowerTitle ?? D.lower.title,
        accent: r.accent ?? D.lower.accent,
      },
    };
  }
  return {
    logo: { ...D.logo, ...((r.logo ?? {}) as Partial<GraphicsConfig["logo"]>) },
    lower: {
      ...D.lower,
      ...(r.lower ?? {}),
      presets: Array.isArray(r.lower?.presets) ? r.lower.presets : [],
    },
    ticker: {
      ...D.ticker,
      ...(r.ticker ?? {}),
      scrolls: Array.isArray(r.ticker?.scrolls) ? cleanScrolls(r.ticker.scrolls) : D.ticker.scrolls,
    },
    clock: { ...D.clock, ...(r.clock ?? {}) },
    badge: { ...D.badge, ...(r.badge ?? {}) },
    breaking: { ...D.breaking, ...(r.breaking ?? {}) },
    score: { ...D.score, ...(r.score ?? {}) },
    social: { ...D.social, ...(r.social ?? {}) },
    full: { ...D.full, ...(r.full ?? {}) },
  };
}

function mergeFx(raw: unknown): FxConfig {
  const r = (raw ?? {}) as Partial<FxConfig>;
  return {
    pipCorner: PIP_CORNERS.includes(r.pipCorner as never)
      ? (r.pipCorner as FxConfig["pipCorner"])
      : DEFAULT_FX.pipCorner,
    pipSize:
      typeof r.pipSize === "number" ? Math.min(0.5, Math.max(0.15, r.pipSize)) : DEFAULT_FX.pipSize,
    squeezeDir: SQUEEZE_DIRS.includes(r.squeezeDir as never)
      ? (r.squeezeDir as FxConfig["squeezeDir"])
      : DEFAULT_FX.squeezeDir,
  };
}

const unit = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

function mergePos(raw: unknown): PlacePos | null {
  const r = (raw ?? {}) as Partial<PlacePos>;
  const x = unit(r.x);
  const y = unit(r.y);
  return x === null || y === null ? null : { x, y };
}

function mergeDskPlace(raw: unknown): DskPlace | null {
  const pos = mergePos(raw);
  const size = (raw as Partial<DskPlace> | null | undefined)?.size;
  if (!pos || typeof size !== "number") return null;
  return { ...pos, size: Math.min(1, Math.max(0.05, size)) };
}

function mergePips(raw: unknown): PipSlot[] {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_PIPS.map((d, i) => {
    const r = (list[i] ?? {}) as Partial<PipSlot>;
    return {
      scene: typeof r.scene === "string" && r.scene ? r.scene : null,
      corner: PIP_CORNERS.includes(r.corner as never) ? (r.corner as PipSlot["corner"]) : d.corner,
      size: typeof r.size === "number" ? Math.min(0.5, Math.max(0.1, r.size)) : d.size,
      pos: mergePos(r.pos),
    };
  });
}

function mergeAd(raw: unknown): AdConfig {
  const r = (raw ?? {}) as Partial<AdConfig>;
  return {
    scene: typeof r.scene === "string" && r.scene ? r.scene : null,
    look: r.look === "strip" ? "strip" : r.look === "frame" ? "frame" : DEFAULT_AD.look,
    anchor: ANCHORS.includes(r.anchor as never)
      ? (r.anchor as AdConfig["anchor"])
      : DEFAULT_AD.anchor,
    style: AD_STYLES.some((x) => x.id === r.style)
      ? (r.style as AdConfig["style"])
      : DEFAULT_AD.style,
    layout: AD_LAYOUTS.some((l) => l.id === r.layout)
      ? (r.layout as AdConfig["layout"])
      : DEFAULT_AD.layout,
    size: typeof r.size === "number" ? Math.min(0.4, Math.max(0.15, r.size)) : DEFAULT_AD.size,
    fit: r.fit === "fill" ? "fill" : "fit",
  };
}

function mergeMergePresets(raw: unknown): { mergePresets: MergePreset[]; mergeActive: number } {
  const list = Array.isArray(raw) ? raw : [];
  const mergePresets: MergePreset[] = list
    .filter((p) => !!p && typeof p === "object")
    .slice(0, 24)
    .map((p, i) => {
      const r = p as Partial<MergePreset>;
      return {
        name: typeof r.name === "string" && r.name.trim() ? r.name.slice(0, 32) : `Split ${i + 1}`,
        merge: cleanMerge(r.merge),
      };
    });
  if (!mergePresets.length) mergePresets.push({ name: "Split 2", merge: DEFAULT_MERGE });
  return { mergePresets, mergeActive: 0 };
}

function mergeAdPresets(
  raw: unknown,
  current: AdConfig,
): { adPresets: AdPreset[]; adActive: number } {
  const list = Array.isArray(raw) ? raw : [];
  const adPresets: AdPreset[] = list
    .filter((p) => !!p && typeof p === "object")
    .slice(0, 24)
    .map((p, i) => {
      const r = p as Partial<AdPreset>;
      return {
        name:
          typeof r.name === "string" && r.name.trim()
            ? r.name.slice(0, 32)
            : `Squeeze Merge ${i + 1}`,
        ad: mergeAd(r.ad),
      };
    });
  // First run with presets: the Squeeze Merge that was already set up becomes preset 1.
  if (!adPresets.length) adPresets.push({ name: "Squeeze Merge 1", ad: current });
  return { adPresets, adActive: 0 };
}

export function loadConfig(): MkConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Stored;
    const camScenes = Array.from({ length: CAM_COUNT }, (_, i) => parsed.camScenes?.[i] ?? null);
    // Migrate the old single-DSK fields into DSK 1.
    const dsks: DskTarget[] = Array.from({ length: DSK_COUNT }, (_, i) => {
      const stored = parsed.dsks?.[i];
      if (stored)
        return {
          scene: stored.scene ?? "",
          source: stored.source ?? "",
          place: mergeDskPlace(stored.place),
        };
      if (i === 0 && (parsed.dskScene || parsed.dskSource)) {
        return { scene: parsed.dskScene ?? "", source: parsed.dskSource ?? "" };
      }
      return { ...DEFAULT_DSKS[i]! };
    });
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      camScenes,
      dsks,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts ?? {}) },
      graphics: mergeGraphics(parsed.graphics),
      graphicsScene: typeof parsed.graphicsScene === "string" ? parsed.graphicsScene : "",
      listenUrl: typeof parsed.listenUrl === "string" ? parsed.listenUrl : "",
      listenVolume: typeof parsed.listenVolume === "number" ? parsed.listenVolume : 1,
      rundown: Array.isArray(parsed.rundown)
        ? parsed.rundown
            .filter((i) => !!i && typeof i.text === "string" && i.text.trim() !== "")
            .slice(0, 40)
            .map((i) => ({
              text: i.text.slice(0, 120),
              secs:
                typeof i.secs === "number" && i.secs > 0 ? Math.min(Math.round(i.secs), 86_400) : 0,
            }))
        : [],
      fx: mergeFx((parsed as { fx?: unknown }).fx),
      pips: mergePips((parsed as { pips?: unknown }).pips),
      ...(() => {
        const p = parsed as { ad?: unknown; adPresets?: unknown; adActive?: unknown };
        const merged = mergeAdPresets(p.adPresets, mergeAd(p.ad));
        const active =
          typeof p.adActive === "number" && p.adActive >= 0 && p.adActive < merged.adPresets.length
            ? Math.floor(p.adActive)
            : 0;
        // The working copy always matches the selected preset.
        return { adPresets: merged.adPresets, adActive: active, ad: merged.adPresets[active]!.ad };
      })(),
      tags: cleanTags((parsed as { tags?: unknown }).tags),
      ...(() => {
        const p = parsed as { mergePresets?: unknown; mergeActive?: unknown };
        const merged = mergeMergePresets(p.mergePresets);
        const active =
          typeof p.mergeActive === "number" && p.mergeActive >= 0 && p.mergeActive < merged.mergePresets.length
            ? Math.floor(p.mergeActive)
            : 0;
        return { mergePresets: merged.mergePresets, mergeActive: active };
      })(),
      hiddenAudio: Array.isArray(parsed.hiddenAudio)
        ? parsed.hiddenAudio.filter((n): n is string => typeof n === "string")
        : [],
      limiter: {
        on: typeof parsed.limiter?.on === "boolean" ? parsed.limiter.on : DEFAULT_LIMITER.on,
        threshold:
          typeof parsed.limiter?.threshold === "number"
            ? parsed.limiter.threshold
            : DEFAULT_LIMITER.threshold,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: MkConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — keep running in-memory */
  }
}
