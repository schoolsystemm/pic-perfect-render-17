import { useEffect, useState } from "react";

import { useClock } from "@/components/mk/use-clock";
import { DemoGraphics } from "@/components/mk/demo-graphics";
import { camLabel, type CamIndex, type GfxId, type GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface MultiviewProps {
  program: CamIndex | null;
  preview: CamIndex | null;
  programScene: string | null;
  /** Scene to film for the program monitor when it is not `programScene` (an effect is on air). */
  programFeed?: string | null;
  /** Scene to film for the preview monitor when a live bus carries the PIPs / advertisement. */
  previewFeed?: string | null;
  previewScene: string | null;
  tBar: number;
  transitioning: boolean;
  dskActive: boolean[];
  streaming: boolean;
  recording: boolean;
  /** Real video: fetches a frame (data-URI) for a scene. */
  liveVideo: boolean;
  fps: number;
  connected: boolean;
  getFrame: (scene: string) => Promise<string | null>;
  /** Demo Mode has no real OBS output, so the graphics are drawn here. */
  demo: boolean;
  graphics: GraphicsConfig;
  gfxActive: Record<GfxId, boolean>;
  /** Show a wall of small camera monitors under the two main ones. */
  wall?: boolean;
  camScenes?: (string | null)[];
  /** Low-rate thumbnail for one scene (camera wall). */
  getThumb?: (scene: string) => Promise<string | null>;
  onPreviewCam?: (cam: CamIndex) => void;
  onProgramCam?: (cam: CamIndex) => void;
}

function timecode(now: number) {
  if (!now) return "--:--:--:--";
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${p(Math.floor((d.getMilliseconds() / 1000) * 30))}`;
}

/** Polls OBS for frames of `scene`, one request at a time (never piles up). */
function useFeed(
  scene: string | null,
  enabled: boolean,
  fps: number,
  getFrame: (scene: string) => Promise<string | null>,
) {
  const [frame, setFrame] = useState<{ scene: string; src: string } | null>(null);
  useEffect(() => {
    if (!enabled || !scene) {
      setFrame(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interval = 1000 / Math.max(1, fps);
    const tick = async () => {
      if (stopped) return;
      const t0 = performance.now();
      if (!document.hidden) {
        const src = await getFrame(scene).catch(() => null);
        if (stopped) return;
        if (src) setFrame({ scene, src });
      }
      timer = setTimeout(() => void tick(), Math.max(0, interval - (performance.now() - t0)));
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [scene, enabled, fps, getFrame]);
  // Never show a frame that belongs to a previous scene.
  return frame && frame.scene === scene ? frame.src : null;
}

function Monitor({
  kind,
  cam,
  scene,
  frame,
  children,
}: {
  kind: "program" | "preview";
  cam: CamIndex | null;
  scene: string | null;
  frame: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[3px] border-2 bg-bezel",
        kind === "program" ? "border-program shadow-[var(--glow-program)]" : "border-preview",
      )}
      // Largest picture (16:9) + tally bar that fits the cell, so the monitors always fit the screen.
      style={{ width: "min(100cqw, calc((100cqh - 23px) * 16 / 9))" }}
    >
      {/* the picture: always exactly 16:9, graphics sit on it just like on the real output */}
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {frame ? (
          <img src={frame} alt={`${kind} video`} draggable={false} className="absolute inset-0 h-full w-full bg-black object-contain" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_3px,var(--panel)_4px)] opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
              <span className="text-2xl font-bold tracking-[0.2em] text-foreground @[28rem]:text-4xl">
                {cam === null ? "—" : camLabel(cam)}
              </span>
              <span className="mk-label max-w-full truncate text-[10px]">{scene ?? "No scene"}</span>
            </div>
          </>
        )}
        {frame && (
          <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/60 px-1.5 font-mono text-[10px] text-foreground">
            {cam === null ? scene : camLabel(cam)}
          </span>
        )}
        {children}
      </div>
      <div
        className={cn(
          "py-[3px] text-center text-[10px] leading-[11px] font-bold tracking-[0.3em]",
          kind === "program" ? "bg-program text-destructive-foreground" : "bg-preview text-primary-foreground",
        )}
      >
        {kind === "program" ? "PROGRAM" : "PREVIEW"}
      </div>
    </div>
  );
}

/** One small camera monitor on the wall: slow thumbnail, tally colour, tap = preview, PGM = program. */
function CamThumb({
  cam,
  scene,
  live,
  getThumb,
  isProgram,
  isPreview,
  onPreview,
  onProgram,
}: {
  cam: CamIndex;
  scene: string | null;
  live: boolean;
  getThumb?: (scene: string) => Promise<string | null>;
  isProgram: boolean;
  isPreview: boolean;
  onPreview?: (cam: CamIndex) => void;
  onProgram?: (cam: CamIndex) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!live || !scene || !getThumb) {
      setThumb(null);
      return;
    }
    let stopped = false;
    const tick = async () => {
      const src = await getThumb(scene).catch(() => null);
      if (!stopped && src) setThumb(src);
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, scene, getThumb]);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[3px] border-2 bg-bezel",
        isProgram ? "border-program" : isPreview ? "border-preview" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => onPreview?.(cam)}
        title={`${camLabel(cam)} — tap for preview`}
        className="relative aspect-video w-full overflow-hidden bg-black"
      >
        {thumb ? (
          <img src={thumb} alt={camLabel(cam)} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1 text-center">
            <span className="text-sm font-bold tracking-[0.15em] text-foreground">{camLabel(cam)}</span>
            <span className="mk-label max-w-full truncate text-[8px]">{scene ?? "No scene"}</span>
          </span>
        )}
      </button>
      <div className="flex items-stretch text-[8px] font-bold tracking-[0.2em]">
        <span
          className={cn(
            "flex-1 py-[2px] text-center",
            isProgram ? "bg-program text-destructive-foreground" : isPreview ? "bg-preview text-primary-foreground" : "bg-panel text-muted-foreground",
          )}
        >
          {camLabel(cam)}
        </span>
        <button
          type="button"
          onClick={() => onProgram?.(cam)}
          title={`Take ${camLabel(cam)} to program`}
          className="mk-button px-1.5 font-mono text-[8px]"
        >
          PGM
        </button>
      </div>
    </div>
  );
}

export function Multiview(props: MultiviewProps) {
  const now = useClock(33);
  const live = props.liveVideo && props.connected;
  const previewFrame = useFeed(props.previewFeed ?? props.previewScene, live, props.fps, props.getFrame);
  const programFrame = useFeed(props.programFeed ?? props.programScene, live, props.fps, props.getFrame);

  return (
    <section className="mk-panel grid h-full min-h-0 grid-cols-2 gap-1.5 rounded-md p-1.5">
      <div className="flex aspect-video min-h-0 items-center justify-center fit:aspect-auto" style={{ containerType: "size" }}>
      <Monitor kind="preview" cam={props.preview} scene={props.previewScene} frame={previewFrame} />
      </div>
      <div className="flex aspect-video min-h-0 items-center justify-center fit:aspect-auto" style={{ containerType: "size" }}>
      <Monitor kind="program" cam={props.program} scene={props.programScene} frame={programFrame}>
        <div className="absolute top-1 left-1 flex flex-wrap gap-1">
          {props.streaming && <span className="mk-lit-program rounded-sm px-1.5 text-[9px] font-bold">ON AIR</span>}
          {props.recording && (
            <span className="animate-pulse rounded-sm bg-program px-1.5 text-[9px] font-bold text-destructive-foreground">● REC</span>
          )}
          {props.dskActive.map(
            (on, i) =>
              on && (
                <span key={i} className="mk-lit-amber rounded-sm px-1.5 text-[9px] font-bold">
                  DSK {i + 1}
                </span>
              ),
          )}
        </div>
        {props.demo && <DemoGraphics g={props.graphics} active={props.gfxActive} />}
        <span className="absolute top-1 right-1 rounded-sm bg-black/50 px-1 font-mono text-[10px] text-amber">
          {timecode(now)}
        </span>
        {props.transitioning && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-led-off">
            <div className="h-full bg-amber" style={{ width: `${Math.round(props.tBar * 100)}%` }} />
          </div>
        )}
      </Monitor>
      </div>
    </section>
  );
}
