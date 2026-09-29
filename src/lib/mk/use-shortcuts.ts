import { useEffect } from "react";

import { engine } from "./engine";
import type { Shortcuts } from "./types";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Supplementary keyboard control for the switcher. */
export function useShortcuts(shortcuts: Shortcuts, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const camIndex = shortcuts.cams.findIndex((k) => k.toLowerCase() === key);
      if (camIndex !== -1) {
        event.preventDefault();
        void engine.selectPreview(camIndex);
        return;
      }
      if (key === shortcuts.autoTake.toLowerCase()) {
        event.preventDefault();
        void engine.autoTake();
        return;
      }
      if (key === shortcuts.cut.toLowerCase()) {
        event.preventDefault();
        void engine.cut();
        return;
      }
      if (key === shortcuts.dsk.toLowerCase()) {
        event.preventDefault();
        void engine.toggleDSK();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, enabled]);
}
