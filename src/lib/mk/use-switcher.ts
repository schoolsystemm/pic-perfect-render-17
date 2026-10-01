import { useEffect, useSyncExternalStore } from "react";

import { engine } from "./engine";
import { DEFAULT_CONFIG, DSK_COUNT, IDLE_GFX, IDLE_OUTPUT, type SwitcherState } from "./types";

const serverSnapshot: SwitcherState = {
  status: "disconnected",
  statusMessage: "",
  demo: DEFAULT_CONFIG.demoMode,
  program: null,
  preview: null,
  programScene: null,
  previewScene: null,
  dskActive: Array.from({ length: DSK_COUNT }, () => false),
  gfxActive: IDLE_GFX,
  tBar: 0,
  transitioning: false,
  fx: { running: false, layout: null },
  scenes: [],
  transitions: [],
  studioMode: false,
  config: DEFAULT_CONFIG,
  audio: [],
  mainAudio: null,
  levels: {},
  stream: IDLE_OUTPUT,
  record: IDLE_OUTPUT,
  notice: null,
  gr: null,
  masterMuted: false,
};

/** Subscribe to the control engine. Boots it on first client render. */
export function useSwitcher() {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => serverSnapshot);

  useEffect(() => {
    engine.boot();
  }, []);

  return state;
}

export { engine };
