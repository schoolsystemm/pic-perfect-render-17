import { useEffect, useRef, useState } from "react";

import type { AudioChannel, GfxId, OutputState, StreamStats } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface StatusHubProps {
  programScene: string | null;
  previewScene: string | null;
  dskActive: boolean[];
  gfxActive: Record<GfxId, boolean>;
  audio: AudioChannel[];
  stream: OutputState;
  record: OutputState;
  stats: StreamStats | null;
  connected: boolean;
}

const HISTORY = 60; // seconds of bitrate shown

type Tone = "ok" | "warn" | "bad" | "idle";
const TONE: Record<Tone, string> = {
  ok: "text-[oklch(0.8_0.2_150)]",
  warn: "text-amber",
  bad: "text-program",
  idle: "text-engrave",
};

function Tile({ label, value, unit, tone, sub }: { label: string; value: string; unit?: string | undefined; tone: Tone; sub?: string | undefined }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-[4px] border border-white/5 bg-black/25 px-2 py-1.5">
      <span className="mk-label text-[8px] leading-none">{label}</span>
      <span className={cn("font-mono text-[17px] leading-none font-bold", TONE[tone])}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] font-normal opacity-70">{unit}</span>}
      </span>
      <span className="truncate font-mono text-[8px] leading-none text-engrave">{sub ?? "\u00a0"}</span>
    </div>
  );
}

/** Tally row: a lamp, a label and what is behind it. */
function Row({ lamp, label, value }: { lamp: "program" | "preview" | "amber" | "off"; label: string; value: string }) {
  const color =
    lamp === "program"
      ? "bg-program shadow-[0_0_6px_var(--color-program)]"
      : lamp === "preview"
        ? "bg-[oklch(0.75_0.2_150)] shadow-[0_0_6px_oklch(0.75_0.2_150)]"
        : lamp === "amber"
          ? "bg-amber shadow-[0_0_6px_var(--color-amber)]"
          : "bg-led-off";
  return (
    <div className="flex min-w-0 items-center gap-2 leading-none">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", color)} />
      <span className="mk-label w-12 shrink-0 text-[8px]">{label}</span>
      <span className={cn("min-w-0 truncate font-mono text-[10px]", lamp === "off" ? "text-engrave" : "text-foreground")}>{value}</span>
    </div>
  );
}

