import { useClock } from "@/components/mk/use-clock";
import { camLabel, type CamIndex } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface MultiviewProps {
  program: CamIndex | null;
  preview: CamIndex | null;
  programScene: string | null;
  previewScene: string | null;
  tBar: number;
  transitioning: boolean;
  dskActive: boolean;
  streaming: boolean;
  recording: boolean;
}

function timecode(now: number) {
  if (!now) return "--:--:--:--";
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${p(Math.floor((d.getMilliseconds() / 1000) * 30))}`;
}

function Monitor({
  kind,
  cam,
  scene,
  children,
}: {
  kind: "program" | "preview";
  cam: CamIndex | null;
  scene: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-video min-h-0 flex-col overflow-hidden rounded-sm border-2 bg-bezel",
        kind === "program" ? "border-program shadow-[var(--glow-program)]" : "border-preview",
      )}
    >
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_3px,var(--panel)_4px)] opacity-40" />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center">
        <span className="text-2xl font-bold tracking-[0.2em] text-foreground sm:text-4xl">
          {cam === null ? "—" : camLabel(cam)}
        </span>
        <span className="mk-label max-w-full truncate text-[10px]">{scene ?? "No scene"}</span>
      </div>
      {children}
      <div
        className={cn(
          "relative py-0.5 text-center text-[10px] font-bold tracking-[0.3em]",
          kind === "program" ? "bg-program text-destructive-foreground" : "bg-preview text-primary-foreground",
        )}
      >
        {kind === "program" ? "PROGRAM" : "PREVIEW"}
      </div>
    </div>
  );
}

export function Multiview(props: MultiviewProps) {
  const now = useClock(33);
  return (
    <section className="mk-panel grid grid-cols-2 gap-2 rounded-md p-2 sm:gap-3">
      <Monitor kind="preview" cam={props.preview} scene={props.previewScene} />
      <Monitor kind="program" cam={props.program} scene={props.programScene}>
        <div className="absolute top-1 left-1 flex gap-1">
          {props.streaming && (
            <span className="mk-lit-program rounded-sm px-1.5 text-[9px] font-bold">ON AIR</span>
          )}
          {props.recording && (
            <span className="rounded-sm bg-program px-1.5 text-[9px] font-bold text-destructive-foreground animate-pulse">
              ● REC
            </span>
          )}
          {props.dskActive && (
            <span className="mk-lit-amber rounded-sm px-1.5 text-[9px] font-bold">DSK</span>
          )}
        </div>
        <span className="absolute top-1 right-1 font-mono text-[10px] text-amber">{timecode(now)}</span>
        {props.transitioning && (
          <div className="absolute inset-x-0 bottom-5 h-1 bg-led-off">
            <div className="h-full bg-amber" style={{ width: `${Math.round(props.tBar * 100)}%` }} />
          </div>
        )}
      </Monitor>
    </section>
  );
}
