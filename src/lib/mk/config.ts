// Local-only configuration persistence. OBS credentials never leave the device.
import { DEFAULT_FX, PIP_CORNERS, SQUEEZE_DIRS, type FxConfig } from "./fx";
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
}

/** Keep only well-formed scroll presets (storage and share links are untrusted). */
export function cleanScrolls(list: unknown[]): ScrollPreset[] {
  const out: ScrollPreset[] = [];
  for (const item of list) {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof p["text"] !== "string" || !p["text"].trim()) continue;
    const speed = Number(p["speed"]);
    out.push({
      name: (typeof p["name"] === "string" && p["name"].trim() ? p["name"] : p["text"]).slice(0, 24),
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
        size: r.logoSize ?? D.logo.size,
        opacity: D.logo.opacity,
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
  };
}

function mergeFx(raw: unknown): FxConfig {
  const r = (raw ?? {}) as Partial<FxConfig>;
  return {
    pipCorner: PIP_CORNERS.includes(r.pipCorner as never) ? (r.pipCorner as FxConfig["pipCorner"]) : DEFAULT_FX.pipCorner,
    pipSize: typeof r.pipSize === "number" ? Math.min(0.5, Math.max(0.15, r.pipSize)) : DEFAULT_FX.pipSize,
    squeezeDir: SQUEEZE_DIRS.includes(r.squeezeDir as never) ? (r.squeezeDir as FxConfig["squeezeDir"]) : DEFAULT_FX.squeezeDir,
  };
}

export function loadConfig(): MkConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Stored;
    const camScenes = Array.from(
      { length: CAM_COUNT },
      (_, i) => parsed.camScenes?.[i] ?? null,
    );
    // Migrate the old single-DSK fields into DSK 1.
    const dsks: DskTarget[] = Array.from({ length: DSK_COUNT }, (_, i) => {
      const stored = parsed.dsks?.[i];
      if (stored) return { scene: stored.scene ?? "", source: stored.source ?? "" };
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
              secs: typeof i.secs === "number" && i.secs > 0 ? Math.min(Math.round(i.secs), 86_400) : 0,
            }))
        : [],
      fx: mergeFx((parsed as { fx?: unknown }).fx),
      hiddenAudio: Array.isArray(parsed.hiddenAudio) ? parsed.hiddenAudio.filter((n): n is string => typeof n === "string") : [],
      limiter: {
        on: typeof parsed.limiter?.on === "boolean" ? parsed.limiter.on : DEFAULT_LIMITER.on,
        threshold:
          typeof parsed.limiter?.threshold === "number" ? parsed.limiter.threshold : DEFAULT_LIMITER.threshold,
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
