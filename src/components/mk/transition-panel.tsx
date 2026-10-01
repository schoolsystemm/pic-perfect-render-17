import { TBar } from "@/components/mk/t-bar";
import { PIP_CORNERS, PIP_GLYPH, PIP_SIZES, SQUEEZE_DIRS, SQUEEZE_GLYPH, type FxConfig, type FxLayoutKind } from "@/lib/mk/fx";
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
  fx: { running: boolean; layout: FxLayoutKind | null };
  fxConfig: FxConfig;
  onSqueeze: () => void;
  onLayout: (kind: FxLayoutKind) => void;
  onFxOption: (patch: Partial<FxConfig>) => void;
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
  fx,
  fxConfig,
  onSqueeze,
  onLayout,
  onFxOption,
  onTransition,
  onDuration,
  onDsk,
  onAutoTake,
  onCut,
  onTBarChange,
  onTBarRelease,
}: TransitionPanelProps) {
  return (
    <aside className="mk-panel flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1.5 rounded-md p-1.5">
      {/* DSK 1 + DSK 2 side by side */}
      <div className="grid grid-cols-2 gap-1">
        {Array.from({ length: DSK_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              onDsk(i);
            }}
            className={cn(
              "mk-button flex h-9 min-w-0 flex-col items-center justify-center gap-[3px] rounded-[3px] px-1",
              dskActive[i] && "mk-lit-amber",
            )}
            aria-pressed={!!dskActive[i]}
          >
            <span className="flex items-baseline gap-1 text-[13px] leading-none">
              DSK {i + 1}
              <span className="font-mono text-[8px] opacity-80">{dskActive[i] ? "ON" : "OFF"}</span>
            </span>
            <span className="max-w-full truncate font-mono text-[7px] leading-none font-normal tracking-normal opacity-70">
              {dsks[i]?.source || "not set"}
            </span>
          </button>
        ))}
      </div>

      {/* Transition type + rate (speed) */}
      <div className="grid gap-1">
        <select
          value={transitionName}
          onChange={(e) => onTransition(e.target.value)}
          aria-label="Transition type"
          className="mk-field h-7 w-full min-w-0 rounded-[3px] px-1.5 text-[11px]"
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
                "mk-button h-6 min-w-0 rounded-[3px] px-0 font-mono text-[9px]",
                duration === ms && "mk-lit-amber",
              )}
            >
              {(ms / 1000).toFixed(1)}S
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
          "mk-button flex h-10 w-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-[3px] px-1 text-sm",
          transitioning ? "mk-lit-amber" : "text-foreground",
        )}
      >
        AUTO TAKE
        <span className="max-w-full truncate font-mono text-[8px] font-normal tracking-normal uppercase opacity-80">
          {transitionName} · {duration}ms
        </span>
      </button>

      {/* Picture effects: Squeeze (a take), PiP and Merge (held until tapped again) */}
      <div className="grid gap-1" role="group" aria-label="Picture effects">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={fx.running || !!fx.layout}
            onPointerDown={(event) => {
              event.preventDefault();
              onSqueeze();
            }}
            title="Squeeze the PGM picture away and squeeze PVW in (ends with PVW on air)"
            className={cn("mk-button h-7 min-w-0 rounded-[3px] px-0 text-[9px]", fx.running && !fx.layout && "mk-lit-amber")}
          >
            SQUEEZE
          </button>
          {(["pip", "merge"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={fx.running || (!!fx.layout && fx.layout !== kind)}
              onPointerDown={(event) => {
                event.preventDefault();
                onLayout(kind);
              }}
              title={kind === "pip" ? "PVW cam as a picture-in-picture over PGM. Tap again to remove." : "Split screen: PGM left, PVW right. Tap again to remove."}
              className={cn("mk-button h-7 min-w-0 rounded-[3px] px-0 text-[9px]", fx.layout === kind && "mk-lit-program")}
            >
              {kind === "pip" ? "PIP" : "MERGE"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            title="Squeeze direction"
            className="mk-button h-5 min-w-0 rounded-[3px] px-0 font-mono text-[9px]"
            onClick={() => onFxOption({ squeezeDir: SQUEEZE_DIRS[(SQUEEZE_DIRS.indexOf(fxConfig.squeezeDir) + 1) % SQUEEZE_DIRS.length]! })}
          >
            SQZ {SQUEEZE_GLYPH[fxConfig.squeezeDir]}
          </button>
          <button
            type="button"
            title="PiP corner"
            className="mk-button h-5 min-w-0 rounded-[3px] px-0 font-mono text-[9px]"
            onClick={() => onFxOption({ pipCorner: PIP_CORNERS[(PIP_CORNERS.indexOf(fxConfig.pipCorner) + 1) % PIP_CORNERS.length]! })}
          >
            PIP {PIP_GLYPH[fxConfig.pipCorner]}
          </button>
          <button
            type="button"
            title="PiP size"
            className="mk-button h-5 min-w-0 rounded-[3px] px-0 font-mono text-[9px]"
            onClick={() => {
              const i = PIP_SIZES.findIndex((v) => Math.abs(v - fxConfig.pipSize) < 0.01);
              onFxOption({ pipSize: PIP_SIZES[(i + 1) % PIP_SIZES.length]! });
            }}
          >
            PIP {Math.round(fxConfig.pipSize * 100)}%
          </button>
        </div>
      </div>

      <div className="flex min-h-[7rem] flex-1 flex-col gap-1 fit:min-h-0">
        <span className="mk-label text-center text-[9px]">T-Bar</span>
        <TBar value={tBar} onChange={onTBarChange} onRelease={onTBarRelease} />
      </div>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onCut();
        }}
        className="mk-button h-10 w-full rounded-[3px] text-base text-foreground active:mk-lit-program"
      >
        CUT
      </button>
    </aside>
  );
}
