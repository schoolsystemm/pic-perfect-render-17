import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  Pause,
  Play,
  Plus,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  fmtClock,
  fmtLen,
  parseLen,
  pathOf,
  playout,
  schedule,
  secOfDay,
  totalSecs,
  usePlayout,
} from "@/lib/mk/playout";
import { useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const field =
  "h-9 rounded-sm border border-border bg-input px-2 font-mono text-sm text-foreground outline-none focus:border-ring";
const btn = "mk-button flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs disabled:opacity-40";

/** The playout page: the list, planned times, and Play / Next / Pause / Stop into OBS. */
export function PlayoutScreen() {
  const { plan, run } = usePlayout();
  const state = useSwitcher();
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const items = plan.items;
  const running = run.idx >= 0 && run.idx < items.length;
  const finished = items.length > 0 && run.idx >= items.length;
  const slots = schedule(items, run, plan.startAt);
  const total = totalSecs(items);
  const first = slots[0];
  const endAt = slots.length ? slots[slots.length - 1]!.end : 0;
  const mark = Math.ceil(endAt / 1800) * 1800;
  const gap = mark - endAt;

  const cur = running ? items[run.idx]! : null;
  const elapsed = running ? ((run.pausedAt ?? now) - run.t0) / 1000 : 0;
  const left = cur ? Math.max(0, cur.secs - elapsed) : 0;
  const pct = cur && cur.secs > 0 ? Math.min(100, (elapsed / cur.secs) * 100) : 0;
  const next = running ? items[run.idx + 1] : items[0];
  const connected = state.status === "connected";
  const sod = secOfDay(now);
  const startIn = !running && !finished && first ? parseLen(plan.startAt)! - sod : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-3 p-3">
      <section className="mk-panel grid gap-3 rounded-md p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[16rem] flex-1 gap-1">
            <span className="mk-label">Folder on the OBS PC</span>
            <input
              className={field}
              value={plan.folder}
              placeholder="C:\Users\HomePC\Videos"
              onChange={(e) => playout.setFolder(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="grid gap-1">
            <span className="mk-label">First video starts at</span>
            <input
              className={cn(field, "w-36")}
              type="time"
              step={1}
              value={plan.startAt}
              onChange={(e) => playout.setStartAt(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={btn}
            onClick={() =>
              playout.setStartAt(fmtClock(secOfDay(Date.now()) + 60).slice(0, 5) + ":00")
            }
          >
            Start next minute
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
            <FolderOpen className="h-4 w-4" /> Add videos
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="video/*,.mkv,.mov,.mp4,.avi,.mxf,.ts,.m4v,.webm"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void playout.addFiles(files);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={plan.take}
              onChange={(e) => playout.setOpt({ take: e.target.checked })}
            />
            Cut to the playout scene when a video starts
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={plan.ret}
              onChange={(e) => playout.setOpt({ ret: e.target.checked })}
            />
            Cut back to the previous scene when the list ends or stops
          </label>
        </div>
        {!plan.folder.trim() && items.length > 0 && (
          <p className="font-mono text-[11px] text-amber">
            Type the folder where these files are ON THE OBS PC. The browser only knows file names,
            OBS needs the full path.
          </p>
        )}
        {!connected && !state.demo && (
          <p className="font-mono text-[11px] text-amber">
            Not connected to OBS: the list and times work, Play does not.
          </p>
        )}
      </section>

      <section
        className={cn(
          "mk-panel grid gap-2 rounded-md p-3",
          running && "border-l-4 border-l-program",
        )}
        aria-live="polite"
      >
        {running && cur ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4">
              <span className="mk-label">
                Playing {run.idx + 1} of {items.length}
                {run.pausedAt !== null ? " (paused)" : ""}
              </span>
              <strong className="min-w-0 flex-1 truncate text-lg">{cur.name}</strong>
              <span className="font-mono text-3xl font-bold tabular-nums">
                {cur.secs > 0 ? fmtLen(left) : fmtLen(elapsed)}
              </span>
              <span className="mk-label">{cur.secs > 0 ? "left" : "elapsed"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40">
              <div className="h-full bg-program" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              Ends at {slots[run.idx] ? fmtClock(slots[run.idx]!.end) : "--"} · Next:{" "}
              {next ? next.name : "end of list"}
            </span>
          </>
        ) : finished ? (
          <strong>List finished at {fmtClock(secOfDay(now))}. Press Play to run it again.</strong>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">
            {items.length === 0
              ? "Add your videos. Each one gets its start and end time from its length."
              : startIn !== null && startIn > 0
                ? `Planned start in ${fmtLen(startIn)} (${plan.startAt}). Press Play to start now, or at the time.`
                : "Ready. Press Play to start the first video."}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(btn, "mk-lit-program")}
            disabled={!items.length}
            onClick={() => void (running ? playout.next() : playout.playAt(0))}
          >
            {running ? <SkipForward className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Next video" : "Play list"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!running}
            onClick={() => void playout.togglePause()}
          >
            {run.pausedAt !== null ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {run.pausedAt !== null ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!running && !finished}
            onClick={() => void playout.stop()}
          >
            <Square className="h-4 w-4" /> Stop
          </button>
          <button type="button" className={btn} onClick={() => void playout.takeToAir()}>
            Take playout scene to air
          </button>
          <button type="button" className={btn} onClick={() => void playout.back()}>
            Back to previous scene
          </button>
        </div>
      </section>

      {items.length > 0 && (
        <section className="mk-panel grid gap-2 rounded-md p-3">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <Stat label="total length" value={fmtLen(total)} />
            <Stat label="first starts" value={first ? fmtClock(first.start) : "--"} />
            <Stat label="list ends" value={fmtClock(endAt)} />
            <Stat
              label={
                gap === 0 ? "ends on the :00 / :30" : `to fill to ${fmtClock(mark).slice(0, 5)}`
              }
              value={gap === 0 ? "exact" : fmtLen(gap)}
            />
          </div>
          <div
            className="flex h-9 overflow-hidden rounded-sm border border-border"
            aria-hidden="true"
          >
            {items.map((it, i) => (
              <div
                key={it.id}
                title={`${it.name} (${fmtLen(it.secs)})`}
                className={cn(
                  "flex min-w-0 items-center justify-center border-r-2 border-background font-mono text-xs font-bold text-white",
                  run.idx === i && "outline outline-2 -outline-offset-2 outline-white",
                )}
                style={{
                  flex: `${Math.max(it.secs, 1)} 1 0`,
                  background: `hsl(${(i * 53 + 200) % 360} 45% 38%)`,
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Each block is as wide as the video is long.
          </p>
        </section>
      )}

      <section className="mk-panel overflow-x-auto rounded-md">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-[2rem_1fr_6rem_5.5rem_5.5rem_8rem] gap-2 border-b border-border px-3 py-2 text-[10px] text-muted-foreground">
            <span>#</span>
            <span>Video</span>
            <span>Length</span>
            <span>Starts</span>
            <span>Ends</span>
            <span />
          </div>
          {items.map((it, i) => (
            <div
              key={it.id}
              className={cn(
                "grid grid-cols-[2rem_1fr_6rem_5.5rem_5.5rem_8rem] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0",
                run.idx === i && "bg-program/15",
                (finished || (running && i < run.idx)) && "opacity-50",
              )}
            >
              <span className="font-mono text-xs">{i + 1}</span>
              <span className="min-w-0 truncate text-sm" title={pathOf(it)}>
                {it.name}
              </span>
              <input
                key={it.secs}
                className={cn(field, "h-8 w-full text-xs")}
                defaultValue={it.secs > 0 ? fmtLen(it.secs) : ""}
                placeholder="0:00:00"
                aria-label={`Length of ${it.name}`}
                onBlur={(e) => {
                  const s = parseLen(e.target.value);
                  if (s !== null && s !== it.secs) playout.setSecs(i, s);
                }}
              />
              <span className="font-mono text-xs tabular-nums">
                {slots[i] ? fmtClock(slots[i]!.start) : "--"}
              </span>
              <span className="font-mono text-xs tabular-nums">
                {slots[i] ? fmtClock(slots[i]!.end) : "--"}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className="mk-button flex h-8 w-8 items-center justify-center rounded-sm"
                  aria-label="Play this one now"
                  onClick={() => void playout.playAt(i)}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="mk-button flex h-8 w-7 items-center justify-center rounded-sm"
                  aria-label="Move up"
                  onClick={() => playout.move(i, i - 1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="mk-button flex h-8 w-7 items-center justify-center rounded-sm"
                  aria-label="Move down"
                  onClick={() => playout.move(i, i + 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="mk-button flex h-8 w-7 items-center justify-center rounded-sm"
                  aria-label="Remove"
                  disabled={run.idx === i}
                  onClick={() => playout.remove(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
          {items.length === 0 && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="h-4 w-4" /> Add videos
            </button>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <button
          type="button"
          className="mk-button h-8 w-fit rounded-sm px-3 text-[11px]"
          onClick={() => playout.clear()}
        >
          Clear the list
        </button>
      )}
      <p className="font-mono text-[10px] text-muted-foreground">
        Playout adds a scene called “MK Playout” with one media source. Each video is loaded into it
        from the folder above and started from the beginning; when OBS reports the file has ended,
        MK starts the next one. Start and end times shift with the real start of the video that is
        playing. Only names and lengths are saved in this browser, the files are never uploaded.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b className="block font-mono text-xl tabular-nums">{value}</b>
      <span className="mk-label">{label}</span>
    </div>
  );
}
