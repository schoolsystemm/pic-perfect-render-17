// Local-only configuration persistence. OBS credentials never leave the device.
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
    ticker: { ...D.ticker, ...(r.ticker ?? {}) },
    clock: { ...D.clock, ...(r.clock ?? {}) },
    badge: { ...D.badge, ...(r.badge ?? {}) },
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
