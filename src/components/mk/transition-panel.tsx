import { TBar } from "@/components/mk/t-bar";
import { DSK_COUNT, RATE_BUTTONS, type DskTarget } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface TransitionPanelProps {
  dskActive: boolean[];
  dsks: DskTarget[];
  tBar: number;
  transitioning: boolean;
  transitionName: string;
  duration: number;
  transitions: string[];
  onTransition: (name: string) => void;
  onDuration: (ms: number) => void;
  onDsk: (index: number) => void;
  onAutoTake: () => void;
  onCut: () => void;
  onTBarChange: (value: number) => void;
  onTBarRelease: (value: number) => void;
}

export function TransitionPanel({
  dskActive,
  dsks,
  tBar,
  transitioning,
  transitionName,
  duration,
  transitions,
  onTransition,
  onDuration,
  onDsk,
  onAutoTake,
  onCut,
  onTBarChange,
  onTBarRelease,
}: TransitionPanelProps) {
  return (
    <aside className="mk-panel flex w-full min-w-0 flex-1 flex-col gap-2 rounded-md p-2 sm:p-3">
      {/* DSK 1 + DSK 2 side by side */}
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: DSK_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              onDsk(i);
            }}
            className={cn(
              "mk-button flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-sm px-1 sm:h-16",
              dskActive[i] && "mk-lit-amber",
            )}
            aria-pressed={!!dskActive[i]}
          >
            <span className="flex items-baseline gap-1 text-sm leading-none">
              DSK {i + 1}
              <span className="font-mono text-[9px] opacity-80">{dskActive[i] ? "ON" : "OFF"}</span>
            </span>
            <span className="max-w-full truncate font-mono text-[9px] leading-none font-normal tracking-normal opacity-70">
              {dsks[i]?.source || "not set"}
            </span>
          </button>
        ))}
      </div>

      {/* Transition type + rate (speed) */}
      <div className="grid gap-1.5">
        <select
          value={transitionName}
          onChange={(e) => onTransition(e.target.value)}
          aria-label="Transition type"
          className="h-8 w-full min-w-0 rounded-sm border border-border bg-input px-1.5 font-mono text-[11px] text-foreground outline-none focus:border-ring"
        >
          {(transitions.length ? transitions : ["Cut", "Fade", "Fade to Color", "Swipe"]).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="Transition rate">
          {RATE_BUTTONS.map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => onDuration(ms)}
              className={cn(
                "mk-button h-8 min-w-0 rounded-sm px-0 font-mono text-[10px]",
                duration === ms && "mk-lit-amber",
              )}
            >
              {(ms / 1000).toFixed(1)}s
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onAutoTake();
        }}
        className={cn(
          "mk-button flex h-14 w-full min-w-0 flex-col items-center justify-center rounded-sm px-1 text-base sm:h-16",
          transitioning ? "mk-lit-amber" : "text-foreground",
        )}
      >
        AUTO TAKE
        <span className="max-w-full truncate font-mono text-[10px] font-normal tracking-normal opacity-80">
          {transitionName} · {duration}ms
        </span>
      </button>

      <div className="flex min-h-[9rem] flex-1 flex-col gap-1 sm:min-h-[12rem]">
        <span className="mk-label text-center">T-Bar</span>
        <TBar value={tBar} onChange={onTBarChange} onRelease={onTBarRelease} />
      </div>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onCut();
        }}
        className="mk-button h-14 w-full rounded-sm text-lg text-foreground hover:mk-lit-program active:mk-lit-program sm:h-16"
      >
        CUT
      </button>
    </aside>
  );
}
