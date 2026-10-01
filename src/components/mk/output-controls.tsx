import { Pause, Play, Radio } from "lucide-react";

import { formatDuration, useClock } from "@/components/mk/use-clock";
import type { OutputState } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

function elapsed(o: OutputState, now: number) {
  return o.baseMs + (o.since && now ? now - o.since : 0);
}

interface OutputControlsProps {
  stream: OutputState;
  record: OutputState;
  onStream: () => void;
  onRecord: () => void;
  onPause: () => void;
}

export function OutputControls({ stream, record, onStream, onRecord, onPause }: OutputControlsProps) {
  const now = useClock(500);
  const confirmStop = (label: string, fn: () => void) => () => {
    if (window.confirm(`Stop ${label}?`)) fn();
  };
  return (
    <section className="mk-panel flex shrink-0 flex-col gap-1 rounded-md p-1.5">
      <button
        type="button"
        onClick={stream.active ? confirmStop("streaming", onStream) : onStream}
        className={cn("mk-button flex h-8 items-center justify-between rounded-[3px] px-2 text-[13px]", stream.active && "mk-lit-program")}
      >
        <span className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5" />
          {stream.active ? "LIVE" : "STREAM"}
        </span>
        <span className="font-mono text-[10px]">{formatDuration(elapsed(stream, now))}</span>
      </button>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={record.active ? confirmStop("recording", onRecord) : onRecord}
          className={cn(
            "mk-button flex h-8 flex-1 items-center justify-between rounded-[3px] px-2 text-[13px]",
            record.active && !record.paused && "mk-lit-program",
            record.paused && "mk-lit-amber",
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full border border-current", record.active && !record.paused ? "bg-current" : "bg-white/80")} />
            {record.paused ? "PAUSED" : "REC"}
          </span>
          <span className="font-mono text-[10px]">{formatDuration(elapsed(record, now))}</span>
        </button>
        <button
          type="button"
          disabled={!record.active}
          onClick={onPause}
          aria-label={record.paused ? "Resume recording" : "Pause recording"}
          className="mk-button flex h-8 w-9 items-center justify-center rounded-[3px]"
        >
          {record.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>
    </section>
  );
}
