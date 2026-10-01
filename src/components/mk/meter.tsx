import { METER_TICKS, meterPos, useBallistics } from "@/lib/mk/audio-math";
import { cn } from "@/lib/utils";

// Lamp colours by level: green to -18, amber to -6, red above (the same zones as OBS).
const LAMPS =
  "linear-gradient(0deg, var(--color-preview) 0 70%, var(--color-amber) 70% 90%, var(--color-program) 90% 100%)";

/** Segmented LED level meter with peak hold. */
export function Meter({ db, wide = false }: { db: number; wide?: boolean }) {
  const { level, peak } = useBallistics(db);
  const top = (1 - meterPos(level)) * 100;
  const peakPos = meterPos(peak) * 100;
  const clip = peak >= -0.5;
  return (
    <div className={cn("relative h-full overflow-hidden rounded-[2px] bg-black/60 shadow-[inset_0_1px_3px_black]", wide ? "w-3" : "w-2")}>
      <div className="mk-segments absolute inset-0 opacity-[0.16]" style={{ background: LAMPS }} />
      <div
        className="mk-segments absolute inset-0"
        style={{ background: LAMPS, clipPath: `inset(${top}% 0 0 0)` }}
      />
      {peak > -59 && (
        <div
          className={cn("absolute inset-x-0 h-[2px]", clip ? "bg-program" : "bg-foreground/90")}
          style={{ bottom: `calc(${peakPos}% - 1px)` }}
        />
      )}
      {clip && <div className="absolute inset-x-0 top-0 h-[3px] bg-program shadow-[0_0_6px_var(--color-program)]" />}
    </div>
  );
}

/** Limiter gain-reduction meter: grows downward from the top, amber. 0..12 dB. */
export function GrMeter({ gr }: { gr: number }) {
  const { level } = useBallistics(gr, { fall: 40, hold: 0, peakFall: 40 });
  const v = Math.max(0, Math.min(12, level));
  return (
    <div className="relative h-full w-2 overflow-hidden rounded-[2px] bg-black/60 shadow-[inset_0_1px_3px_black]">
      <div className="mk-segments absolute inset-0 bg-amber opacity-[0.16]" />
      <div className="mk-segments absolute inset-x-0 top-0 bg-amber" style={{ height: `${(v / 12) * 100}%` }} />
    </div>
  );
}

/** dB scale printed beside a meter, aligned to the same positions. */
export function MeterScale({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-full w-5 shrink-0 font-mono text-[7px] leading-none text-engrave", className)}>
      {METER_TICKS.map((t) => (
        <span key={t} className="absolute left-0 -translate-y-1/2" style={{ top: `${(1 - meterPos(t)) * 100}%` }}>
          {t}
        </span>
      ))}
    </div>
  );
}
