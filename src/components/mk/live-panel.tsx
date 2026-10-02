import { useEffect, useState } from "react";

import { Link } from "@tanstack/react-router";

import type { AdConfig, AdPreset, PipSlot } from "@/lib/mk/fx";
import { engine } from "@/lib/mk/use-switcher";
import type { LiveState } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface LivePanelProps {
  live: LiveState;
  pips: PipSlot[];
  ad: AdConfig;
  presets: AdPreset[];
  adActive: number;
  /** Mapped cam scenes (what PIP can show). */
  scenes: string[];
  connected: boolean;
  busy: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** PIP 1 / PIP 2 scene assignments + Squeeze Merge advertisement picker. Every change goes straight to OBS. */
export function LivePanel({
  live,
  pips,
  ad,
  presets,
  adActive,
  scenes,
  connected,
  busy,
}: LivePanelProps) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !ad.scene) {
      setThumb(null);
      return;
    }
    let alive = true;
    void engine.getScreenshot(ad.scene).then((img) => alive && setThumb(img));
    return () => {
      alive = false;
    };
  }, [connected, ad.scene]);

  const active = presets[adActive] ?? presets[0];
  const lookText =
    ad.look === "frame" ? `FRAME ${ad.anchor.toUpperCase()}` : `STRIP ${ad.layout.toUpperCase()}`;

  return (
    <section
      className="mk-panel flex h-full min-h-0 flex-col gap-1 overflow-y-auto rounded-md p-1.5"
      aria-label="Live FX"
    >
      <div className="flex items-center justify-between">
        <span className="mk-label text-[9px]">Live FX</span>
        <span className={cn("font-mono text-[8px]", live.on ? "text-amber" : "opacity-60")}>
          {live.on ? "LIVE BUS ON AIR" : "DIRECT"}
        </span>
      </div>

      {pips.map((pip, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-1">
          <select
            value={pip.scene ?? ""}
            onChange={(e) => void engine.assignPip(i, e.target.value || null)}
            aria-label={`PIP ${i + 1} scene`}
            className="mk-field h-6 min-w-0 rounded-[3px] px-1 text-[10px]"
          >
            <option value="">PIP {i + 1}: none</option>
            {scenes.map((s) => (
              <option key={s} value={s}>
                PIP {i + 1}: {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="Assign the PVW scene"
            className="mk-button h-6 rounded-[3px] px-1 font-mono text-[8px]"
            onClick={() => void engine.assignPipFromPreview(i)}
          >
            ◀PVW
          </button>
        </div>
      ))}

      <div className="mt-0.5 border-t border-white/10 pt-1">
        <span className="mk-label text-[9px]">Squeeze Merge</span>
        <select
          value={presets.length ? adActive : ""}
          onChange={(e) => void engine.selectAdPreset(Number(e.target.value))}
          disabled={busy || live.sqm}
          title={
            live.sqm
              ? "Take SQZ MERGE out to pick another"
              : "Pick a Squeeze Merge you made in Settings"
          }
          aria-label="Squeeze Merge preset"
          className="mk-field mt-1 h-6 w-full min-w-0 rounded-[3px] px-1 text-[10px]"
        >
          {presets.map((p, i) => (
            <option key={i} value={i}>
              {p.name}
              {p.ad.scene ? ` — ${p.ad.scene}` : " — no ad"}
            </option>
          ))}
        </select>
        <div className="mt-1 flex items-center justify-between gap-1 font-mono text-[8px] opacity-70">
          <span className="min-w-0 truncate">
            {active?.ad.scene ?? "no advertisement"} · {lookText} · {pct(ad.size)}
          </span>
          <Link to="/settings" hash="livefx" className="shrink-0 underline">
            EDIT
          </Link>
        </div>
        {thumb && (
          <img
            src={thumb}
            alt="Advertisement as seen by OBS"
            className="mt-1 h-12 w-full rounded-[3px] object-contain bg-black"
          />
        )}
      </div>
      <p className="font-mono text-[7px] opacity-50">
        Position, size and look of PIPs, DSKs and Squeeze Merge: Settings → Live FX.
      </p>
    </section>
  );
}
