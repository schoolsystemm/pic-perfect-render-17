// Pre-listen bridge check: asks the MediaMTX server on the OBS PC (Control API, port 9997) what it can see,
// so Settings can say exactly which step is missing. Works from any PC / phone on the same network.
import { isMixedContentBlocked, resolveListenUrl } from "./listen";

export interface BridgeRow {
  label: string;
  ok: boolean;
  /** What to do when this step is not OK. */
  fix?: string;
}

export interface BridgeReport {
  rows: BridgeRow[];
  /** True when every step is OK. */
  ready: boolean;
  /** One line telling the operator what is next. */
  next: string;
}

interface PathItem {
  name?: string;
  ready?: boolean;
  readers?: unknown[];
}

export function bridgeHost(saved: string, obsHost: string): string {
  const url = resolveListenUrl(saved, obsHost);
  try {
    return url ? new URL(url).hostname : obsHost;
  } catch {
    return obsHost;
  }
}

export async function checkBridge(saved: string, obsHost: string): Promise<BridgeReport> {
  const host = bridgeHost(saved, obsHost);
  const rows: BridgeRow[] = [];
  const done = (next: string): BridgeReport => ({ rows, ready: rows.every((r) => r.ok), next });

  if (!host) return done("Enter the OBS host in Settings > OBS Connection first.");

  const api = `http://${host}:9997/v3/paths/list`;
  if (isMixedContentBlocked(api)) {
    rows.push({
      label: "Can check from this page",
      ok: false,
      fix: "This page is https, the check is http. Open MK over http on the network, or just press Listen: it says LIVE when audio arrives.",
    });
    return done("Press Listen on the switcher to test.");
  }

  let items: PathItem[] | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(api, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) items = ((await r.json()) as { items?: PathItem[] }).items ?? [];
  } catch {
    /* unreachable */
  }
  if (!items) {
    rows.push({
      label: `MediaMTX answers on ${host}`,
      ok: false,
      fix: "On the OBS PC run audio-bridge\\MK-Setup.bat (it installs and starts everything). Same network? Firewall ports are opened by that script.",
    });
    return done("Run MK-Setup.bat on the OBS PC.");
  }
  rows.push({ label: `MediaMTX answers on ${host}`, ok: true });

  const raw = items.find((p) => p.name === "raw");
  const mk = items.find((p) => p.name === "mk");
  rows.push({
    label: "OBS is sending Track 2 (Aitum output)",
    ok: Boolean(raw?.ready),
    fix: "In Aitum Multistream start the pre-listen output (rtmp://127.0.0.1:1935, key raw, audio Track 2 only).",
  });
  const ffmpegRow: BridgeRow = { label: "Converted to Opus for phones (ffmpeg)", ok: Boolean(mk?.ready) };
  if (raw?.ready) ffmpegRow.fix = "ffmpeg is not running: close MediaMTX and run MK-Setup.bat again.";
  rows.push(ffmpegRow);
  const readers = mk?.readers?.length ?? 0;
  rows.push({ label: `Listeners now: ${readers}`, ok: true });

  const bad = rows.find((r) => !r.ok);
  return done(bad ? (bad.fix ?? "Fix the red line.") : "Ready. Press Listen on the switcher.");
}
