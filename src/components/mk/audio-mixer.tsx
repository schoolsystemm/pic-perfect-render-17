import { Headphones, Volume2, VolumeX } from "lucide-react";

import { Fader } from "@/components/mk/fader";
import { GrMeter, Meter, MeterScale } from "@/components/mk/meter";
import { dbToPos, FADER_TICKS, fmtDb, powerSum } from "@/lib/mk/audio-math";
import { LIMITER_MAX, LIMITER_MIN, type AudioChannel, type LimiterConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface AudioMixerProps {
  channels: AudioChannel[];
  levels: Record<string, number>;
  afv: boolean;
  limiter: LimiterConfig;
  /** Gain reduction reported by the backend, or null when it has to be estimated. */
  gr: number | null;
  masterMuted: boolean;
  camOf: (name: string) => number | null;
  onVolume: (name: string, db: number) => void;
  onMute: (name: string) => void;
  onMonitor: (name: string) => void;
  onStream: (name: string) => void;
  onPre: (name: string) => void;
  onHearFinal: (on: boolean) => void;
  onAfv: (on: boolean) => void;
  onLimiter: (patch: Partial<LimiterConfig>) => void;
  onMuteOut: () => void;
}

/** Small keycap used for MN / PRE / PC. */
function Key({
  label,
  on,
  tone,
  title,
  onClick,
}: {
  label: string;
  on: boolean;
  tone: "program" | "preview" | "amber";
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`${label}: ${on ? "on" : "off"}`}
      aria-pressed={on}
      className={cn(
        "mk-button h-[18px] min-w-0 flex-1 rounded-[3px] px-0 text-[8px] tracking-normal",
        on && (tone === "program" ? "mk-lit-program" : tone === "preview" ? "mk-lit-preview" : "mk-lit-amber"),
      )}
    >
      {label}
    </button>
  );
}

function FaderScale() {
  return (
    <div className="relative h-full w-4 font-mono text-[7px] leading-none text-engrave">
      {FADER_TICKS.map((t) => (
        <span key={t} className="absolute left-0 -translate-y-1/2" style={{ top: `calc(8px + (100% - 16px) * ${1 - dbToPos(t)})` }}>
          {t}
        </span>
      ))}
      <span className="absolute bottom-[2px] left-0">∞</span>
    </div>
  );
}