/** Bitrate over the last minute, drawn as a filled line. */
function Spark({ points, max }: { points: number[]; max: number }) {
  const w = 240;
  const h = 34;
  const step = w / (HISTORY - 1);
  const xy = points.map((v, i) => {
    const x = (HISTORY - points.length + i) * step;
    const y = h - 2 - Math.min(1, v / max) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full text-amber" aria-hidden>
      <line x1="0" x2={w} y1={h - 0.5} y2={h - 0.5} stroke="currentColor" strokeOpacity="0.2" />
      {xy.length > 1 && (
        <>
          <polygon points={`${xy[0]!.split(",")[0]},${h} ${xy.join(" ")} ${w},${h}`} fill="currentColor" fillOpacity="0.15" />
          <polyline points={xy.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** On-air tally plus stream health: the things an operator checks every few seconds. */
export function StatusHub({ programScene, previewScene, dskActive, gfxActive, audio, stream, record, stats, connected }: StatusHubProps) {
  // Keep a rolling minute of bitrate readings.
  const [history, setHistory] = useState<number[]>([]);
  const lastStats = useRef<StreamStats | null>(null);
  useEffect(() => {
    if (!stats || stats === lastStats.current) return;
    lastStats.current = stats;
    setHistory((h) => [...h, stream.active ? stats.bitrateKbps : 0].slice(-HISTORY));
  }, [stats, stream.active]);

  const liveMics = audio.filter((c) => c.stream && !c.muted);
  const gfxOn = (Object.keys(gfxActive) as GfxId[]).filter((g) => gfxActive[g]);
  const dskOn = dskActive.map((on, i) => (on ? `DSK ${i + 1}` : null)).filter(Boolean) as string[];
  const over = [...gfxOn.map((g) => g.toUpperCase()), ...dskOn];

  // Health tones.
  const dropPct = stats && stats.totalFrames > 0 ? (stats.droppedFrames / stats.totalFrames) * 100 : 0;
  const peak = Math.max(1, ...history, 1);
  const avg = history.length ? history.filter((v) => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, history.filter((v) => v > 0).length) : 0;
  const bitrateTone: Tone = !stream.active ? "idle" : stats && stats.bitrateKbps === 0 ? "bad" : avg > 0 && stats && stats.bitrateKbps < avg * 0.6 ? "warn" : "ok";
  const cpuTone: Tone = !stats ? "idle" : stats.cpu > 85 ? "bad" : stats.cpu > 65 ? "warn" : "ok";
  const dropTone: Tone = !stats || !stream.active ? "idle" : dropPct > 2 ? "bad" : dropPct > 0.3 ? "warn" : "ok";
  const fpsTone: Tone = !stats ? "idle" : stats.fps < 24 ? "bad" : stats.fps < 29 ? "warn" : "ok";

  const problems: string[] = [];
  if (stream.active && bitrateTone === "bad") problems.push("No data leaving OBS");
  if (dropTone === "bad") problems.push("Dropping frames — check the network");
  if (cpuTone === "bad") problems.push("OBS CPU is overloaded");
  if (stats && stats.skippedRender > 0 && stats.fps < 29) problems.push("Renderer is skipping frames");
  const healthy = connected && stats !== null && problems.length === 0;

  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col rounded-md p-1.5">
      <header className="mb-1 flex items-center gap-2">
        <span className="mk-label text-foreground">Status</span>
        <span className="mk-label hidden text-[8px] xl:block">ON AIR · STREAM HEALTH</span>
        <span
          className={cn(
            "ml-auto flex h-[18px] items-center gap-1.5 rounded-[3px] border border-white/10 px-2 font-mono text-[9px] font-bold",
            !connected || !stats ? "text-engrave" : healthy ? TONE.ok : TONE.bad,
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {!connected ? "OFFLINE" : !stats ? "WAITING" : healthy ? "ALL GOOD" : "ATTENTION"}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(9rem,0.9fr)_minmax(0,1.6fr)] gap-1.5">
        {/* ON AIR tally */}
        <div className="flex min-h-0 min-w-0 flex-col justify-center gap-[7px] rounded-[4px] border border-white/5 bg-black/25 px-2 py-1.5">
          <Row lamp={programScene ? "program" : "off"} label="PGM" value={programScene ?? "nothing on air"} />
          <Row lamp={previewScene ? "preview" : "off"} label="PVW" value={previewScene ?? "—"} />
          <Row lamp={over.length ? "amber" : "off"} label="OVER" value={over.length ? over.join(" · ") : "no graphics"} />
          <Row lamp={liveMics.length ? "program" : "off"} label="AUDIO" value={liveMics.length ? `${liveMics.length} live: ${liveMics.map((c) => c.name).join(", ")}` : "all muted"} />
          <Row lamp={stream.active ? "program" : "off"} label="STREAM" value={stream.active ? "live" : "off"} />
          <Row lamp={record.active ? (record.paused ? "amber" : "program") : "off"} label="REC" value={record.active ? (record.paused ? "paused" : "recording") : "off"} />
        </div>

        {/* Health */}
        <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
          <div className="grid grid-cols-4 gap-1.5">
            <Tile
              label="BITRATE"
              value={stream.active && stats ? String(stats.bitrateKbps) : "—"}
              unit={stream.active && stats ? "kbps" : undefined}
              tone={bitrateTone}
              sub={stream.active ? `avg ${Math.round(avg)}` : "not streaming"}
            />
            <Tile label="FPS" value={stats ? stats.fps.toFixed(0) : "—"} tone={fpsTone} sub={stats ? `${stats.skippedRender} skipped` : undefined} />
            <Tile label="CPU" value={stats ? stats.cpu.toFixed(0) : "—"} unit={stats ? "%" : undefined} tone={cpuTone} />
            <Tile
              label="DROPPED"
              value={stats && stream.active ? String(stats.droppedFrames) : "—"}
              tone={dropTone}
              sub={stats && stream.active ? `${dropPct.toFixed(2)}%` : undefined}
            />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[4px] border border-white/5 bg-black/25">
            <span className="mk-label absolute top-1 left-1.5 text-[8px]">BITRATE · LAST MINUTE</span>
            <div className="absolute inset-x-0 top-3 bottom-0">
              <Spark points={history} max={Math.max(peak * 1.15, 1000)} />
            </div>
            {problems.length > 0 && (
              <span className="absolute right-1.5 bottom-1 max-w-[70%] truncate font-mono text-[9px] font-bold text-program">⚠ {problems[0]}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
