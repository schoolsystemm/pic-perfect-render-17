import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { RundownScreen } from "@/components/mk/rundown-screen";
import { IDLE_RUN, RUNDOWN_CHANNEL, type RundownSnapshot } from "@/lib/mk/rundown-run";

export const Route = createFileRoute("/rundown")({
  head: () => ({ meta: [{ title: "Rundown — MK VISION" }] }),
  component: RundownDisplay,
});

/** Full-screen "where are we" display. Open it on a second monitor; it mirrors the switcher window. */
function RundownDisplay() {
  const [snap, setSnap] = useState<RundownSnapshot>({ items: [], run: IDLE_RUN });
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(RUNDOWN_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "snapshot") {
        setSnap(e.data.snapshot as RundownSnapshot);
        setLinked(true);
      }
    };
    ch.postMessage({ type: "hello" });
    return () => ch.close();
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col bg-black p-3">
      <div className="min-h-0 flex-1">
        <RundownScreen items={snap.items} run={snap.run} full />
      </div>
      {!linked && <p className="mt-2 text-center font-mono text-xs text-engrave">Waiting for the switcher window… keep it open (same browser).</p>}
    </div>
  );
}
