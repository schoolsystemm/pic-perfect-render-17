import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";

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
  /** Panel menu buttons, shown next to the logo. */
  menus?: ReactNode;
  /** Pre-listen control. */
  listen?: ReactNode;
}

export function StatusBar({ status, statusMessage, demo, menus, listen }: StatusBarProps) {
  return (
    <header className="mk-chassis flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
      <h1 className="shrink-0 text-base leading-none font-bold tracking-[0.22em] text-foreground">MK VISION</h1>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">{menus}</div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {listen}
        {demo && (
          <span className="mk-lit-amber rounded-[3px] px-2 py-1 text-[9px] leading-none font-bold tracking-[0.16em] uppercase">
            Demo Mode
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "connected" && "bg-preview shadow-[0_0_6px_var(--color-preview)]",
              status === "connecting" && "animate-pulse bg-amber",
              status === "disconnected" && "bg-led-off",
              status === "error" && "bg-program",
            )}
          />
          <span className="mk-label hidden text-[9px] whitespace-nowrap md:block">
            {demo && status === "connected" ? "DEMO ACTIVE" : STATUS_TEXT[status]}
            {statusMessage && !demo ? ` · ${statusMessage}` : ""}
          </span>
        </div>
        <Link to="/settings" className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]" aria-label="Settings">
          <Settings className="h-3.5 w-3.5" />
        </Link>
        <span className="mk-label hidden text-[8px] lg:block">By Konchella</span>
      </div>
    </header>
  );
}
