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
  const targetName = s.target === "dir" ? "DIRECTOR" : s.target === "all" ? "EVERYONE" : (s.roster.find((r) => r.id === s.target)?.name ?? "?");
  const chip = (active: boolean, disabled = false) =>
    cn(
      "shrink-0 rounded-lg border-2 px-3 py-2 text-sm font-bold",
      active ? "border-white bg-white text-black" : "border-white/40 bg-black/40 text-white",
      disabled && "opacity-40",
    );

  return (
    <div className={cn("relative flex h-[100dvh] select-none flex-col text-white transition-colors duration-100", bg)}>
      {s.ringing && (
        <div className="absolute inset-0 z-20 flex animate-pulse flex-col items-center justify-center gap-6 bg-amber-500 text-black">
          <div className="text-5xl font-black">📞 DIRECTOR CALLING</div>
          <button type="button" onClick={() => link.answer()} className="rounded-2xl bg-black px-12 py-6 text-3xl font-black text-white">
            ANSWER
          </button>
        </div>
      )}

      <header className="flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm font-bold">
        <span className="rounded bg-black/40 px-3 py-1 text-lg">CAM {cam}</span>
        <span className="min-w-0 flex-1 truncate text-center text-white/80">{s.scene ?? ""}</span>
        <span className={cn("rounded px-2 py-1 text-xs", s.status === "online" ? "bg-black/40" : "animate-pulse bg-amber-500 text-black")}>
          {s.status === "online" ? "● CONNECTED" : "RECONNECTING…"}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4">
        <div className={cn("text-center font-black tracking-widest", s.onAir ? "animate-pulse text-7xl" : "text-6xl")}>{label}</div>
        <div className="flex min-h-[3.5rem] flex-wrap items-center justify-center gap-2">
          {s.hearing.map((h, i) => (
            <div key={i} className="rounded-xl bg-white px-4 py-2 text-lg font-black text-black shadow-lg">
              🎙 {h.cam === -1 ? "DIRECTOR" : h.name} <span className="text-sm font-bold opacity-60">{h.scope === "all" ? "· to everyone" : "· to you"}</span>
            </div>
          ))}
        </div>
      </main>

      <footer className="flex flex-col gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Who you talk to">
          <button type="button" className={chip(s.target === "dir")} onClick={() => link.setTarget("dir")}>
            DIRECTOR
          </button>
          <button type="button" disabled={!s.crew} className={chip(s.target === "all", !s.crew)} onClick={() => link.setTarget("all")}>
            EVERYONE
          </button>
          {s.roster.map((r) => (
            <button key={r.id} type="button" disabled={!s.crew} className={chip(s.target === r.id, !s.crew)} onClick={() => link.setTarget(r.id)}>
              CAM {r.cam + 1} · {r.name}
            </button>
          ))}
        </div>
        {!s.crew && <p className="text-center text-xs text-white/70">The director has switched crew talk off — you can talk to the director only.</p>}

        <button
          type="button"
          disabled={s.muted}
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
            "h-28 w-full rounded-2xl border-4 px-2 text-2xl font-black tracking-wider",
            s.muted ? "border-white/20 bg-black/60 text-white/50" : s.talking ? "border-white bg-white text-black" : "border-white/50 bg-black/40 text-white",
          )}
        >
          {s.muted ? "MUTED BY DIRECTOR" : s.talking ? `🎙 TALKING → ${targetName}` : `${lock ? "TAP" : "HOLD"} TO TALK → ${targetName}`}
        </button>

        <div className="flex items-center justify-between gap-3 text-sm text-white/90">
          <button
            type="button"
            onClick={() => link.callDirector(!s.callingDir)}
            className={cn("rounded-lg border-2 px-3 py-2 font-bold", s.callingDir ? "animate-pulse border-amber-400 bg-amber-500 text-black" : "border-white/40 bg-black/40")}
          >
            {s.callingDir ? "📞 CALLING… (tap to cancel)" : "📞 CALL DIRECTOR"}
          </button>
          <label className="flex items-center gap-1" title="Headset volume">
            🔊
            <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => link.setVolume(+e.target.value)} className="w-24" />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={lock}
              onChange={(e) => {
                setLock(e.target.checked);
                link.setTalk(false);
              }}
              className="h-5 w-5"
            />
            Lock
          </label>
        </div>
      </footer>
    </div>
  );
}
