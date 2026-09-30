// Local-only configuration persistence. OBS credentials never leave the device.
import {
  CAM_COUNT,
  DEFAULT_CONFIG,
  DEFAULT_DSKS,
  DEFAULT_SHORTCUTS,
  DSK_COUNT,
  type DskTarget,
  type MkConfig,
} from "./types";

const STORAGE_KEY = "mkvision.config.v1";

type Stored = Partial<MkConfig> & { dskScene?: string; dskSource?: string };

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
