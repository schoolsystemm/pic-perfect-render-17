import { Headphones, Radio, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { MAX_AIR_BYTES, soundBank, useSounds, type SoundMeta } from "@/lib/mk/sounds";
import { engine } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function toggleAir(s: SoundMeta, airId: string | null) {
  if (airId === s.id) {
    soundBank.setAir(null);
    await engine.stopAirSound();
    return;
  }
  const data = await soundBank.airData(s.id);
  if (!data) return;
  if (await engine.airSound(data)) {
    soundBank.setAir(s.id, s.durationMs, () => void engine.stopAirSound());
  }
}

/**
 * CUE = plays on THIS device only (your headphones), OBS never hears it.
 * AIR = sends it to the program.
 */
export function SoundPad({ manage = false }: { manage?: boolean }) {
  const st = useSounds();
  useEffect(() => {
    void soundBank.load();
  }, []);

  return (
    <section className="mk-panel shrink-0 rounded-md p-2 sm:p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="mk-label text-foreground">Sounds</span>
        <span className="mk-label hidden text-[9px] sm:block">CUE = only you hear it · AIR = to program</span>
        {manage && (
          <label className="mk-button ml-auto flex h-9 cursor-pointer items-center rounded-sm px-3 text-xs">
            + Add audio files
            <input
              type="file"
              accept="audio/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) void soundBank.add(files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </header>

      {st.error && <p className="mb-2 font-mono text-[10px] text-amber">{st.error}</p>}
      {st.loaded && st.sounds.length === 0 && (
        <p className="font-mono text-[10px] text-muted-foreground">
          No sounds yet. Add audio files on the Sounds page — they stay in this browser.
        </p>
      )}

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {st.sounds.map((s) => {
          const cueing = st.cueId === s.id;
          const onAir = st.airId === s.id;
          const tooBig = s.size > MAX_AIR_BYTES;
          return (
            <li key={s.id} className="relative flex items-center gap-1.5 overflow-hidden rounded-sm bg-bezel/40 p-1.5">
              {cueing && (
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20"
                  style={{ width: `${st.cueProgress * 100}%` }}
                />
              )}
              <button
                type="button"
                aria-label={`Pre-listen ${s.name}`}
                aria-pressed={cueing}
                onPointerDown={(e) => {
                  e.preventDefault();
                  void soundBank.cue(s.id);
                }}
                className={cn("mk-button relative flex h-11 w-12 shrink-0 items-center justify-center rounded-sm", cueing && "mk-lit-preview")}
              >
                <Headphones className="h-4 w-4" />
              </button>
              <div className="relative min-w-0 flex-1">
                {manage ? (
                  <input
                    className="h-7 w-full min-w-0 rounded-sm border border-border bg-input px-1.5 font-mono text-xs text-foreground outline-none focus:border-ring"
                    defaultValue={s.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && void soundBank.rename(s.id, e.target.value.trim())}
                  />
                ) : (
                  <div className="truncate text-sm text-foreground">{s.name}</div>
                )}
                <div className="font-mono text-[10px] text-muted-foreground">
                  {fmt(s.durationMs)}
                  {tooBig ? " · too big for AIR (max 2 MB)" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={tooBig}
                aria-label={`Send ${s.name} to air`}
                aria-pressed={onAir}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!tooBig) void toggleAir(s, st.airId);
                }}
                className={cn("mk-button relative flex h-11 shrink-0 items-center gap-1 rounded-sm px-2 text-xs disabled:opacity-40", onAir && "mk-lit-program")}
              >
                <Radio className="h-4 w-4" />
                {onAir ? "STOP" : "AIR"}
              </button>
              {manage && (
                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  className="mk-button relative flex h-11 w-9 shrink-0 items-center justify-center rounded-sm"
                  onClick={() => void soundBank.remove(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
