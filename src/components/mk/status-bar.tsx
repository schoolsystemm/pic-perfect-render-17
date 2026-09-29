import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import type { ConnectionStatus } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connected: "OBS CONNECTED",
  connecting: "CONNECTING",
  disconnected: "OBS DISCONNECTED",
  error: "CONNECTION ERROR",
};

interface StatusBarProps {
  status: ConnectionStatus;
  statusMessage: string;
  demo: boolean;
}

export function StatusBar({ status, statusMessage, demo }: StatusBarProps) {
  return (
    <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
      <div className="min-w-0">
        <h1 className="truncate text-lg leading-none font-bold tracking-[0.22em] text-foreground sm:text-xl">
          MK VISION
        </h1>
        <p className="mk-label hidden text-[9px] sm:block">Professional Live Production Control</p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {demo && (
          <span className="mk-lit-amber rounded-sm px-2 py-1 text-[10px] font-bold tracking-[0.16em] uppercase">
            Demo Mode
          </span>
        )}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              status === "connected" && "bg-preview mk-tally-program shadow-none",
              status === "connecting" && "bg-amber animate-pulse",
              status === "disconnected" && "bg-led-off",
              status === "error" && "bg-program",
            )}
          />
          <span className="mk-label text-[10px] whitespace-nowrap">
            {demo && status === "connected" ? "DEMO ACTIVE" : STATUS_TEXT[status]}
            {statusMessage && !demo ? ` · ${statusMessage}` : ""}
          </span>
        </div>
        <Link
          to="/settings"
          className="mk-button flex h-9 w-9 items-center justify-center rounded-sm"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
      <span className="mk-label ml-1 hidden text-[9px] lg:block">By Konchella</span>
    </header>
  );
}
