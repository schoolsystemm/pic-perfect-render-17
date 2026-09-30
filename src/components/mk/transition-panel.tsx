import { TBar } from "@/components/mk/t-bar";
import { cn } from "@/lib/utils";

interface TransitionPanelProps {
  dskActive: boolean;
  tBar: number;
  transitionName: string;
  duration: number;
  onDsk: () => void;
  onAutoTake: () => void;
  onCut: () => void;
  onTBarChange: (value: number) => void;
  onTBarRelease: (value: number) => void;
}

export function TransitionPanel({
  dskActive,
  tBar,
  transitionName,
  duration,
  onDsk,
  onAutoTake,
  onCut,
  onTBarChange,
  onTBarRelease,
}: TransitionPanelProps) {
  return (
    <aside className="mk-panel flex w-full flex-1 flex-col gap-2 rounded-md p-2 sm:w-[13.5rem] phone-land:w-full sm:gap-2.5 sm:p-3">
      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onDsk();
        }}
        className={cn(
          "mk-button h-12 rounded-sm text-base sm:h-14",
          dskActive && "mk-lit-amber",
        )}
      >
        DSK
        <span className="ml-2 font-mono text-[10px] opacity-75">{dskActive ? "ON" : "OFF"}</span>
      </button>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onAutoTake();
        }}
        className="mk-button flex h-14 flex-col items-center justify-center rounded-sm text-base text-foreground sm:h-16"
      >
        AUTO TAKE
        <span className="font-mono text-[10px] font-normal tracking-normal text-engrave">
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
        className="mk-button h-14 rounded-sm text-lg text-foreground hover:mk-lit-program sm:h-16"
      >
        CUT
      </button>
    </aside>
  );
}
