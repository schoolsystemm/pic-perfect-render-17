// Video playout: an ordered list of files (name + length), planned start/end times, and a runner that plays each one
// in OBS through the "MK Playout" scene and moves to the next when OBS says the file has ended.
// Lives outside React so it keeps running while you look at another page of the switcher.
import { useSyncExternalStore } from "react";

import { engine } from "./use-switcher";

export interface PlayItem {
  id: string;
  name: string;
  /** Length in seconds. 0 = unknown (filled in from OBS when it plays). */
  secs: number;
}

export interface PlayPlan {
  items: PlayItem[];
  /** Folder that holds the files ON THE OBS PC, e.g. C:\Videos */
  folder: string;
  /** Planned start of the first video, "HH:MM:SS". */
  startAt: string;
  /** Cut to the playout scene when a video starts. */
  take: boolean;
  /** Cut back to the previous scene when the list ends or is stopped. */
  ret: boolean;
}

export interface PlayRun {
  /** -1 = idle, items.length = finished. */
  idx: number;
  /** Date.now() at the start of the current video (shifted forward by time spent paused). */
  t0: number;
  /** Date.now() when paused, else null. */
  pausedAt: number | null;
}

const KEY = "mk.playout.v1";
const IDLE: PlayRun = { idx: -1, t0: 0, pausedAt: null };
const DEFAULT: PlayPlan = { items: [], folder: "", startAt: "12:00:00", take: true, ret: true };

function loadPlan(): PlayPlan {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<PlayPlan>) };
  } catch {
    /* fall through */
  }
  return DEFAULT;
}

let plan: PlayPlan = loadPlan();
let run: PlayRun = IDLE;
let snap = { plan, run };
const subs = new Set<() => void>();

function emit() {
  snap = { plan, run };
  subs.forEach((f) => f());
}
function setPlan(next: PlayPlan) {
  plan = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage unavailable */
  }
  emit();
}
function setRun(next: PlayRun) {
  run = next;
  emit();
}

export const usePlayout = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => snap,
    () => snap,
  );

// ------------------------------------------------------------------ time helpers

const p2 = (n: number) => String(n).padStart(2, "0");

/** 5025 -> "1:23:45" */
export const fmtLen = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 3600)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
};
/** Seconds into the day -> "13:05:09" */
export const fmtClock = (s: number) => {
  s = ((Math.round(s) % 86400) + 86400) % 86400;
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
};
/** "20:54" -> 1254, "1:02:03" -> 3723, "" or junk -> null */
export function parseLen(text: string): number | null {
  const parts = text.trim().split(":").map(Number);
  if (!text.trim() || parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length > 3)
    return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
}
export const secOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

export interface Slot {
  start: number;
  end: number;
}

/**
 * Start / end (seconds into the day) for every item. Idle: from the planned start time.
 * Running: anchored on when the current video really started, so the rest of the list shifts with reality.
 */
export function schedule(items: PlayItem[], r: PlayRun, startAt: string): Slot[] {
  const out: Slot[] = [];
  if (!items.length) return out;
  let at = parseLen(startAt) ?? 0;
  let anchor = 0;
  if (r.idx >= 0 && r.idx < items.length) {
    anchor = r.idx;
    at = secOfDay(r.t0);
  }
  out[anchor] = { start: at, end: at + (items[anchor]?.secs ?? 0) };
  for (let i = anchor + 1; i < items.length; i++) {
    const s = out[i - 1]!.end;
    out[i] = { start: s, end: s + items[i]!.secs };
  }
  for (let i = anchor - 1; i >= 0; i--) {
    const e = out[i + 1]!.start;
    out[i] = { start: e - items[i]!.secs, end: e };
  }
  return out;
}

export const totalSecs = (items: PlayItem[]) => items.reduce((a, i) => a + i.secs, 0);

export function pathOf(item: PlayItem): string {
  const f = plan.folder.trim().replace(/[\\/]+$/, "");
  if (!f) return item.name;
  const sep = f.includes("/") && !f.includes("\\") ? "/" : "\\";
  return `${f}${sep}${item.name}`;
}

// ------------------------------------------------------------------ editing the list

