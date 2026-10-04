import { Knob } from "@/components/mk/knob";
import { EQ_RANGE, FLAT_EQ, type AudioChannel, type EqValues, type MonitorState } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

export interface MonitorSectionProps {
  channels: AudioChannel[];
  monitor: MonitorState;
  onMode: (mode: "main" | "solo") => void;
  onSelect: (name: string) => void;
  onEq: (name: string, patch: Partial<EqValues>) => void;
  onTake: (name: string) => void;
  onTakeAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

const KNOBS: { key: keyof EqValues; label: string }[] = [
  { key: "gain", label: "GAIN" },
  { key: "hi", label: "HIGH" },
  { key: "mid", label: "MID" },
  { key: "lo", label: "LOW" },
];

/**
 * Console-style monitor section.
 *   MAIN (red)  - your headphones follow the final mix, like the audience.
 *   SOLO (green) - arm the SOLO keys on the strips, pick what you want to hear alone, adjust it (amber = staged,
 *                  heard only here), then TAKE sends it to OBS. MAIN returns to normal.
 */
export function MonitorSection(props: MonitorSectionProps) {
  const { channels, monitor: m } = props;
  const solo = m.mode === "solo";
  const sel = m.select ? channels.find((c) => c.name === m.select) : undefined;
  const live = sel?.eq ?? FLAT_EQ;
  const staged = sel ? m.staged[sel.name] : undefined;
  const shown = staged ?? live;
  const pending = Object.keys(m.staged).length;

  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col gap-1.5 rounded-md p-1.5">
      <header className="flex items-center gap-1">
        <span className="mk-label text-foreground">Monitor</span>
        <button
          type="button"
          onClick={() => props.onMode("main")}
          aria-pressed={!solo}
          title="Headphones follow the final mix. Drops any change you did not TAKE."
          className={cn("mk-button ml-auto h-[18px] rounded-[3px] px-2 text-[9px]", !solo && "mk-lit-program")}
        >
          MAIN
        </button>
        <button
          type="button"
          onClick={() => props.onMode(solo ? "main" : "solo")}
          aria-pressed={solo}
          title="Arm the SOLO keys: pick what you hear alone. Nothing changes on air."
          className={cn("mk-button h-[18px] rounded-[3px] px-2 text-[9px]", solo && "mk-lit-preview")}
        >
          SOLO
        </button>
      </header>

      <div className="flex min-h-[18px] flex-wrap items-center gap-1">
        {m.solo.length === 0 ? (
          <span className="mk-label text-[8px]">{solo ? "Press SOLO on a strip" : "Headphones follow the final mix"}</span>
        ) : (
          m.solo.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => props.onSelect(n)}
              aria-pressed={n === m.select}
              title={`Adjust ${n}`}
              className={cn("mk-button h-[16px] max-w-[6rem] truncate rounded-[3px] px-1.5 text-[8px]", n === m.select && "mk-lit-preview", m.staged[n] && n !== m.select && "text-amber")}
            >
              {n}
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {KNOBS.map((k) => (
          <Knob
            key={k.key}
            label={k.label}
            value={shown[k.key]}
            min={EQ_RANGE[k.key][0]}
            max={EQ_RANGE[k.key][1]}
            staged={!!staged && staged[k.key] !== live[k.key]}
            disabled={!sel}
            onChange={(v) => sel && props.onEq(sel.name, { [k.key]: v })}
          />
        ))}
      </div>

      <div className="mt-auto grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => sel && props.onTake(sel.name)}
          title="Send this input's staged gain / EQ to OBS (on air)"
          className={cn("mk-button h-[20px] rounded-[3px] text-[9px]", staged ? "mk-lit-amber" : "opacity-40")}
        >
          TAKE
        </button>
        <button
          type="button"
          onClick={props.onTakeAll}
          title="TAKE every staged input"
          className={cn("mk-button h-[20px] rounded-[3px] px-0 text-[8px]", pending > 1 ? "mk-lit-amber" : "opacity-40")}
        >
          ALL
        </button>
        <button type="button" onClick={props.onCopy} title="Copy this input's gain / EQ" className={cn("mk-button h-[20px] rounded-[3px] text-[9px]", !sel && "opacity-40")}>
          COPY
        </button>
        <button
          type="button"
          onClick={props.onPaste}
          title="Paste the copied gain / EQ onto every soloed input (staged)"
          className={cn("mk-button h-[20px] rounded-[3px] px-0 text-[8px]", m.clip && solo && m.solo.length > 0 ? "mk-lit-preview" : "opacity-40")}
        >
          PASTE
        </button>
      </div>
    </section>
  );
}
