// Which console panels are shown (Monitors, Cam Wall, Audio, Tools, Graphics, Sounds).
// Kept in localStorage, so the view you set stays through refreshes and trips to Settings.
import { useCallback, useSyncExternalStore } from "react";

export type Panel = "multiview" | "wall" | "audio" | "status" | "graphics" | "sounds";
export type PanelState = Record<Panel, boolean>;

const KEY = "mkvision.panels.v1";
const DEFAULTS: PanelState = { multiview: true, wall: true, audio: true, status: true, graphics: true, sounds: true };

let cache: PanelState | null = null;
const listeners = new Set<() => void>();

function load(): PanelState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<PanelState> | null;
    const out = { ...DEFAULTS };
    if (raw && typeof raw === "object") for (const k of Object.keys(DEFAULTS) as Panel[]) if (typeof raw[k] === "boolean") out[k] = raw[k]!;
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

const getSnapshot = (): PanelState => (cache ??= load());
const getServerSnapshot = (): PanelState => DEFAULTS;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function usePanels(): [PanelState, (p: Panel) => void] {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback((p: Panel) => {
    cache = { ...getSnapshot(), [p]: !getSnapshot()[p] };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* storage full / blocked: the choice still holds until reload */
    }
    listeners.forEach((l) => l());
  }, []);
  return [show, toggle];
}
