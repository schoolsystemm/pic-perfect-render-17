// Local-only configuration persistence. OBS credentials never leave the device.
import { DEFAULT_CONFIG, DEFAULT_SHORTCUTS, CAM_COUNT, type MkConfig } from "./types";

const STORAGE_KEY = "mkvision.config.v1";

export function loadConfig(): MkConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<MkConfig>;
    const camScenes = Array.from(
      { length: CAM_COUNT },
      (_, i) => parsed.camScenes?.[i] ?? null,
    );
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      camScenes,
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
