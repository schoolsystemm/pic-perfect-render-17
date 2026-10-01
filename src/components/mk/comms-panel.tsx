import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { comms, joinUrl, useComms, type CommsPeer, type TalkTarget } from "@/lib/mk/intercom";
import { CAM_COUNT, camLabel } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

/** Push-to-talk button: hold to talk, or (lock) tap to switch on / off. */
function TalkButton({
  active,
  lock,
  onChange,
  disabled,
  className,
  title,
  children,
}: {
  active: boolean;
  lock: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onChange(lock ? !active : true);
      }}
      onPointerUp={() => !lock && active && onChange(false)}
      onPointerCancel={() => !lock && active && onChange(false)}
      style={{ touchAction: "none" }}
      className={cn("mk-button rounded-[3px] px-2 text-[9px] font-bold", active && "mk-lit-amber", className)}
    >
      {children}
    </button>
  );
}

const same = (talk: TalkTarget, ids: string[]) => Array.isArray(talk) && ids.length > 0 && talk.length === ids.length && ids.every((id) => talk.includes(id));

export function CommsPanel() {
  const c = useComms();
  const [lock, setLock] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [qrCam, setQrCam] = useState<number | null>(null);
  const [qr, setQr] = useState("");

  useEffect(() => comms.init(), []);
  // Forget selected operators who left.
  useEffect(() => setSel((s) => (s.every((id) => c.peers.some((p) => p.id === id)) ? s : s.filter((id) => c.peers.some((p) => p.id === id)))), [c.peers]);

  const url = qrCam === null ? "" : joinUrl(c.baseUrl, c.room, qrCam);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toDataURL(url, { margin: 1, width: 320 }).then((d) => alive && setQr(d));
    return () => {
      alive = false;
    };
  }, [url]);

  const nameOf = (id: string) => c.peers.find((p) => p.id === id)?.name ?? "?";
  const toLabel = (p: CommsPeer) => (p.to === "dir" ? "DIRECTOR" : p.to === "all" ? "EVERYONE" : nameOf(p.to));
  const talkers = c.peers.filter((p) => p.talking && !p.muted);
  const localHost = /^(localhost|127\.|\[::1\])/.test(c.baseUrl.replace(/^https?:\/\//, ""));
  const cams = Array.from({ length: CAM_COUNT }, (_, i) => i).filter((i) => !!c.tally.scenes[i] || c.peers.some((p) => p.cam === i));
  const toggleSel = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const youTalking =
    c.talk === "all" ? "everyone" : Array.isArray(c.talk) && c.talk.length ? c.talk.map(nameOf).join(", ") : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {c.running ? (
          <>
            <span className="mk-lit-preview rounded-[3px] px-1.5 py-[2px] font-mono text-[9px]">● LIVE · {c.room}</span>
            <TalkButton active={c.talk === "all"} lock={lock} onChange={(on) => comms.setTalk(on ? "all" : "off")} className="h-[22px] px-3" title="Talk to everyone (hold, or press and hold the T key)">
              TALK ALL
            </TalkButton>
            {sel.length > 0 && (
              <TalkButton active={same(c.talk, sel)} lock={lock} onChange={(on) => comms.setTalk(on ? sel : "off")} className="h-[22px]" title="Talk to the ticked operators only">
                TALK SELECTED ({sel.length})
              </TalkButton>
            )}
            <label className="mk-label flex items-center gap-1 text-[8px]" title="Tap to switch the mic on / off instead of holding">
              <input type="checkbox" checked={lock} onChange={(e) => (setLock(e.target.checked), comms.setTalk("off"))} />
              LOCK
            </label>
            <button
              type="button"
              aria-pressed={c.crew}
              onClick={() => comms.setCrew(!c.crew)}
              title="Let operators talk to each other (off = operators can only talk to you)"
              className={cn("mk-button h-[22px] rounded-[3px] px-2 text-[9px]", c.crew && "mk-lit-preview")}
            >
              CREW LINE {c.crew ? "ON" : "OFF"}
            </button>
            <label className="mk-label flex items-center gap-1 text-[8px]" title="Your headphone volume for the crew">
              VOL
              <input type="range" min={0} max={1} step={0.05} value={c.monitor} onChange={(e) => comms.setMonitor(+e.target.value)} className="h-3 w-14 accent-amber" />
            </label>
            <button type="button" className="mk-button ml-auto h-[22px] rounded-[3px] px-2 text-[9px]" onClick={() => comms.stop()}>
              STOP
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={c.starting} className="mk-button mk-lit-program h-[22px] rounded-[3px] px-3 text-[10px] font-bold" onClick={() => void comms.start()}>
              {c.starting ? "STARTING…" : "START COMMS"}
            </button>
            <span className="mk-label text-[8px]">Tally + two-way talk with your camera operators</span>
            <button type="button" className="mk-button ml-auto h-[22px] rounded-[3px] px-2 text-[9px]" title="Make a new room code (old QR codes stop working)" onClick={() => comms.newRoomCode()}>
              NEW ROOM
            </button>
          </>
        )}
      </div>

      {c.error && <p className="rounded-[3px] bg-amber/20 px-1.5 py-[2px] text-[9px] text-amber">{c.error}</p>}

      {c.running && (
        <p className={cn("h-3 truncate font-mono text-[9px]", youTalking || talkers.length ? "text-amber" : "text-muted-foreground")}>
          {youTalking ? `🎙 YOU → ${youTalking}` : talkers.length ? `🎙 ${talkers.map((p) => `${p.name} → ${toLabel(p)}`).join("  ·  ")}` : "quiet"}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {cams.length === 0 && <p className="mk-label py-3 text-center text-[9px]">Map your cameras in Settings to see them here.</p>}
        {cams.map((i) => {
          const onAir = c.tally.pgm.includes(i);
          const next = c.tally.pvw.includes(i);
          const ops = c.peers.filter((p) => p.cam === i);
          const ids = ops.map((p) => p.id);
          return (
            <div key={i} className="rounded-[3px] bg-black/20 px-1 py-[2px]">
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-1">
                <span className={cn("h-3 w-3 rounded-full border border-white/20", onAir ? "bg-program shadow-[var(--glow-program)]" : next ? "bg-preview" : "bg-led-off")} title={onAir ? "ON AIR" : next ? "NEXT" : "idle"} />
                <span className="min-w-0 truncate text-[10px] font-bold leading-none">
                  {camLabel(i)} <span className="font-mono text-[8px] font-normal opacity-70">{c.tally.scenes[i] ?? "no scene"}</span>
                  {ops.length === 0 && <span className="ml-1 font-mono text-[8px] font-normal text-muted-foreground">no operator</span>}
                </span>
                {ops.length > 0 && (
                  <TalkButton active={same(c.talk, ids)} lock={lock} disabled={!c.running} onChange={(on) => comms.setTalk(on ? ids : "off")} className="h-5" title="Talk to everyone on this camera">
                    TALK CAM
                  </TalkButton>
                )}
                <button type="button" className="mk-button h-5 rounded-[3px] px-1.5 text-[9px]" title="QR code for this camera" onClick={() => setQrCam(i)}>
                  QR
                </button>
              </div>
              {ops.map((p) => (
                <div key={p.id} className="mt-[2px] grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-1 pl-4">
                  <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggleSel(p.id)} title="Tick to talk to several operators at once" />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate font-mono text-[9px] leading-tight",
                        p.calling ? "animate-pulse font-bold text-amber" : p.talking && !p.muted ? "font-bold text-amber" : p.muted ? "text-program" : "text-foreground",
                      )}
                    >
                      {p.calling ? `📞 ${p.name} IS CALLING` : p.talking && !p.muted ? `🎙 ${p.name} → ${toLabel(p)}` : p.muted ? `${p.name} (muted)` : p.ringing ? `${p.name} · ringing…` : `● ${p.name}`}
                    </span>
                    <span className="block h-[3px] overflow-hidden rounded-full bg-led-off">
                      <span className="block h-full bg-amber transition-[width] duration-100" style={{ width: `${Math.round(p.level * 100)}%` }} />
                    </span>
                  </span>
                  {p.calling ? (
                    <button type="button" className="mk-button mk-lit-amber h-5 rounded-[3px] px-1.5 text-[8px]" onClick={() => comms.clearCall(p.id)} title="Clear the call light">
                      OK
                    </button>
                  ) : (
                    <button type="button" aria-pressed={p.ringing} className={cn("mk-button h-5 rounded-[3px] px-1.5 text-[8px]", p.ringing && "mk-lit-amber")} onClick={() => comms.ring(p.id, !p.ringing)} title="Ring their phone (flash + beep) until they answer">
                      RING
                    </button>
                  )}
                  <button type="button" aria-pressed={p.muted} className={cn("mk-button h-5 rounded-[3px] px-1.5 text-[8px]", p.muted && "mk-lit-program")} onClick={() => comms.setMuted(p.id, !p.muted)} title="Silence this operator for everyone">
                    MUTE
                  </button>
                  <button type="button" aria-pressed={p.crew} className={cn("mk-button h-5 rounded-[3px] px-1.5 text-[8px]", p.crew && c.crew && "mk-lit-preview")} onClick={() => comms.setPeerCrew(p.id, !p.crew)} title="May this operator talk to the other operators?">
                    CREW
                  </button>
                  <TalkButton active={same(c.talk, [p.id])} lock={lock} disabled={!c.running} onChange={(on) => comms.setTalk(on ? [p.id] : "off")} className="h-5" title={`Talk to ${p.name} only (private)`}>
                    TALK
                  </TalkButton>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={qrCam !== null} onOpenChange={(open) => !open && setQrCam(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{qrCam !== null ? camLabel(qrCam) : ""} — scan to join</DialogTitle>
            <DialogDescription>The operator scans this with their phone camera, taps JOIN and allows the mic.</DialogDescription>
          </DialogHeader>
          {qr && <img src={qr} alt="QR code" className="mx-auto h-64 w-64 rounded bg-white p-2" />}
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mk-field w-full rounded-[3px] px-2 py-1 font-mono text-[10px]" />
          <label className="grid gap-1 text-xs">
            Address phones use to reach this app
            <input value={c.baseUrl} onChange={(e) => comms.setBaseUrl(e.target.value.trim())} className="mk-field w-full rounded-[3px] px-2 py-1 font-mono text-[11px]" />
          </label>
          {localHost && <p className="text-xs text-amber">Phones cannot open "localhost". Open this app from your https address (the published site), or type that address above.</p>}
          {!c.running && <p className="text-xs text-amber">Press START COMMS first, or the phone will wait for the director.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
