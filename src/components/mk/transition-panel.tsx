import { TBar } from "@/components/mk/t-bar";
import { DSK_COUNT, type DskTarget } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface TransitionPanelProps {
  dskActive: boolean[];
  dsks: DskTarget[];
  tBar: number;
  transitioning: boolean;
  transitionName: string;
  duration: number;
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
