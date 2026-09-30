import { Headphones, Radio, Volume2, VolumeX } from "lucide-react";

import { FADER_MAX, FADER_MIN, type AudioChannel, type MonitorType } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const TICKS = [6, 0, -12, -24, -36, -60];
const RANGE = FADER_MAX - FADER_MIN;
const pct = (db: number) => Math.max(0, Math.min(100, ((db - FADER_MIN) / RANGE) * 100));
const fmt = (db: number) => (db <= FADER_MIN ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`);

const MON_LABEL: Record<MonitorType, string> = { none: "MON", monitorOnly: "MON", monitorAndOutput: "M+O" };
const MON_HINT: Record<MonitorType, string> = {
  none: "Monitoring off — tap to hear in headphones",
  monitorOnly: "Headphones only (not on stream) — tap for headphones + stream",
  monitorAndOutput: "Headphones + stream — tap to turn off",
};

interface AudioMixerProps {
  channels: AudioChannel[];
  mainAudio: string | null;
  levels: Record<string, number>;
  afv: boolean;
  camOf: (name: string) => number | null;
  onVolume: (name: string, db: number) => void;
  onMute: (name: string) => void;
  onMonitor: (name: string) => void;
  onStream: (name: string) => void;
  onAfv: (on: boolean) => void;
}

function Meter({ db, wide }: { db: number; wide?: boolean | undefined }) {
  const p = pct(db);
  const clip = db >= -0.5;
  return (
    <div className={cn("relative h-full overflow-hidden rounded-[1px] bg-bezel", wide ? "w-3" : "w-2.5")}>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 transition-[height] duration-75",
          p > 90 ? "bg-program" : p > 78 ? "bg-amber" : "bg-preview",
        )}
        style={{ height: `${p}%` }}
      />
      {clip && <div className="absolute inset-x-0 top-0 h-1 bg-program" />}
    </div>
  );
}

function Strip({
  channel,
  level,
  cam,
  main,
  onVolume,
  onMute,
  onMonitor,
  onStream,
}: {
  channel: AudioChannel;
  level: number;
  cam: number | null;
  main?: boolean;
  onVolume: AudioMixerProps["onVolume"];
  onMute: AudioMixerProps["onMute"];
  onMonitor: AudioMixerProps["onMonitor"];
  onStream: AudioMixerProps["onStream"];
}) {
  const c = channel;
  const monOn = c.monitor !== "none";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-1 rounded-sm p-1",
        main ? "w-[5.25rem] border border-program/60 bg-program-dim/30" : "w-[4.5rem] bg-bezel/40",
      )}
    >
      <span
        className={cn(
          "w-full truncate text-center text-[10px] font-bold",
          main ? "tracking-[0.2em] text-program" : "text-foreground",
        )}
        title={c.name}
      >
        {main ? "MAIN" : c.name}
      </span>
      {main && (
        <span className="-mt-1 w-full truncate text-center font-mono text-[8px] text-engrave" title={c.name}>
          {c.name}
        </span>
      )}
      <span className="font-mono text-[9px] text-engrave">
        {fmt(c.db)} dB{cam !== null ? ` · C${cam + 1}` : ""}
      </span>

      <div className="flex h-28 items-stretch gap-1.5">
        <Meter db={c.muted ? -100 : level} wide={main} />
        {main && <Meter db={c.muted ? -100 : level - 0.7} wide />}
        <input
          type="range"
          min={FADER_MIN}
          max={FADER_MAX}
          step={0.5}
          value={c.db}
          onChange={(e) => onVolume(c.name, Number(e.target.value))}
          onDoubleClick={() => onVolume(c.name, 0)}
          aria-label={`${c.name} volume`}
          className={cn("h-28 w-4 [writing-mode:vertical-lr] [direction:rtl]", main ? "accent-program" : "accent-foreground")}
        />
        <div className="flex flex-col justify-between font-mono text-[7px] text-engrave">
          {TICKS.map((t) => (
            <span key={t}>{t === FADER_MIN ? "∞" : t}</span>
          ))}
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

      <div className="grid w-full grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onMonitor(c.name)}
          title={MON_HINT[c.monitor]}
          aria-label={`${c.name} monitor: ${c.monitor}`}
          className={cn(
            "mk-button flex h-7 min-w-0 items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
            monOn && "mk-lit-preview",
          )}
        >
          <Headphones className="h-3 w-3 shrink-0" />
          <span>{MON_LABEL[c.monitor]}</span>
        </button>
        <button
          type="button"
          onClick={() => onStream(c.name)}
          title={c.stream ? "Going to stream / record — tap to remove" : "Not on stream — tap to add"}
          aria-label={`${c.name} to stream: ${c.stream ? "on" : "off"}`}
          className={cn(
            "mk-button flex h-7 min-w-0 items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
            c.stream && "mk-lit-program",
          )}
        >
          <Radio className="h-3 w-3 shrink-0" />
          <span>STR</span>
        </button>
      </div>
    </div>
  );
}

export function AudioMixer(props: AudioMixerProps) {
  const { channels, mainAudio, levels, afv, camOf, onAfv } = props;
  const main = channels.find((c) => c.name === mainAudio) ?? null;
  const inputs = channels.filter((c) => c.name !== mainAudio);
  const levelOf = (c: AudioChannel) => levels[c.name] ?? -100;

  return (
    <section className="mk-panel flex min-h-0 flex-col rounded-md p-2">
      <header className="mb-2 flex items-center gap-2">
        <span className="mk-label text-foreground">Audio</span>
        <span className="mk-label hidden text-[9px] sm:block">MON = headphones · STR = stream / record</span>
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
        <div className="flex min-h-0 gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {inputs.length === 0 && (
              <p className="mk-label self-center px-2 text-[10px]">No other inputs</p>
            )}
            {inputs.map((c) => (
              <Strip
                key={c.name}
                channel={c}
                level={levelOf(c)}
                cam={camOf(c.name)}
                onVolume={props.onVolume}
                onMute={props.onMute}
                onMonitor={props.onMonitor}
                onStream={props.onStream}
              />
            ))}
          </div>
          {!main && (
            <div className="flex w-[5.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-program/60 p-1 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-program">MAIN</span>
              <span className="font-mono text-[8px] leading-tight text-engrave">
                No Desktop Audio input found in OBS
              </span>
            </div>
          )}
          {main && (
            <Strip
              channel={main}
              level={levelOf(main)}
              cam={null}
              main
              onVolume={props.onVolume}
              onMute={props.onMute}
              onMonitor={props.onMonitor}
              onStream={props.onStream}
            />
          )}
        </div>
      )}
    </section>
  );
}
