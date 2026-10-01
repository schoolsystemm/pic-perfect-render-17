import { useEffect, useState } from "react";

import { elapsedOf, fmtClock, fmtSecs, type RunState } from "@/lib/mk/rundown-run";
import type { RundownItem } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

/**
 * "Where are we" screen: current segment, its clock, what is next, time left in the show.
 * Used compact inside the Tools panel and full-size in the /rundown pop-out.
 */
export function RundownScreen({ items, run, full = false }: { items: RundownItem[]; run: RunState; full?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run.running) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [run.running]);

  const started = run.idx >= 0;
  const ended = items.length > 0 && run.idx >= items.length;
  const cur = started && !ended ? items[run.idx] : undefined;
  const nxt = ended ? undefined : items[run.idx + 1];
  const ms = cur ? elapsedOf(run) : 0;
  const planned = (cur?.secs ?? 0) * 1000;
  const timed = planned > 0;
  const left = timed ? planned - ms : ms; // timed: counts down (negative = over). untimed: counts up.
  const over = timed && left < 0;
  const low = timed && left >= 0 && left <= 30_000;
  const progress = timed ? Math.min(1, ms / planned) : 0;

  // Time left in the whole show (planned).
  const later = items.slice(started ? run.idx + 1 : 0).reduce((a, i) => a + i.secs, 0);
  const showLeft = later * 1000 + (cur && timed ? Math.max(0, left) : 0);

  const state = !items.length ? "EMPTY" : !started ? "STANDBY" : ended ? "END OF SHOW" : run.running ? (over ? "OVER TIME" : "RUNNING") : "CUED";
  const lit = run.running && !!cur;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col justify-between rounded-[4px] border bg-black/25",
        full ? "gap-6 p-8" : "gap-0.5 px-2 py-1",
        lit ? (over || low ? "border-program/70 shadow-[0_0_14px_var(--color-program)]" : "border-[oklch(0.75_0.2_150)]/60") : cur ? "border-amber/60" : "border-white/5",
      )}
    >
      <div className="flex items-center gap-1.5 leading-none">
        <span
          className={cn(
            "shrink-0 rounded-full",
            full ? "h-4 w-4" : "h-2 w-2",
            lit ? (over || low ? "animate-pulse bg-program shadow-[0_0_8px_var(--color-program)]" : "bg-[oklch(0.75_0.2_150)] shadow-[0_0_8px_oklch(0.75_0.2_150)]") : cur ? "bg-amber shadow-[0_0_8px_var(--color-amber)]" : "bg-led-off",
          )}
        />
        <span className={cn("mk-label", full ? "text-lg" : "text-[8px]")}>{state}</span>
        {items.length > 0 && !ended && (
          <span className={cn("mk-label ml-auto font-mono", full ? "text-lg" : "text-[8px]")}>
            {started ? run.idx + 1 : 0}/{items.length}
          </span>
        )}
      </div>

      <div
        className={cn("min-w-0 truncate font-bold leading-tight text-foreground", full ? "text-6xl" : "text-[12px]", !cur && "text-engrave")}
        title={cur?.text}
      >
        {cur ? cur.text : ended ? "That's a wrap" : items.length ? "Press GO to start the show" : "Add segments to build your run of show"}
      </div>

      <div
        className={cn(
          "font-mono leading-none font-bold tabular-nums",
          full ? "text-[18vw]" : "text-[28px]",
          !cur ? "text-engrave" : over ? "animate-pulse text-program" : low ? "text-program" : run.running ? "text-foreground" : "text-amber",
        )}
      >
        {cur ? fmtClock(timed ? left : ms) : "--:--"}
      </div>

      {timed && (
        <div className={cn("w-full overflow-hidden rounded-full bg-white/10", full ? "h-3" : "h-[3px]")}>
          <div className={cn("h-full", over || low ? "bg-program" : "bg-[oklch(0.75_0.2_150)]")} style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className={cn("flex min-w-0 items-center gap-2 font-mono", full ? "text-3xl" : "text-[9px]")}>
        <span className="mk-label shrink-0 text-amber" style={full ? { fontSize: "1.5rem" } : undefined}>
          NEXT
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">{nxt ? `${nxt.text}${nxt.secs ? ` · ${fmtSecs(nxt.secs)}` : ""}` : "—"}</span>
        {later > 0 || cur ? <span className="shrink-0 text-engrave">LEFT {fmtClock(showLeft)}</span> : null}
      </div>
    </div>
  );
}
