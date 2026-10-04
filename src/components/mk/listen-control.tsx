import { Volume2, VolumeX } from "lucide-react";

import { listener, resolveListenUrl, useListen } from "@/lib/mk/listen";
import type { MkConfig } from "@/lib/mk/types";
import { engine } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

/** Hear the OBS pre-listen audio on this device. */
export function ListenControl({ config }: { config: MkConfig }) {
  const { status, message } = useListen();
  const on = status !== "off";
  const url = resolveListenUrl(config.listenUrl, config.host);
  const label = status === "live" ? "LIVE" : status === "connecting" ? "…" : status === "error" ? "RETRY" : "OFF";

  return (
    <div className="flex items-center gap-1.5">
      {on && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.listenVolume}
          aria-label="Listen volume"
          className="mk-range w-20"
          onChange={(e) => {
            const v = Number(e.target.value);
            listener.setVolume(v);
            engine.setListen({ listenVolume: v });
          }}
        />
      )}
      {message && <span className="hidden font-mono text-[9px] text-amber xl:block">{message}</span>}
      <button
        type="button"
        onClick={() => (on ? listener.stop() : void listener.start(url, config.listenVolume, { remote: config.listenRemote, extra: config.listenIce }))}
        aria-pressed={on}
        className={cn("mk-button flex h-7 items-center gap-1 rounded-[3px] px-2 text-[9px] tracking-[0.12em]", status === "live" && "mk-lit-program")}
      >
        {on ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
        Pre-listen {label}
      </button>
    </div>
  );
}