function probe(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (s: number) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(s);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration) : 0);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    v.src = url;
  });
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export const playout = {
  async addFiles(files: File[]) {
    const added: PlayItem[] = [];
    for (const f of files) added.push({ id: newId(), name: f.name, secs: await probe(f) });
    setPlan({ ...plan, items: [...plan.items, ...added] });
  },
  setFolder: (folder: string) => setPlan({ ...plan, folder }),
  setStartAt: (startAt: string) =>
    setPlan({ ...plan, startAt: startAt.length === 5 ? `${startAt}:00` : startAt }),
  setOpt: (o: Partial<Pick<PlayPlan, "take" | "ret">>) => setPlan({ ...plan, ...o }),
  setSecs(i: number, secs: number) {
    setPlan({ ...plan, items: plan.items.map((it, k) => (k === i ? { ...it, secs } : it)) });
  },
  move(i: number, to: number) {
    if (to < 0 || to >= plan.items.length) return;
    const items = [...plan.items];
    items.splice(to, 0, items.splice(i, 1)[0]!);
    if (run.idx === i) setRun({ ...run, idx: to });
    else if (run.idx === to) setRun({ ...run, idx: i });
    setPlan({ ...plan, items });
  },
  remove(i: number) {
    if (i === run.idx) return; // not while it is playing
    if (run.idx > i && run.idx < plan.items.length) setRun({ ...run, idx: run.idx - 1 });
    setPlan({ ...plan, items: plan.items.filter((_, k) => k !== i) });
  },
  clear() {
    void playout.stop();
    setPlan({ ...plan, items: [] });
  },

  // ---------------------------------------------------------------- running

  /** Start item `i` now. */
  async playAt(i: number): Promise<void> {
    const item = plan.items[i];
    if (!item) return;
    busy = true;
    setRun({ idx: i, t0: Date.now(), pausedAt: null });
    const ok = await engine.playoutPlay(pathOf(item), plan.take);
    busy = false;
    if (!ok) {
      stopTicker();
      setRun(IDLE);
      return;
    }
    setRun({ idx: i, t0: Date.now(), pausedAt: null });
    startTicker();
  },

  /** The next video, or finish the list. */
  async next(): Promise<void> {
    const n = run.idx + 1;
    if (n >= plan.items.length) return finish();
    await playout.playAt(n);
  },

  async togglePause(): Promise<void> {
    if (run.idx < 0 || run.idx >= plan.items.length) return;
    if (run.pausedAt === null) {
      await engine.playoutControl("pause");
      setRun({ ...run, pausedAt: Date.now() });
    } else {
      await engine.playoutControl("play");
      setRun({ ...run, t0: run.t0 + (Date.now() - run.pausedAt), pausedAt: null });
    }
  },

  async stop(): Promise<void> {
    stopTicker();
    if (run.idx >= 0) await engine.playoutControl("stop");
    setRun(IDLE);
    if (plan.ret) await engine.playoutReturn();
  },

  takeToAir: () => engine.playoutTake(),
  back: () => engine.playoutReturn(),
};

async function finish() {
  stopTicker();
  setRun({ idx: plan.items.length, t0: 0, pausedAt: null });
  if (plan.ret) await engine.playoutReturn();
}

let ticker: ReturnType<typeof setInterval> | null = null;
let busy = false;

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}
function startTicker() {
  stopTicker();
  ticker = setInterval(() => void tick(), 500);
}

async function tick() {
  if (busy || run.pausedAt !== null || run.idx < 0 || run.idx >= plan.items.length) return;
  busy = true;
  try {
    const it = plan.items[run.idx]!;
    const el = Date.now() - run.t0;
    const st = await engine.playoutStatus();
    if (st && st.durMs > 0 && Math.abs(st.durMs / 1000 - it.secs) > 1)
      playout.setSecs(run.idx, Math.round(st.durMs / 1000));
    const ended = st ? st.state === "ended" && el > 1500 : it.secs > 0 && el >= it.secs * 1000;
    if (ended) {
      busy = false;
      await playout.next();
    }
  } finally {
    busy = false;
  }
}
