import { ArrowDown, ArrowUp, ExternalLink, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CommsPanel } from "@/components/mk/comms-panel";
import { PrompterView } from "@/components/mk/prompter-view";
import { RundownScreen } from "@/components/mk/rundown-screen";
import { useComms } from "@/lib/mk/intercom";
import { playout } from "@/lib/mk/playout";
import { prompter, usePrompter } from "@/lib/mk/prompter";
import {
  RUNDOWN_CHANNEL,
  cue,
  fmtSecs,
  goBack,
  goNext,
  onMoved,
  onRemoved,
  parseDuration,
  resetRun,
  togglePause,
  useRun,
} from "@/lib/mk/rundown-run";
import { engine } from "@/lib/mk/use-switcher";
import type { AudioChannel, GfxId, RundownItem } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface ToolsHubProps {
  dskActive: boolean[];
  gfxActive: Record<GfxId, boolean>;
  audio: AudioChannel[];
  rundown: RundownItem[];
  masterMuted: boolean;
}

type Tab = "timer" | "rundown" | "prompter" | "comms" | "quick";
const TABS: { id: Tab; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "rundown", label: "Rundown" },
  { id: "prompter", label: "Prompter" },
  { id: "comms", label: "Comms" },
  { id: "quick", label: "Quick" },
];

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
  const run = useRun();
  const [text, setText] = useState("");
  const [dur, setDur] = useState("");

  const add = () => {
    const t = text.trim();
    if (!t) return;
    engine.setRundown([...items, { text: t, secs: parseDuration(dur) }]);
    setText("");
    setDur("");
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    engine.setRundown(next);
    onMoved(i, j);
  };
  const remove = (i: number) => {
    engine.setRundown(items.filter((_, j) => j !== i));
    onRemoved(i);
  };
  const total = items.reduce((a, i) => a + i.secs, 0);
  const atEnd = items.length > 0 && run.idx >= items.length;
  /** GO NEXT: a video from Playout is started in OBS; leaving the videos stops the playout. */
  const go = () => {
    const target = items[run.idx + 1];
    if (target?.play) {
      void playout.playById(target.play);
      return;
    }
    const leaving = !!items[run.idx]?.play;
    goNext(items);
    if (leaving) void playout.stop();
  };
  const pause = () => (items[run.idx]?.play ? void playout.togglePause() : togglePause());

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-1.5">
      {/* where-are-we screen + transport */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <div className="min-h-0 flex-1">
          <RundownScreen items={items} run={run} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button type="button" className="mk-button h-[22px] rounded-[3px] px-2 text-[10px]" disabled={run.idx <= 0 || atEnd} onClick={goBack}>
            BACK
          </button>
          <button
            type="button"
            className={cn("mk-button h-[22px] rounded-[3px] px-3 text-[10px] font-bold", !atEnd && items.length > 0 && "mk-lit-preview")}
            disabled={!items.length || atEnd}
            onClick={go}
          >
            {run.idx < 0 ? "START" : run.idx >= items.length - 1 ? "FINISH" : "GO NEXT"}
          </button>
          <button
            type="button"
            className={cn("mk-button h-[22px] rounded-[3px] px-2 text-[10px]", run.running && "mk-lit-amber")}
            disabled={run.idx < 0 || atEnd}
            onClick={pause}
          >
            {run.running ? "PAUSE" : "RESUME"}
          </button>
          <button type="button" className="mk-button h-[22px] rounded-[3px] px-2 text-[10px]" onClick={resetRun}>
            RESET
          </button>
          <button
            type="button"
            title="Open the big rundown screen in its own window (put it on a second monitor)"
            className="mk-button ml-auto flex h-[22px] items-center gap-1 rounded-[3px] px-2 text-[10px]"
            onClick={() => window.open("/rundown", "mk-rundown", "popup,width=1280,height=720")}
          >
            <ExternalLink className="h-3 w-3" /> SCREEN
          </button>
        </div>
      </div>

      {/* the planned programme */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <div className="flex shrink-0 items-center gap-1">
          <input
            className="mk-field h-6 min-w-0 flex-1 rounded-[3px] px-1.5 text-[11px]"
            value={text}
            placeholder="Segment title"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="mk-field h-6 w-12 shrink-0 rounded-[3px] px-1.5 text-center text-[11px]"
            value={dur}
            placeholder="m:ss"
            title="Planned length: 5 = 5 minutes, 1:30 = 90 seconds, empty = untimed"
            onChange={(e) => setDur(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button type="button" onClick={add} disabled={!text.trim()} className="mk-button flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px]" aria-label="Add segment">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-[3px] overflow-y-auto">
          {items.length === 0 && <p className="mk-label py-3 text-center text-[9px]">Plan your show: title + length, one segment per line. Tap a segment to cue it.</p>}
          {items.map((it, i) => {
            const isCur = i === run.idx;
            const isNext = i === run.idx + 1;
            const done = i < run.idx;
            return (
              <div
                key={`${it.text}-${i}`}
                className={cn(
                  "group flex items-center gap-1 rounded-[3px] border px-1.5 py-[3px]",
                  isCur ? (run.running ? "border-program/70 bg-program/15" : "border-amber/60 bg-amber/10") : isNext ? "border-amber/30 bg-black/20" : "border-white/5 bg-black/20",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", isCur ? (run.running ? "bg-program shadow-[0_0_6px_var(--color-program)]" : "bg-amber") : done ? "bg-[oklch(0.75_0.2_150)]/60" : "bg-led-off")} />
                <button
                  type="button"
                  onClick={() => cue(i)}
                  title="Cue this segment (does not start it)"
                  className={cn("min-w-0 flex-1 truncate text-left text-[11px]", done ? "text-engrave line-through" : "text-foreground")}
                >
                  {it.text}
                </button>
                {isNext && <span className="text-[8px] font-bold tracking-wider text-amber">NEXT</span>}
                <span className="shrink-0 font-mono text-[9px] text-engrave">{it.secs ? fmtSecs(it.secs) : "—"}</span>
                {it.play && <span className="text-[8px] font-bold tracking-wider text-preview">VIDEO</span>}
                <span className={cn("flex shrink-0 opacity-40 group-hover:opacity-100", it.play && "hidden")}>
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)}>
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)}>
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label="Remove segment" onClick={() => remove(i)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {items.length > 0 && <div className="shrink-0 text-right font-mono text-[9px] text-engrave">PLANNED {fmtSecs(total)}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ prompter

function PrompterTab() {
  const p = usePrompter();
  // The operator always reads the preview un-mirrored; mirror/flip only apply to the real output.
  const view = useMemo(() => ({ ...p, mirror: false, flip: false }), [p]);
  const btn = "mk-button h-[22px] rounded-[3px] px-2 text-[10px]";
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-1.5">
      {/* script */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <textarea
          className="mk-field min-h-0 w-full flex-1 resize-none rounded-[3px] p-1.5 text-[11px] leading-snug"
          value={p.text}
          placeholder={"Paste or type the script.\nA line like [CAM 2] shows in amber as a cue."}
          spellCheck={false}
          onChange={(e) => prompter.setText(e.target.value)}
        />
        <div className="flex shrink-0 items-center justify-between font-mono text-[9px] text-engrave">
          <span>{p.text.trim() ? `${p.text.trim().split(/\s+/).length} words · ~${Math.max(1, Math.round(p.text.trim().split(/\s+/).length / 150))} min` : "empty"}</span>
          {p.text && (
            <button type="button" className="hover:text-foreground" onClick={() => confirm("Clear the whole script?") && prompter.setText("")}>
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* monitor + controls */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] border border-white/10" title="Preview — line wrapping differs from the real output">
          <PrompterView state={view} onEnd={(em) => prompter.ended(em)} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button type="button" className={cn(btn, "w-14 font-bold", p.playing ? "mk-lit-amber" : "mk-lit-preview")} onClick={prompter.toggle}>
            {p.playing ? "PAUSE" : "PLAY"}
          </button>
          <button type="button" className={btn} onClick={() => prompter.nudge(-3)} title="Back a few lines">
            ▲
          </button>
          <button type="button" className={btn} onClick={() => prompter.nudge(3)} title="Forward a few lines">
            ▼
          </button>
          <button type="button" className={btn} onClick={prompter.top}>
            TOP
          </button>
          <button
            type="button"
            className="mk-button ml-auto flex h-[22px] items-center gap-1 rounded-[3px] px-2 text-[10px]"
            title="Open the prompter output in its own window (drag it to the prompter screen, F = full screen)"
            onClick={() => window.open("/prompter", "mk-prompter", "popup,width=1280,height=720")}
          >
            <ExternalLink className="h-3 w-3" /> OUTPUT
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-0.5">
          <span className="mk-label text-[8px]">SPEED</span>
          <input type="range" min={1} max={20} value={p.speed} onChange={(e) => prompter.setSpeed(+e.target.value)} className="h-3 w-full accent-amber" aria-label="Scroll speed" />
          <span className="w-4 text-right font-mono text-[9px]">{p.speed}</span>
          <span className="mk-label text-[8px]">SIZE</span>
          <input type="range" min={4} max={18} value={p.size} onChange={(e) => prompter.setSize(+e.target.value)} className="h-3 w-full accent-amber" aria-label="Text size on output" />
          <span className="w-4 text-right font-mono text-[9px]">{p.size}</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={p.mirror} className={cn(btn, "flex-1", p.mirror && "mk-lit-amber")} onClick={() => prompter.setMirror(!p.mirror)} title="Mirror the output left-right (beam-splitter glass)">
            MIRROR
          </button>
          <button type="button" aria-pressed={p.flip} className={cn(btn, "flex-1", p.flip && "mk-lit-amber")} onClick={() => prompter.setFlip(!p.flip)} title="Flip the output upside down">
            FLIP
          </button>
        </div>
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

export function ToolsHub({ dskActive, gfxActive, audio, rundown, masterMuted }: ToolsHubProps) {
  const [tab, setTab] = useState<Tab>("timer");
  const [timer, setTimer] = useState<TimerState>({ mode: "down", running: false, base: 0, t0: 0 });
  const run = useRun();
  const prompting = usePrompter().playing;
  const commsOn = useComms().running;

  // Feed the pop-out /rundown window (same browser): push on every change, answer "hello" on open.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(RUNDOWN_CHANNEL);
    const send = () => ch.postMessage({ type: "snapshot", snapshot: { items: rundown, run } });
    ch.onmessage = (e: MessageEvent) => e.data?.type === "hello" && send();
    send();
    return () => ch.close();
  }, [rundown, run]);

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
            {(t.id === "timer" && timer.running) || (t.id === "rundown" && run.running) || (t.id === "prompter" && prompting) || (t.id === "comms" && commsOn) ? " ●" : ""}
          </button>
        ))}
      </header>

      <div className="min-h-0 min-w-0 flex-1">
        {tab === "timer" && <TimerTab t={timer} setT={setTimer} />}
        {tab === "rundown" && <RundownTab items={rundown} />}
        {tab === "prompter" && <PrompterTab />}
        {tab === "comms" && <CommsPanel />}
        {tab === "quick" && <QuickTab audio={audio} gfxActive={gfxActive} dskActive={dskActive} masterMuted={masterMuted} />}
      </div>
    </section>
  );
}
