import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { comms, joinUrl, useComms } from "@/lib/mk/intercom";
import { CAM_COUNT, camLabel } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

/** Push-to-talk button: hold to talk, or (lock) tap to switch on / off. */
function TalkButton({
  active,
  lock,
  onChange,
  disabled,
  className,
  children,
}: {
  active: boolean;
  lock: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
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

export function CommsPanel() {
  const c = useComms();
  const [lock, setLock] = useState(false);
  const [qrCam, setQrCam] = useState<number | null>(null);
  const [qr, setQr] = useState("");

  useEffect(() => comms.init(), []);

  const url = qrCam === null ? "" : joinUrl(c.baseUrl, c.room, qrCam);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toDataURL(url, { margin: 1, width: 320 }).then((d) => alive && setQr(d));
    return () => {
      alive = false;
    };
  }, [url]);

  const talkers = c.peers.filter((p) => p.talking);
  const localHost = /^(localhost|127\.|\[::1\])/.test(c.baseUrl.replace(/^https?:\/\//, ""));
  const cams = Array.from({ length: CAM_COUNT }, (_, i) => i).filter(
    (i) => !!c.tally.scenes[i] || c.peers.some((p) => p.cam === i),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        {c.running ? (
          <>
            <span className="mk-lit-preview rounded-[3px] px-1.5 py-[2px] font-mono text-[9px]">● LIVE · room {c.room}</span>
            <TalkButton active={c.talk === "all"} lock={lock} onChange={(on) => comms.setTalk(on ? "all" : "off")} className="h-[22px] px-3">
              TALK ALL
            </TalkButton>
            <label className="mk-label flex items-center gap-1 text-[8px]" title="Tap to switch the mic on / off instead of holding">
              <input type="checkbox" checked={lock} onChange={(e) => (setLock(e.target.checked), comms.setTalk("off"))} />
              LOCK
            </label>
            <button type="button" className="mk-button ml-auto h-[22px] rounded-[3px] px-2 text-[9px]" onClick={() => comms.stop()}>
              STOP
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={c.starting}
              className="mk-button mk-lit-program h-[22px] rounded-[3px] px-3 text-[10px] font-bold"
              onClick={() => void comms.start()}
            >
              {c.starting ? "STARTING…" : "START COMMS"}
            </button>
            <span className="mk-label text-[8px]">Tally + instant talk for your camera operators</span>
            <button type="button" className="mk-button ml-auto h-[22px] rounded-[3px] px-2 text-[9px]" title="Make a new room code (old QR codes stop working)" onClick={() => comms.newRoomCode()}>
              NEW ROOM
            </button>
          </>
        )}
      </div>

      {c.error && <p className="rounded-[3px] bg-amber/20 px-1.5 py-[2px] text-[9px] text-amber">{c.error}</p>}

      {c.running && (
        <p className={cn("h-3 truncate font-mono text-[9px]", talkers.length ? "animate-pulse text-amber" : "text-muted-foreground")}>
          {talkers.length ? `🎙 TALKING: ${talkers.map((p) => `${camLabel(p.cam)} · ${p.name}`).join(", ")}` : "quiet"}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-[3px] overflow-y-auto">
        {cams.length === 0 && <p className="mk-label py-3 text-center text-[9px]">Map your cameras in Settings to see them here.</p>}
        {cams.map((i) => {
          const onAir = c.tally.pgm.includes(i);
          const next = c.tally.pvw.includes(i);
          const ops = c.peers.filter((p) => p.cam === i);
          const speaking = ops.filter((p) => p.talking);
          return (
            <div key={i} className="grid grid-cols-[auto_5.5rem_1fr_auto_auto] items-center gap-1 rounded-[3px] bg-black/20 px-1 py-[2px]">
              <span className={cn("h-3 w-3 rounded-full border border-white/20", onAir ? "bg-program shadow-[var(--glow-program)]" : next ? "bg-preview" : "bg-led-off")} title={onAir ? "ON AIR" : next ? "NEXT" : "idle"} />
              <span className="min-w-0 truncate text-[10px] font-bold leading-none">
                {camLabel(i)}
                <span className="block truncate font-mono text-[7px] font-normal opacity-70">{c.tally.scenes[i] ?? "no scene"}</span>
              </span>
              <span className={cn("min-w-0 truncate font-mono text-[9px]", speaking.length ? "animate-pulse font-bold text-amber" : ops.length ? "text-foreground" : "text-muted-foreground")}>
                {speaking.length ? `🎙 ${speaking.map((p) => p.name).join(", ")}` : ops.length ? `● ${ops.map((p) => p.name).join(", ")}` : "no operator"}
              </span>
              <TalkButton active={c.talk === i} lock={lock} disabled={!c.running} onChange={(on) => comms.setTalk(on ? i : "off")} className="h-5">
                TALK
              </TalkButton>
              <button type="button" className="mk-button h-5 rounded-[3px] px-1.5 text-[9px]" title="Show the QR code for this camera" onClick={() => setQrCam(i)}>
                QR
              </button>
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
            <input
              value={c.baseUrl}
              onChange={(e) => comms.setBaseUrl(e.target.value.trim())}
              className="mk-field w-full rounded-[3px] px-2 py-1 font-mono text-[11px]"
            />
          </label>
          {localHost && (
            <p className="text-xs text-amber">
              Phones cannot open "localhost". Open this app from your https address (the published site), or type that address above.
            </p>
          )}
          {!c.running && <p className="text-xs text-amber">Press START COMMS first, or the phone will wait for the director.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
