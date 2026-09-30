import { Link } from "@tanstack/react-router";

import type { ConnectionStatus } from "@/lib/mk/types";

export function ReconnectOverlay({ status, message, demo, onRetry }: { status: ConnectionStatus; message: string; demo: boolean; onRetry: () => void }) {
  if (demo || (status !== "error" && status !== "connecting")) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center px-3">
      <div className="mk-panel pointer-events-auto flex items-center gap-3 rounded-md border-amber px-3 py-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber" />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-[0.15em] text-foreground">
            {status === "connecting" ? "CONNECTING TO OBS…" : "RECONNECTING…"}
          </span>
          {message && <span className="mk-label text-[9px]">{message}</span>}
        </div>
        <button type="button" onClick={onRetry} className="mk-button h-8 rounded-sm px-2 text-[10px]">Retry</button>
        <Link to="/settings" className="mk-button flex h-8 items-center rounded-sm px-2 text-[10px]">Settings</Link>
      </div>
    </div>
  );
}
