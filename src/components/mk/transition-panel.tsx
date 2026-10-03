import { MergeEditor } from "@/components/mk/merge-editor";
import { SqueezeMergeEditor } from "@/components/mk/squeeze-merge-editor";
import { TBar } from "@/components/mk/t-bar";
import { SQUEEZE_DIRS, SQUEEZE_GLYPH, type AdPreset, type FxConfig, type FxLayoutKind, type SqueezeDir } from "@/lib/mk/fx";
import { mergeLayoutById, type MergePreset } from "@/lib/mk/merge";
import { DSK_COUNT, RATE_BUTTONS, type DskTarget, type LiveState } from "@/lib/mk/types";
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
  live: LiveState;
  pipScenes: (string | null)[];
  adScene: string | null;
  /** Name of the selected Squeeze Merge preset. */
  adName?: string | undefined;
  /** Split-screen Merge looks (2..6 panes + borders) and the one the MERGE button plays. */
  mergePresets: MergePreset[];
  mergeActive: number;
  /** Squeeze Merge looks and the one the SQZ MERGE button plays (for the SQZ MERGE SETUP editor). */
  adPresets: AdPreset[];
  adActive: number;
  onPip: (slot: number) => void;
  onSqueezeMerge: () => void;
  onMove: (dir: SqueezeDir) => void;
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
  live,
  pipScenes,
  adScene,
  adName,
  mergePresets,
  mergeActive,
  adPresets,
  adActive,
  onPip,
  onSqueezeMerge,
  onMove,
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

      {/* Picture effects: Squeeze (a take) and Merge (split screen, held until tapped again). PiP = PIP 1 / PIP 2 below. */}
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Picture effects">
        <button
          type="button"
          disabled={fx.running || !!fx.layout || live.merge}
          onPointerDown={(event) => {
            event.preventDefault();
            onSqueeze();
          }}
          title="Squeeze the PGM picture away and squeeze PVW in (ends with PVW on air)"
          className={cn("mk-button h-7 min-w-0 rounded-[3px] px-0 text-[9px]", fx.running && !fx.layout && "mk-lit-amber")}
        >
          SQUEEZE
        </button>
        <button
          type="button"
          disabled={fx.running}
          aria-pressed={live.merge}
          onPointerDown={(event) => {
            event.preventDefault();
            onLayout("merge");
          }}
          title="Split screen with borders (2 to 6 panes). Tap again to remove. PIP, DSK and Squeeze Merge keep working on top."
          className={cn("mk-button flex h-7 min-w-0 flex-col items-center justify-center gap-[2px] rounded-[3px] px-0 text-[9px]", live.merge && "mk-lit-program")}
        >
          MERGE
          <span className="max-w-full truncate font-mono text-[6px] font-normal opacity-70">
            {mergePresets[mergeActive]?.name ?? "split"} · {mergeLayoutById(mergePresets[mergeActive]?.merge.layout ?? "2c").panes}
          </span>
        </button>
        <button
          type="button"
          title="Squeeze direction"
          className="mk-button h-7 min-w-0 rounded-[3px] px-0 font-mono text-[9px]"
          onClick={() => onFxOption({ squeezeDir: SQUEEZE_DIRS[(SQUEEZE_DIRS.indexOf(fxConfig.squeezeDir) + 1) % SQUEEZE_DIRS.length]! })}
        >
          SQZ {SQUEEZE_GLYPH[fxConfig.squeezeDir]}
        </button>
      </div>

      {/* Live compositor: persistent PIP 1 / PIP 2 and Squeeze Merge (real OBS scene items, kept through every take) */}
      <div className="grid gap-1" role="group" aria-label="Live overlays">
        <div className="grid grid-cols-3 gap-1">
          {[0, 1].map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={fx.running}
              onPointerDown={(event) => {
                event.preventDefault();
                onPip(slot);
              }}
              title={pipScenes[slot] ? `PIP ${slot + 1}: ${pipScenes[slot]} — stays assigned until you change it` : `PIP ${slot + 1}: assign a scene in Graphics Studio → Live FX & Tags`}
              aria-pressed={!!live.pip[slot]}
              className={cn("mk-button flex h-8 min-w-0 flex-col items-center justify-center gap-[2px] rounded-[3px] px-0 text-[9px]", live.pip[slot] && "mk-lit-program")}
            >
              PIP {slot + 1}
              <span className="max-w-full truncate font-mono text-[6px] font-normal opacity-70">{pipScenes[slot] ?? "no scene"}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={fx.running}
            onPointerDown={(event) => {
              event.preventDefault();
              onSqueezeMerge();
            }}
            title="Squeeze the program and slide the advertisement in (tap again to return)"
            aria-pressed={live.sqm}
            className={cn("mk-button flex h-8 min-w-0 flex-col items-center justify-center gap-[2px] rounded-[3px] px-0 text-[9px]", live.sqm && "mk-lit-program", fx.running && "mk-lit-amber")}
          >
            SQZ MERGE
            <span className="max-w-full truncate font-mono text-[6px] font-normal opacity-70">{adName ?? adScene ?? "no ad"}</span>
          </button>
        </div>
        {/* Merge + Squeeze Merge setup: each opens its own editor (layout, borders, cams, motion, presets). */}
        <div className="grid grid-cols-2 gap-1">
          <MergeEditor presets={mergePresets} active={mergeActive} merging={live.merge} busy={fx.running} />
          <SqueezeMergeEditor presets={adPresets} adActive={adActive} sqmOn={live.sqm} busy={fx.running} />
        </div>
        <div className="grid grid-cols-5 items-center gap-1">
          <span className="mk-label text-center text-[8px]">MOVE</span>
          {(["l", "u", "d", "r"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              disabled={fx.running}
              title={`Move transition: picture pushes ${{ l: "left", r: "right", u: "up", d: "down" }[dir]}`}
              onPointerDown={(event) => {
                event.preventDefault();
                onMove(dir);
              }}
              className="mk-button h-5 min-w-0 rounded-[3px] px-0 font-mono text-[10px]"
            >
              {SQUEEZE_GLYPH[dir]}
            </button>
          ))}
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