/** Every audio input is the same kind of strip — mic, desktop, browser, sounds. */
function Strip({
  channel: c,
  level,
  cam,
  props,
}: {
  channel: AudioChannel;
  level: number;
  cam: number | null;
  props: AudioMixerProps;
}) {
  return (
    <div className="flex w-[4.6rem] shrink-0 flex-col items-center gap-1 rounded-[4px] border border-white/5 bg-black/20 px-1 py-1">
      <span className="w-full truncate text-center text-[10px] leading-none font-bold text-foreground" title={c.name}>
        {c.name}
      </span>
      <span className="font-mono text-[8px] leading-none text-engrave">
        {fmtDb(c.db)}
        {cam !== null ? ` C${cam + 1}` : ""}
      </span>

      <div className="flex min-h-0 flex-1 items-stretch gap-1">
        <Meter db={c.muted ? -100 : level} />
        <Fader db={c.db} onChange={(db) => props.onVolume(c.name, db)} label={`${c.name} volume`} />
        <FaderScale />
      </div>

      <button
        type="button"
        onClick={() => props.onMute(c.name)}
        aria-label={c.muted ? `Unmute ${c.name}` : `Mute ${c.name}`}
        aria-pressed={c.muted}
        className={cn("mk-button flex h-[22px] w-full items-center justify-center rounded-[3px]", c.muted && "mk-lit-program")}
      >
        {c.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>

      <div className="flex w-full gap-[3px]">
        <Key label="MN" on={c.stream} tone="program" title="On the FINAL mix (YouTube + recording)" onClick={() => props.onStream(c.name)} />
        <Key label="PRE" on={c.pre} tone="preview" title="In the pre-listen mix (the Listen button)" onClick={() => props.onPre(c.name)} />
        <Key label="PC" on={c.monitor !== "none"} tone="amber" title="Also on the OBS PC's own headphones" onClick={() => props.onMonitor(c.name)} />
      </div>
    </div>
  );
}

/** The final output: everything routed to MN, with the limiter. */
function Master(props: AudioMixerProps) {
  const { channels, levels, limiter, masterMuted } = props;
  const onMain = channels.filter((c) => c.stream);
  const live = onMain.filter((c) => !c.muted);
  const mix = powerSum(live.map((c) => levels[c.name] ?? -100));
  const level = masterMuted ? -100 : mix;
  const hearFinal = onMain.length > 0 && onMain.every((c) => c.pre);

  // OBS cannot report gain reduction, so estimate it from how close the mix is to the ceiling.
  const engaged = limiter.on && !masterMuted && mix >= limiter.threshold - 0.6;
  const gr = !limiter.on ? 0 : (props.gr ?? (engaged ? 2.5 : 0));
  const limiting = limiter.on && gr > 0.1;

  return (
    <div className="flex w-[8.6rem] shrink-0 flex-col gap-1 rounded-[4px] border border-program/50 bg-program-dim/25 px-1.5 py-1 shadow-[inset_0_0_14px_oklch(0.4_0.15_26/25%)]">
      <div className="flex items-baseline justify-between leading-none">
        <span className="text-[10px] font-bold tracking-[0.2em] text-program">MASTER</span>
        <span className="font-mono text-[8px] text-engrave">{live.length} in</span>
      </div>

      <div className="flex min-h-0 flex-1 justify-center gap-1.5">
        <Meter db={level} wide />
        <Meter db={level - 0.7} wide />
        <MeterScale />
        <div className="flex flex-col items-center gap-0.5" title="Limiter gain reduction">
          <div className="min-h-0 flex-1">
            <GrMeter gr={gr} />
          </div>
          <span className="font-mono text-[7px] leading-none text-amber">GR</span>
        </div>
      </div>

      <button
        type="button"
        onClick={props.onMuteOut}
        aria-pressed={masterMuted}
        title="Silence the whole final mix. Press again to bring back exactly what was live."
        className={cn("mk-button flex h-6 w-full items-center justify-center gap-1 rounded-[3px] text-[9px]", masterMuted && "mk-lit-program")}
      >
        {masterMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        MUTE OUT
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => props.onLimiter({ on: !limiter.on })}
          aria-pressed={limiter.on}
          title={`Limiter: a brick-wall ceiling at ${limiter.threshold} dB on every input of the final mix`}
          className={cn("mk-button flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-1.5 text-[9px]", limiter.on && (limiting ? "mk-lit-amber" : "mk-lit-preview"))}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", limiting ? "bg-program shadow-[0_0_6px_var(--color-program)]" : "bg-current opacity-60")} />
          LIM
        </button>
        <input
          type="range"
          className="mk-range min-w-0 flex-1"
          min={LIMITER_MIN}
          max={LIMITER_MAX}
          step={0.5}
          value={limiter.threshold}
          onChange={(e) => props.onLimiter({ threshold: Number(e.target.value) })}
          onDoubleClick={() => props.onLimiter({ threshold: -6 })}
          aria-label="Limiter ceiling"
          title="Limiter ceiling (double-click = -6 dB)"
        />
        <span className="w-6 shrink-0 text-right font-mono text-[9px] text-amber">{limiter.threshold}</span>
      </div>

      <button
        type="button"
        onClick={() => props.onHearFinal(!hearFinal)}
        aria-pressed={hearFinal}
        title="Put every MN input in the pre-listen mix too, so Listen plays the whole final mix"
        className={cn("mk-button flex h-6 w-full items-center justify-center gap-1 rounded-[3px] text-[9px]", hearFinal && "mk-lit-preview")}
      >
        <Headphones className="h-3 w-3" />
        HEAR
      </button>
    </div>
  );
}

export function AudioMixer(props: AudioMixerProps) {
  const { channels, levels, afv, camOf, onAfv } = props;
  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col rounded-md p-1.5">
      <header className="mb-1 flex items-center gap-2">
        <span className="mk-label text-foreground">Audio</span>
        <span className="mk-label hidden truncate text-[8px] xl:block">MN = final out · PRE = pre-listen · PC = OBS PC headphones</span>
        <button
          type="button"
          onClick={() => onAfv(!afv)}
          className={cn("mk-button ml-auto h-[18px] rounded-[3px] px-2 text-[9px]", afv && "mk-lit-amber")}
          title="Audio follows video: cam-named inputs unmute when their CAM is on air"
        >
          AFV {afv ? "ON" : "OFF"}
        </button>
      </header>
      {channels.length === 0 ? (
        <p className="mk-label py-4 text-center text-[10px]">No audio inputs</p>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch gap-1.5">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden">
            {channels.map((c) => (
              <Strip key={c.name} channel={c} level={levels[c.name] ?? -100} cam={camOf(c.name)} props={props} />
            ))}
          </div>
          <Master {...props} />
        </div>
      )}
    </section>
  );
}

