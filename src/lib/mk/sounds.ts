// Sound library: audio files stored in this browser (IndexedDB) so they can be
// pre-listened (CUE) on this device only, and sent to OBS (AIR) when you choose.
import { useSyncExternalStore } from "react";

export interface SoundMeta {
  id: string;
  name: string;
  size: number;
  durationMs: number;
}

export interface SoundsState {
  sounds: SoundMeta[];
  loaded: boolean;
  /** Clip playing in YOUR headphones only. */
  cueId: string | null;
  cueProgress: number;
  /** Clip currently sent to OBS. */
  airId: string | null;
  error: string;
}

/** Biggest clip that is pushed to OBS (it travels inside the browser-source URL). */
export const MAX_AIR_BYTES = 2 * 1024 * 1024;

const DB = "mkvision.sounds";
const STORE = "sounds";

interface Row extends SoundMeta {
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not audio"));
    };
    a.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

class SoundBank {
  private state: SoundsState = {
    sounds: [],
    loaded: false,
    cueId: null,
    cueProgress: 0,
    airId: null,
    error: "",
  };
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private airTimer: ReturnType<typeof setTimeout> | null = null;
  private loading: Promise<void> | null = null;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<SoundsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  load() {
    if (this.state.loaded) return Promise.resolve();
    this.loading ??= (async () => {
      try {
        const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
        const sounds = rows
          .map(({ id, name, size, durationMs }) => ({ id, name, size, durationMs }))
          .sort((a, b) => a.name.localeCompare(b.name));
        this.set({ sounds, loaded: true });
      } catch {
        this.set({ loaded: true, error: "Storage unavailable — sounds won't be kept" });
      }
    })();
    return this.loading;
  }

  async add(files: FileList | File[]) {
    let bad = 0;
    for (const file of Array.from(files)) {
      try {
        const durationMs = await readDuration(file);
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const name = file.name.replace(/\.[^.]+$/, "");
        const row: Row = { id, name, size: file.size, durationMs, blob: file };
        await tx("readwrite", (s) => s.put(row));
        this.set({
          sounds: [...this.state.sounds, { id, name, size: file.size, durationMs }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        });
      } catch {
        bad++;
      }
    }
    this.set({ error: bad ? `${bad} file(s) could not be added (not playable audio)` : "" });
  }

  async remove(id: string) {
    if (this.state.cueId === id) this.stopCue();
    await tx("readwrite", (s) => s.delete(id)).catch(() => {});
    this.set({ sounds: this.state.sounds.filter((s) => s.id !== id) });
  }

  async rename(id: string, name: string) {
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    if (!row) return;
    await tx("readwrite", (s) => s.put({ ...row, name })).catch(() => {});
    this.set({ sounds: this.state.sounds.map((s) => (s.id === id ? { ...s, name } : s)) });
  }

  // ---- CUE: plays on this device only, never touches OBS -----------------
  async cue(id: string) {
    if (this.state.cueId === id) return this.stopCue();
    this.stopCue();
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    if (!row) return;
    this.objectUrl = URL.createObjectURL(row.blob);
    const a = (this.audio ??= new Audio());
    a.src = this.objectUrl;
    a.onended = () => this.stopCue();
    a.ontimeupdate = () => {
      if (a.duration) this.set({ cueProgress: a.currentTime / a.duration });
    };
    this.set({ cueId: id, cueProgress: 0 });
    try {
      await a.play();
    } catch {
      this.stopCue();
      this.set({ error: "Tap CUE again to allow sound" });
    }
  }

  stopCue() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.set({ cueId: null, cueProgress: 0 });
  }

  // ---- AIR: data URL that the engine pushes to OBS -----------------------
  async airData(id: string): Promise<string | null> {
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    return row ? blobToDataUrl(row.blob) : null;
  }

  /** Mark a clip as on air; it clears itself when the clip should have ended. */
  setAir(id: string | null, durationMs = 0, onEnd?: () => void) {
    if (this.airTimer) clearTimeout(this.airTimer);
    this.airTimer = null;
    this.set({ airId: id });
    if (id && durationMs > 0) {
      this.airTimer = setTimeout(() => {
        this.airTimer = null;
        this.set({ airId: null });
        onEnd?.();
      }, durationMs + 400);
    }
  }
}

export const soundBank = new SoundBank();

const serverState: SoundsState = {
  sounds: [],
  loaded: false,
  cueId: null,
  cueProgress: 0,
  airId: null,
  error: "",
};

export function useSounds(): SoundsState {
  return useSyncExternalStore(soundBank.subscribe, soundBank.getSnapshot, () => serverState);
}
