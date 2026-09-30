import { useEffect, useSyncExternalStore } from "react";

import { engine } from "./engine";
import { DEFAULT_CONFIG, IDLE_OUTPUT, type SwitcherState } from "./types";

const serverSnapshot: SwitcherState = {
  status: "disconnected",
  statusMessage: "",
  demo: DEFAULT_CONFIG.demoMode,
  program: null,
  preview: null,
  programScene: null,
  previewScene: null,
  dskActive: false,
  tBar: 0,
  transitioning: false,
  scenes: [],
  transitions: [],
  studioMode: false,
  config: DEFAULT_CONFIG,
  audio: [],
  levels: {},
  stream: IDLE_OUTPUT,
  record: IDLE_OUTPUT,
};

/** Subscribe to the control engine. Boots it on first client render. */
export function useSwitcher() {
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    () => serverSnapshot,
  );

  useEffect(() => {
    engine.boot();
  }, []);

  return state;
}

export { engine };
