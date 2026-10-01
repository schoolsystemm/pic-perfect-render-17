import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { OperatorLink, useOperator } from "@/lib/mk/intercom";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cam")({
  validateSearch: (s: Record<string, unknown>) => ({
    room: typeof s["room"] === "string" ? s["room"] : "",
    cam: Math.max(1, Math.min(8, Number(s["cam"]) || 1)),
  }),
  head: () => ({
    meta: [
      { title: "Camera — MK VISION" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
    ],
  }),
  component: CameraOperator,
});

/** Camera operator screen: scan the QR, tap JOIN. Red = you are on air, green = you are next. Hold TALK to speak to the director. */
function CameraOperator() {
  const { room, cam } = Route.useSearch();
  const [name, setName] = useState("");
  const [lock, setLock] = useState(false);
  const link = useMemo(() => new OperatorLink(room, cam - 1, ""), [room, cam]);
  const s = useOperator(link);
  const joined = s.status !== "idle" && s.status !== "starting";

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("mk-cam-name") : null;
    if (saved) setName(saved);
  }, []);
  useEffect(() => () => link.leave(), [link]);

  if (!room) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black p-6 text-center text-white">
        <p>This link has no room code. Scan the QR code from the director's screen again.</p>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-neutral-950 p-6 text-center text-white">
        <p className="text-sm tracking-[0.3em] text-white/60">MK VISION</p>
        <h1 className="text-6xl font-black tracking-wider">CAM {cam}</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (shown to the director)"
          maxLength={24}
          className="w-full max-w-xs rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center text-base text-white placeholder:text-white/40"
        />
        <button
          type="button"
          disabled={s.status === "starting"}
          onClick={() => {
            const n = name.trim() || `CAM ${cam}`;
            try {
              localStorage.setItem("mk-cam-name", name.trim());
            } catch {
              /* ignore */
            }
            link.setName(n);
            void link.join();
          }}
          className="w-full max-w-xs rounded-xl bg-green-600 py-5 text-2xl font-black tracking-wider active:bg-green-500 disabled:opacity-60"
        >
          {s.status === "starting" ? "STARTING…" : "JOIN"}
        </button>
        <p className="max-w-xs text-xs text-white/50">Tap JOIN and allow the microphone. Keep this screen open while you shoot.</p>
        {s.error && <p className="max-w-xs text-sm text-amber-400">{s.error}</p>}
      </div>
    );
  }

  const bg = s.onAir ? "bg-red-600" : s.next ? "bg-green-600" : "bg-neutral-900";
  const label = s.onAir ? "ON AIR" : s.next ? "NEXT" : "STANDBY";

  return (
    <div className={cn("relative flex h-[100dvh] select-none flex-col text-white transition-colors duration-100", bg)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm font-bold">
        <span className="rounded bg-black/40 px-3 py-1 text-lg">CAM {cam}</span>
        <span className="min-w-0 flex-1 truncate text-center text-white/80">{s.scene ?? ""}</span>
        <span className={cn("rounded px-2 py-1 text-xs", s.status === "online" ? "bg-black/40" : "animate-pulse bg-amber-500 text-black")}>
          {s.status === "online" ? "● CONNECTED" : "RECONNECTING…"}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <div className={cn("text-center font-black tracking-widest", s.onAir ? "animate-pulse text-7xl" : "text-6xl")}>{label}</div>
        {s.dirTalking && (
          <div className="rounded-xl bg-white px-6 py-3 text-2xl font-black text-black shadow-lg">🎙 DIRECTOR TALKING</div>
        )}
      </main>

      <footer className="flex flex-col gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            if (lock) link.setTalk(!s.talking);
            else link.setTalk(true);
          }}
          onPointerUp={() => !lock && link.setTalk(false)}
          onPointerCancel={() => !lock && link.setTalk(false)}
          style={{ touchAction: "none" }}
          className={cn(
            "h-32 w-full rounded-2xl border-4 text-3xl font-black tracking-wider",
            s.talking ? "border-white bg-white text-black" : "border-white/50 bg-black/40 text-white",
          )}
        >
          {s.talking ? "🎙 TALKING…" : lock ? "TAP TO TALK" : "HOLD TO TALK"}
        </button>
        <label className="flex items-center justify-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={lock}
            onChange={(e) => {
              setLock(e.target.checked);
              link.setTalk(false);
            }}
            className="h-5 w-5"
          />
          Lock mic on / off (tap instead of hold)
        </label>
      </footer>
    </div>
  );
}
