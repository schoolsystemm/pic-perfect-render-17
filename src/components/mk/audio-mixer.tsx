import { Volume2, VolumeX } from "lucide-react";

import type { AudioChannel } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const TICKS = [0, -6, -12, -24, -36, -48];
const pct = (db: number) => Math.max(0, Math.min(100, ((db + 48) / 51) * 100));

interface AudioMixerProps {
  channels: AudioChannel[];
  levels: Record<string, number>;
  afv: boolean;
  camOf: (name: string) => number | null;
  onVolume: (name: string, db: number) => void;
  onMute: (name: string) => void;
  onAfv: (on: boolean) => void;
}

function Meter({ db }: { db: number }) {
  const p = pct(db);
  const clip = db >= -0.5;
  return (
    <div className="relative h-full w-2.5 overflow-hidden rounded-[1px] bg-bezel">
      <div
        className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-75", p > 90 ? "bg-program" : p > 75 ? "bg-amber" : "bg-preview")}
        style={{ height: `${p}%` }}
      />
      {clip && <div className="absolute inset-x-0 top-0 h-1 bg-program" />}
    </div>
  );
}

export function AudioMixer({ channels, levels, afv, camOf, onVolume, onMute, onAfv }: AudioMixerProps) {
  return (
    <section className="mk-panel flex min-h-0 flex-col rounded-md p-2">
      <header className="mb-2 flex items-center gap-2">
        <span className="mk-label text-foreground">Audio</span>
        <button
          type="button"
          onClick={() => onAfv(!afv)}
          className={cn("mk-button ml-auto h-7 rounded-sm px-2 text-[10px]", afv && "mk-lit-amber")}
          title="Audio follows video: cam-named inputs unmute when their CAM is on air"
        >
          AFV {afv ? "ON" : "OFF"}
        </button>
      </header>
      {channels.length === 0 ? (
        <p className="mk-label py-4 text-center text-[10px]">No audio inputs</p>
      ) : (
        <div className="flex min-h-0 gap-2 overflow-x-auto pb-1">
          {channels.map((c) => {
            const level = c.muted ? -100 : (levels[c.name] ?? -100);
            const cam = camOf(c.name);
            return (
              <div key={c.name} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-sm bg-bezel/40 p-1">
                <span className="w-full truncate text-center text-[10px] font-semibold text-foreground" title={c.name}>
                  {c.name}
                </span>
                <span className="font-mono text-[9px] text-engrave">
                  {c.db <= -60 ? "-∞" : c.db.toFixed(1)} dB{cam !== null ? ` · C${cam + 1}` : ""}
                </span>
                <div className="flex h-28 items-stretch gap-1.5">
                  <Meter db={level} />
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    step={0.5}
                    value={c.db}
                    onChange={(e) => onVolume(c.name, Number(e.target.value))}
                    onDoubleClick={() => onVolume(c.name, 0)}
                    aria-label={`${c.name} volume`}
                    className="h-28 w-4 accent-foreground [writing-mode:vertical-lr] [direction:rtl]"
                  />
                  <div className="flex flex-col justify-between font-mono text-[7px] text-engrave">
                    {TICKS.map((t) => <span key={t}>{t}</span>)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onMute(c.name)}
                  aria-label={c.muted ? `Unmute ${c.name}` : `Mute ${c.name}`}
                  className={cn("mk-button flex h-8 w-full items-center justify-center rounded-sm", c.muted && "mk-lit-program")}
                >
                  {c.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
