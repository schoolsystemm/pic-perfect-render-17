import { Check, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { engine } from "@/lib/mk/use-switcher";
import type { AudioChannel, GfxId, OutputState, RundownItem } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface ToolsHubProps {
  programScene: string | null;
  previewScene: string | null;
  dskActive: boolean[];
  gfxActive: Record<GfxId, boolean>;
  audio: AudioChannel[];
  stream: OutputState;
  record: OutputState;
  rundown: RundownItem[];
  masterMuted: boolean;
}

type Tab = "timer" | "rundown" | "quick";
const TABS: { id: Tab; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "rundown", label: "Rundown" },
  { id: "quick", label: "Quick" },
];

// ------------------------------------------------------------------ tally (left side)

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

// ------------------------------------------------------------------ timer

interface TimerState {
  mode: "down" | "up";
  running: boolean;
  /** down: ms left when last paused. up: ms elapsed when last paused. */
  base: number;
  /** When the current run started (performance.now()). */
  t0: number;
}

const fmt = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

function TimerTab({ t, setT }: { t: TimerState; setT: (next: TimerState) => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!t.running) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [t.running]);

  const elapsed = t.running ? performance.now() - t.t0 : 0;
  const ms = t.mode === "down" ? Math.max(0, t.base - elapsed) : t.base + elapsed;
  // A countdown that reaches zero stops itself and stays red.
  useEffect(() => {
    if (t.mode === "down" && t.running && ms <= 0) setT({ ...t, running: false, base: 0 });
  }, [ms, t, setT]);

  const finished = t.mode === "down" && !t.running && t.base === 0;
  const low = t.mode === "down" && ms > 0 && ms <= 30_000;
  const start = (mode: "down" | "up", base: number) => setT({ mode, running: true, base, t0: performance.now() });

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-[4px] border border-white/5 bg-black/25 font-mono text-[34px] leading-none font-bold tabular-nums",
          finished ? "animate-pulse text-program" : low ? "text-program" : t.running ? "text-foreground" : "text-engrave",
        )}
      >
        {fmt(ms)}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {[1, 5, 10, 15].map((m) => (
          <button key={m} type="button" className="mk-button h-[22px] rounded-[3px] px-2 text-[10px]" onClick={() => start("down", m * 60_000)}>
            {m}:00
          </button>
        ))}
        <button
          type="button"
          className="mk-button h-[22px] rounded-[3px] px-2 text-[10px]"
          title="Add a minute"
          onClick={() => setT({ ...t, base: t.mode === "down" ? ms + 60_000 : t.base, t0: performance.now(), running: t.running })}
          disabled={t.mode !== "down"}
        >
          +1m
        </button>
        <button type="button" className="mk-button h-[22px] rounded-[3px] px-2 text-[10px]" onClick={() => start("up", 0)}>
          Stopwatch
        </button>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            className={cn("mk-button h-[22px] rounded-[3px] px-2.5 text-[10px]", t.running && "mk-lit-amber")}
            onClick={() => setT(t.running ? { ...t, running: false, base: t.mode === "down" ? ms : t.base + elapsed } : { ...t, running: true, t0: performance.now() })}
          >
            {t.running ? "PAUSE" : "RESUME"}
          </button>
          <button type="button" className="mk-button h-[22px] rounded-[3px] px-2.5 text-[10px]" onClick={() => setT({ mode: "down", running: false, base: 0, t0: 0 })}>
            RESET
          </button>
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ rundown

