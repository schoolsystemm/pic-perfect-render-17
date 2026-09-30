import { Headphones, Monitor, Radio, Volume2, VolumeX } from "lucide-react";

import { FADER_MAX, FADER_MIN, type AudioChannel } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const TICKS = [6, 0, -12, -24, -36, -60];
const RANGE = FADER_MAX - FADER_MIN;
const pct = (db: number) => Math.max(0, Math.min(100, ((db - FADER_MIN) / RANGE) * 100));
const fmt = (db: number) => (db <= FADER_MIN ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`);

/** Power-sum of the peaks of several inputs = rough level of the mix they make. */
function mixLevel(channels: AudioChannel[], levels: Record<string, number>, pick: (c: AudioChannel) => boolean) {
  let sum = 0;
  for (const c of channels) {
    if (c.muted || !pick(c)) continue;
    const db = levels[c.name] ?? -100;
    if (db > -99) sum += 10 ** (db / 10);
  }
  return sum > 0 ? 10 * Math.log10(sum) : -100;
}

interface AudioMixerProps {
  channels: AudioChannel[];
  levels: Record<string, number>;
  afv: boolean;
  camOf: (name: string) => number | null;
  onVolume: (name: string, db: number) => void;
  onMute: (name: string) => void;
  onMonitor: (name: string) => void;
  onStream: (name: string) => void;
  onPre: (name: string) => void;
  onHearFinal: (on: boolean) => void;
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

/** Every audio input is the same kind of strip — mic, desktop, browser, sounds. */
function Strip({
  channel: c,
  level,
  cam,
  onVolume,
  onMute,
  onMonitor,
  onStream,
  onPre,
}: {
  channel: AudioChannel;
  level: number;
  cam: number | null;
  onVolume: AudioMixerProps["onVolume"];
  onMute: AudioMixerProps["onMute"];
  onMonitor: AudioMixerProps["onMonitor"];
  onStream: AudioMixerProps["onStream"];
  onPre: AudioMixerProps["onPre"];
}) {
  return (
    <div className="flex w-[5rem] shrink-0 flex-col items-center gap-1 rounded-sm bg-bezel/40 p-1 [&>*]:shrink-0">
      <span className="w-full truncate text-center text-[10px] font-bold text-foreground" title={c.name}>
        {c.name}
      </span>
      <span className="font-mono text-[9px] text-engrave">
        {fmt(c.db)} dB{cam !== null ? ` · C${cam + 1}` : ""}
      </span>

      <div className="flex h-28 shrink-0 items-stretch gap-1.5">
        <Meter db={c.muted ? -100 : level} />
        <input
          type="range"
          min={FADER_MIN}
          max={FADER_MAX}
          step={0.5}
          value={c.db}
          onChange={(e) => onVolume(c.name, Number(e.target.value))}
          onDoubleClick={() => onVolume(c.name, 0)}
          aria-label={`${c.name} volume`}
          className="h-28 w-4 accent-foreground [direction:rtl] [writing-mode:vertical-lr]"
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
          onClick={() => onStream(c.name)}
          title={c.stream ? "On the FINAL mix (YouTube + recording) — tap to remove" : "Not on the final mix — tap to add"}
          aria-label={`${c.name} to main output: ${c.stream ? "on" : "off"}`}
          aria-pressed={c.stream}
          className={cn(
            "mk-button flex h-7 min-w-0 items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
            c.stream && "mk-lit-program",
          )}
        >
          <Radio className="h-3 w-3 shrink-0" />
          <span>MAIN</span>
        </button>
        <button
          type="button"
          onClick={() => onPre(c.name)}
          title={c.pre ? "In the pre-listen mix (Listen button) — tap to remove" : "Not in pre-listen — tap to add"}
          aria-label={`${c.name} pre-listen: ${c.pre ? "on" : "off"}`}
          aria-pressed={c.pre}
          className={cn(
            "mk-button flex h-7 min-w-0 items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
            c.pre && "mk-lit-preview",
          )}
        >
          <Headphones className="h-3 w-3 shrink-0" />
          <span>PRE</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => onMonitor(c.name)}
        title="Also hear it on the OBS PC's own headphones / monitoring device"
        aria-label={`${c.name} on OBS PC headphones: ${c.monitor !== "none" ? "on" : "off"}`}
        aria-pressed={c.monitor !== "none"}
        className={cn(
          "mk-button flex h-6 w-full items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
          c.monitor !== "none" && "mk-lit-amber",
        )}
      >
        <Monitor className="h-3 w-3 shrink-0" />
        <span>PC</span>
      </button>
    </div>
  );
}

/** The final output: everything routed to MAIN. Level only — OBS has no master fader. */
function Master({
  level,
  preLevel,
  count,
  hearFinal,
  onHearFinal,
}: {
  level: number;
  preLevel: number;
  count: number;
  hearFinal: boolean;
  onHearFinal: (on: boolean) => void;
}) {
  return (
    <div className="flex w-[5.5rem] shrink-0 flex-col items-center gap-1 rounded-sm border border-program/60 bg-program-dim/30 p-1 [&>*]:shrink-0">
      <span className="w-full truncate text-center text-[10px] font-bold tracking-[0.2em] text-program">MASTER</span>
      <span className="-mt-1 w-full text-center font-mono text-[8px] leading-tight text-engrave">
        FINAL OUT
        <br />
        YouTube · Record
      </span>
      <span className="font-mono text-[9px] text-engrave">
        {count} input{count === 1 ? "" : "s"}
      </span>
      <div className="flex h-28 shrink-0 items-stretch gap-1.5">
        <Meter db={level} wide />
        <Meter db={level - 0.7} wide />
        <div className="flex flex-col justify-between font-mono text-[7px] text-engrave">
          {TICKS.map((t) => (
            <span key={t}>{t === FADER_MIN ? "∞" : t}</span>
          ))}
        </div>
      </div>
      <div className="flex w-full items-center gap-1 font-mono text-[8px] text-engrave">
        <span>PRE</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-[1px] bg-bezel">
          <div className="h-full bg-preview" style={{ width: `${pct(preLevel)}%` }} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onHearFinal(!hearFinal)}
        aria-pressed={hearFinal}
        title="Put every MAIN input in the pre-listen mix too, so Listen plays the whole final mix"
        className={cn(
          "mk-button flex h-8 w-full items-center justify-center gap-0.5 rounded-sm px-0 text-[9px]",
          hearFinal && "mk-lit-preview",
        )}
      >
        <Headphones className="h-3 w-3 shrink-0" />
        <span>HEAR FINAL</span>
      </button>
    </div>
  );
}

export function AudioMixer(props: AudioMixerProps) {
  const { channels, levels, afv, camOf, onAfv } = props;
  const levelOf = (c: AudioChannel) => levels[c.name] ?? -100;
  const finalLevel = mixLevel(channels, levels, (c) => c.stream);
  const preLevel = mixLevel(channels, levels, (c) => c.pre);
  const onMain = channels.filter((c) => c.stream);
  const hearFinal = onMain.length > 0 && onMain.every((c) => c.pre);

  return (
    <section className="mk-panel flex shrink-0 flex-col rounded-md p-2">
      <header className="mb-2 flex items-center gap-2">
        <span className="mk-label text-foreground">Audio</span>
        <span className="mk-label hidden text-[9px] sm:block">MAIN = final out (YouTube / record) · PRE = pre-listen · PC = OBS PC headphones</span>
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
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden pb-1">
            {channels.map((c) => (
              <Strip
                key={c.name}
                channel={c}
                level={levelOf(c)}
                cam={camOf(c.name)}
                onVolume={props.onVolume}
                onMute={props.onMute}
                onMonitor={props.onMonitor}
                onStream={props.onStream}
                onPre={props.onPre}
              />
            ))}
          </div>
          <Master
            level={finalLevel}
            preLevel={preLevel}
            count={onMain.filter((c) => !c.muted).length}
            hearFinal={hearFinal}
            onHearFinal={props.onHearFinal}
          />
        </div>
      )}
    </section>
  );
}
