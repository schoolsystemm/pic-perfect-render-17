import { useSyncExternalStore } from "react";

import type { RundownItem } from "@/lib/mk/types";

/**
 * Live state of the run of show. Lives outside React so it survives the Tools panel
 * being hidden or switched to another tab. Uses Date.now() so a pop-out window on the
 * same machine can compute the same clock from a snapshot.
 */
export interface RunState {
  /** -1 = not started, items.length = show finished. */
  idx: number;
  running: boolean;
  /** ms already spent on the current segment when last paused / cued. */
  base: number;
  /** Date.now() when the current run started. */
  t0: number;
}

export const IDLE_RUN: RunState = { idx: -1, running: false, base: 0, t0: 0 };

let run: RunState = IDLE_RUN;
const subs = new Set<() => void>();

export const runStore = {
  get: () => run,
  set(next: RunState) {
    run = next;
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export const useRun = () => useSyncExternalStore(runStore.subscribe, runStore.get, () => IDLE_RUN);

export const elapsedOf = (r: RunState, now = Date.now()) => r.base + (r.running ? now - r.t0 : 0);

/** Start the next segment (or start the show). Past the last segment the show ends. */
export function goNext(items: RundownItem[]) {
  if (!items.length) return;
  const next = Math.min(run.idx + 1, items.length);
  runStore.set(next >= items.length ? { idx: items.length, running: false, base: 0, t0: 0 } : { idx: next, running: true, base: 0, t0: Date.now() });
}

export function goBack() {
  if (run.idx <= 0) return;
  runStore.set({ idx: run.idx - 1, running: run.running, base: 0, t0: Date.now() });
}

/** Cue a segment without starting it. */
export function cue(i: number) {
  runStore.set({ idx: i, running: false, base: 0, t0: 0 });
}

export function togglePause() {
  if (run.idx < 0 || run.idx >= 1e9) return;
  runStore.set(run.running ? { ...run, running: false, base: elapsedOf(run), t0: 0 } : { ...run, running: true, t0: Date.now() });
}

export const resetRun = () => runStore.set(IDLE_RUN);

/** Keep the pointer on the same segment when the list is edited. */
export function onMoved(from: number, to: number) {
  if (run.idx === from) runStore.set({ ...run, idx: to });
  else if (run.idx === to) runStore.set({ ...run, idx: from });
}

export function onRemoved(i: number) {
  if (run.idx < 0) return;
  if (i < run.idx) runStore.set({ ...run, idx: run.idx - 1 });
  else if (i === run.idx) runStore.set({ idx: run.idx, running: false, base: 0, t0: 0 });
}

/** "2" -> 120s, "1:30" -> 90s, "" -> 0 (untimed). */
export function parseDuration(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const secs = (parseInt(m ?? "0", 10) || 0) * 60 + (parseInt(s ?? "0", 10) || 0);
    return Math.max(0, Math.min(secs, 86_400));
  }
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 60), 86_400) : 0;
}

export const fmtSecs = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Signed clock: remaining time, or +overtime. */
export function fmtClock(ms: number) {
  const over = ms < 0;
  const total = Math.ceil(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return over ? `+${body}` : body;
}

// ---------------------------------------------------------------- pop-out sync

export const RUNDOWN_CHANNEL = "mk-rundown";

export interface RundownSnapshot {
  items: RundownItem[];
  run: RunState;
}
