import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { PrompterView } from "@/components/mk/prompter-view";
import { DEFAULT_PROMPTER, PROMPTER_CHANNEL, type PrompterState } from "@/lib/mk/prompter";

export const Route = createFileRoute("/prompter")({
  head: () => ({ meta: [{ title: "Prompter — MK VISION" }] }),
  component: PrompterOutput,
});

/**
 * Teleprompter output. Open it on the prompter screen (drag the window there, press F or
 * double-click for full screen). It mirrors the switcher window; keys here control playback.
 */
function PrompterOutput() {
  const [state, setState] = useState<PrompterState>(DEFAULT_PROMPTER);
  const [linked, setLinked] = useState(false);
  const ch = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(PROMPTER_CHANNEL);
    ch.current = c;
    c.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "state") {
        setState(e.data.state as PrompterState);
        setLinked(true);
      }
    };
    c.postMessage({ type: "hello" });
    return () => {
      c.close();
      ch.current = null;
    };
  }, []);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const send = (cmd: string) => ch.current?.postMessage({ type: "cmd", cmd });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") send("toggle");
      else if (e.key === "ArrowUp") send("back");
      else if (e.key === "ArrowDown") send("fwd");
      else if (e.key === "ArrowRight" || e.key === "+") send("faster");
      else if (e.key === "ArrowLeft" || e.key === "-") send("slower");
      else if (e.key === "Home") send("top");
      else if (e.key === "f" || e.key === "F") fullscreen();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <div className="h-[100dvh] bg-black" style={{ cursor: state.playing ? "none" : "default" }} onDoubleClick={fullscreen}>
      <PrompterView state={state} full onEnd={(em) => ch.current?.postMessage({ type: "ended", em })} />
      {!linked && (
        <p className="pointer-events-none fixed inset-x-0 bottom-4 text-center font-mono text-xs text-white/50">
          Waiting for the switcher window… keep it open (same browser).
        </p>
      )}
    </div>
  );
}
