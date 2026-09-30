import { Circle, Pause, Play, Radio } from "lucide-react";

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
    <section className="mk-panel flex flex-col gap-1.5 rounded-md p-2">
      <span className="mk-label">Outputs</span>
      <button
        type="button"
        onClick={stream.active ? confirmStop("streaming", onStream) : onStream}
        className={cn("mk-button flex h-11 items-center justify-between rounded-sm px-2 text-sm", stream.active && "mk-lit-program")}
      >
        <span className="flex items-center gap-1.5"><Radio className="h-4 w-4" />{stream.active ? "LIVE" : "STREAM"}</span>
        <span className="font-mono text-[11px]">{formatDuration(elapsed(stream, now))}</span>
      </button>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={record.active ? confirmStop("recording", onRecord) : onRecord}
          className={cn("mk-button flex h-11 flex-1 items-center justify-between rounded-sm px-2 text-sm", record.active && !record.paused && "mk-lit-program", record.paused && "mk-lit-amber")}
        >
          <span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5 fill-current" />{record.paused ? "PAUSED" : "REC"}</span>
          <span className="font-mono text-[11px]">{formatDuration(elapsed(record, now))}</span>
        </button>
        <button
          type="button"
          disabled={!record.active}
          onClick={onPause}
          aria-label={record.paused ? "Resume recording" : "Pause recording"}
          className="mk-button flex h-11 w-11 items-center justify-center rounded-sm disabled:opacity-40"
        >
          {record.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
