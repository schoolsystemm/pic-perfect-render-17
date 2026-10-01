import { Link } from "@tanstack/react-router";
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

  const row = manage ? "h-11" : "h-7";
  return (
    <section className={cn("mk-panel flex min-h-0 flex-col rounded-md p-1.5", manage ? "shrink-0 sm:p-3" : "h-full min-w-0")}>
      <header className="mb-1 flex shrink-0 items-center gap-2">
        <span className="mk-label text-foreground">Sounds</span>
        <span className="mk-label truncate text-[8px]">Cue · Air</span>
        {manage ? (
          <label className="mk-button ml-auto flex h-8 cursor-pointer items-center rounded-[3px] px-3 text-xs">
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
        ) : (
          <Link to="/sounds" className="mk-button ml-auto flex h-[18px] items-center rounded-[3px] px-2 text-[9px]">
            Manage
          </Link>
        )}
      </header>

      {st.error && <p className="mb-1 font-mono text-[9px] text-amber">{st.error}</p>}
      {st.loaded && st.sounds.length === 0 && (
        <p className="font-mono text-[10px] leading-snug text-muted-foreground">
          No sounds yet. Add audio files on the Sounds page — they stay in this browser.
        </p>
      )}

      <ul className={cn("grid min-h-0 gap-1 overflow-y-auto", manage && "sm:grid-cols-2")}>
        {st.sounds.map((s) => {
          const cueing = st.cueId === s.id;
          const onAir = st.airId === s.id;
          const tooBig = s.size > MAX_AIR_BYTES;
          return (
            <li key={s.id} className={cn("relative flex items-center gap-1 overflow-hidden rounded-[3px] bg-black/25 p-0.5", row)}>
              {cueing && (
                <span className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${st.cueProgress * 100}%` }} />
              )}
              <button
                type="button"
                aria-label={`Pre-listen ${s.name}`}
                aria-pressed={cueing}
                onPointerDown={(e) => {
                  e.preventDefault();
                  void soundBank.cue(s.id);
                }}
                className={cn("mk-button relative flex h-full w-8 shrink-0 items-center justify-center rounded-[3px]", cueing && "mk-lit-preview")}
              >
                <Headphones className="h-3.5 w-3.5" />
              </button>
              <div className="relative min-w-0 flex-1">
                {manage ? (
                  <input
                    className="mk-field h-7 w-full min-w-0 rounded-[3px] px-1.5 text-xs"
                    defaultValue={s.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && void soundBank.rename(s.id, e.target.value.trim())}
                  />
                ) : (
                  <div className="truncate text-[11px] leading-none text-foreground">{s.name}</div>
                )}
                <div className="font-mono text-[8px] leading-none text-muted-foreground">
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
                className={cn("mk-button relative flex h-full shrink-0 items-center gap-1 rounded-[3px] px-1.5 text-[10px]", onAir && "mk-lit-program")}
              >
                <Radio className="h-3 w-3" />
                {onAir ? "STOP" : "AIR"}
              </button>
              {manage && (
                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  className="mk-button relative flex h-full w-8 shrink-0 items-center justify-center rounded-[3px]"
                  onClick={() => void soundBank.remove(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