function RundownTab({ items }: { items: RundownItem[] }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    engine.setRundown([...items, { text: t, done: false }]);
    setText("");
  };
  const next = items.findIndex((i) => !i.done);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-1">
        <input
          className="mk-field h-6 min-w-0 flex-1 rounded-[3px] px-1.5 text-[11px]"
          value={text}
          placeholder="Add a segment (Enter)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="mk-button flex h-6 w-6 items-center justify-center rounded-[3px]" aria-label="Add segment">
          <Plus className="h-3 w-3" />
        </button>
        {items.some((i) => i.done) && (
          <button type="button" className="mk-button h-6 shrink-0 rounded-[3px] px-1.5 text-[9px]" onClick={() => engine.setRundown(items.filter((i) => !i.done))} title="Remove the ticked segments">
            CLEAR DONE
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-[3px] overflow-y-auto">
        {items.length === 0 && <p className="mk-label py-3 text-center text-[9px]">Your run of show goes here. Tap a segment when it is done.</p>}
        {items.map((it, i) => (
          <div
            key={`${it.text}-${i}`}
            className={cn(
              "flex items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px]",
              i === next ? "border-amber/60 bg-amber/10" : "border-white/5 bg-black/20",
            )}
          >
            <button
              type="button"
              onClick={() => engine.setRundown(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              aria-pressed={it.done}
              aria-label={it.done ? "Mark not done" : "Mark done"}
              className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border", it.done ? "border-preview bg-preview/30 text-foreground" : "border-white/20")}
            >
              {it.done && <Check className="h-3 w-3" />}
            </button>
            <span className={cn("min-w-0 flex-1 truncate text-[11px]", it.done ? "text-engrave line-through" : "text-foreground")} title={it.text}>
              {it.text}
            </span>
            {i === next && <span className="text-[8px] font-bold tracking-wider text-amber">NEXT</span>}
            <button type="button" aria-label="Remove segment" className="opacity-50 hover:opacity-100" onClick={() => engine.setRundown(items.filter((_, j) => j !== i))}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ quick actions

function QuickTab({ audio, gfxActive, dskActive, masterMuted }: Pick<ToolsHubProps, "audio" | "gfxActive" | "dskActive" | "masterMuted">) {
  const mics = audio.filter((c) => !/^MK /i.test(c.name));
  const anyLive = mics.some((c) => !c.muted);
  const gfxUp = (Object.keys(gfxActive) as GfxId[]).filter((g) => gfxActive[g]);
  const dskUp = dskActive.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const overlays = gfxUp.length + dskUp.length;

  const Btn = ({ label, hint, lit, onClick, disabled }: { label: string; hint: string; lit?: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={cn("mk-button flex min-h-0 flex-col items-center justify-center gap-0.5 rounded-[4px] px-1 py-1", lit && "mk-lit-program")}
    >
      <span className="text-[11px] leading-none font-bold tracking-wide">{label}</span>
      <span className="max-w-full truncate font-mono text-[8px] leading-none opacity-70 normal-case">{hint}</span>
    </button>
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-1.5">
      <Btn
        label="CLEAR GFX"
        hint={overlays ? `${overlays} on screen` : "nothing on screen"}
        disabled={!overlays}
        onClick={() => {
          gfxUp.forEach((g) => void engine.toggleGraphic(g));
          dskUp.forEach((i) => void engine.toggleDSK(i));
        }}
      />
      <Btn
        label={anyLive ? "MUTE ALL MICS" : "UNMUTE ALL"}
        hint={anyLive ? `${mics.filter((c) => !c.muted).length} open` : "all muted"}
        lit={!anyLive}
        onClick={() => mics.filter((c) => c.muted === anyLive).forEach((c) => void engine.toggleAudioMute(c.name))}
      />
      <Btn label="MUTE OUT" hint={masterMuted ? "final output muted" : "cut all sound"} lit={masterMuted} onClick={() => void engine.toggleMasterMute()} />
      <Btn label="GO CAM 1" hint="safe shot, straight to air" onClick={() => void engine.selectProgram(0)} />
    </div>
  );
}

// ------------------------------------------------------------------ panel

export function ToolsHub({ programScene, previewScene, dskActive, gfxActive, audio, stream, record, rundown, masterMuted }: ToolsHubProps) {
  const [tab, setTab] = useState<Tab>("timer");
  const [timer, setTimer] = useState<TimerState>({ mode: "down", running: false, base: 0, t0: 0 });

  const liveMics = audio.filter((c) => !/^MK /i.test(c.name) && c.stream && !c.muted);
  const over = [
    ...(Object.keys(gfxActive) as GfxId[]).filter((g) => gfxActive[g]).map((g) => g.toUpperCase()),
    ...dskActive.map((on, i) => (on ? `DSK ${i + 1}` : null)).filter(Boolean),
  ] as string[];

  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col rounded-md p-1.5">
      <header className="mb-1 flex items-center gap-1">
        <span className="mk-label mr-1 text-foreground">Tools</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn("mk-button h-[18px] rounded-[3px] px-2 text-[9px]", tab === t.id && "mk-lit-preview")}
          >
            {t.label}
            {t.id === "timer" && timer.running ? " ●" : ""}
          </button>
        ))}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.6fr)] gap-1.5">
        <div className="flex min-h-0 min-w-0 flex-col justify-center gap-[7px] rounded-[4px] border border-white/5 bg-black/25 px-2 py-1.5">
          <Row lamp={programScene ? "program" : "off"} label="PGM" value={programScene ?? "nothing on air"} />
          <Row lamp={previewScene ? "preview" : "off"} label="PVW" value={previewScene ?? "—"} />
          <Row lamp={over.length ? "amber" : "off"} label="OVER" value={over.length ? over.join(" · ") : "no graphics"} />
          <Row lamp={liveMics.length ? "program" : "off"} label="AUDIO" value={liveMics.length ? `${liveMics.length} live: ${liveMics.map((c) => c.name).join(", ")}` : "all muted"} />
          <Row lamp={stream.active ? "program" : "off"} label="STREAM" value={stream.active ? "live" : "off"} />
          <Row lamp={record.active ? (record.paused ? "amber" : "program") : "off"} label="REC" value={record.active ? (record.paused ? "paused" : "recording") : "off"} />
        </div>
        <div className="min-h-0 min-w-0">
          {tab === "timer" && <TimerTab t={timer} setT={setTimer} />}
          {tab === "rundown" && <RundownTab items={rundown} />}
          {tab === "quick" && <QuickTab audio={audio} gfxActive={gfxActive} dskActive={dskActive} masterMuted={masterMuted} />}
        </div>
      </div>
    </section>
  );
}
