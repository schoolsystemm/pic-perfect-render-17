import { useEffect, useState } from "react";

import { AD_LAYOUTS, AD_SIZES, AD_STYLES, ANCHORS, ANCHOR_GLYPH, PIP_CORNERS, PIP_GLYPH, PIP_SIZES, type AdConfig, type PipSlot } from "@/lib/mk/fx";
import { engine } from "@/lib/mk/use-switcher";
import type { LiveState } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface LivePanelProps {
  live: LiveState;
  pips: PipSlot[];
  ad: AdConfig;
  /** Mapped cam scenes (what PIP can show). */
  scenes: string[];
  connected: boolean;
  busy: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** PIP 1 / PIP 2 scene assignments + Squeeze Merge advertisement picker. Every change goes straight to OBS. */
export function LivePanel({ live, pips, ad, scenes, connected, busy }: LivePanelProps) {
  const [sources, setSources] = useState<{ name: string; kind: "scene" | "input" }[]>([]);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    void engine.listSources().then((list) => alive && setSources(list));
    return () => {
      alive = false;
    };
  }, [connected]);

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

  const cam = (list: string[]) => list;
  const adOptions = sources.filter((s) => !scenes.includes(s.name));

  return (
    <section className="mk-panel flex h-full min-h-0 flex-col gap-1 overflow-y-auto rounded-md p-1.5" aria-label="Live FX">
      <div className="flex items-center justify-between">
        <span className="mk-label text-[9px]">Live FX</span>
        <span className={cn("font-mono text-[8px]", live.on ? "text-amber" : "opacity-60")}>{live.on ? "LIVE BUS ON AIR" : "DIRECT"}</span>
      </div>

      {pips.map((pip, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1">
          <select
            value={pip.scene ?? ""}
            onChange={(e) => void engine.assignPip(i, e.target.value || null)}
            aria-label={`PIP ${i + 1} scene`}
            className="mk-field h-6 min-w-0 rounded-[3px] px-1 text-[10px]"
          >
            <option value="">PIP {i + 1}: none</option>
            {cam(scenes).map((s) => (
              <option key={s} value={s}>
                PIP {i + 1}: {s}
              </option>
            ))}
          </select>
          <button type="button" title="Assign the PVW scene" className="mk-button h-6 rounded-[3px] px-1 font-mono text-[8px]" onClick={() => void engine.assignPipFromPreview(i)}>
            ◀PVW
          </button>
          <button
            type="button"
            title="PIP corner"
            className="mk-button h-6 rounded-[3px] px-1 font-mono text-[9px]"
            disabled={busy}
            onClick={() => void engine.setPip(i, { corner: PIP_CORNERS[(PIP_CORNERS.indexOf(pip.corner) + 1) % PIP_CORNERS.length]! })}
          >
            {PIP_GLYPH[pip.corner]}
          </button>
          <button
            type="button"
            title="PIP size"
            className="mk-button h-6 rounded-[3px] px-1 font-mono text-[9px]"
            disabled={busy}
            onClick={() => {
              const k = PIP_SIZES.findIndex((v) => Math.abs(v - pip.size) < 0.01);
              void engine.setPip(i, { size: PIP_SIZES[(k + 1) % PIP_SIZES.length]! });
            }}
          >
            {pct(pip.size)}
          </button>
        </div>
      ))}

      <div className="mt-0.5 border-t border-white/10 pt-1">
        <span className="mk-label text-[9px]">Squeeze Merge advertisement</span>
        <select
          value={ad.scene ?? ""}
          onChange={(e) => void engine.setAd({ scene: e.target.value || null })}
          aria-label="Advertisement source"
          className="mk-field mt-1 h-6 w-full min-w-0 rounded-[3px] px-1 text-[10px]"
        >
          <option value="">Advertisement: none</option>
          {adOptions.some((s) => s.kind === "scene") && (
            <optgroup label="Scenes">
              {adOptions
                .filter((s) => s.kind === "scene")
                .map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          )}
          {adOptions.some((s) => s.kind === "input") && (
            <optgroup label="Image / video / graphic sources">
              {adOptions
                .filter((s) => s.kind === "input")
                .map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          )}
          {ad.scene && !adOptions.some((s) => s.name === ad.scene) && <option value={ad.scene}>{ad.scene}</option>}
        </select>
        <div className="mt-1 grid grid-cols-2 gap-1" role="group" aria-label="Advertisement look">
          {(
            [
              { id: "frame", label: "FRAME", hint: "Ad fills the screen behind the picture; the picture shrinks into a spot (vMix look)" },
              { id: "strip", label: "STRIP", hint: "Ad is a bar beside the picture" },
            ] as const
          ).map((l) => (
            <button
              key={l.id}
              type="button"
              title={l.hint}
              disabled={busy}
              onClick={() => void engine.setAd({ look: l.id })}
              className={cn("mk-button h-6 min-w-0 rounded-[3px] px-0 font-mono text-[8px]", ad.look === l.id && "mk-lit-amber")}
            >
              {l.label}
            </button>
          ))}
        </div>
        {ad.look === "frame" ? (
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-1">
            <div className="grid grid-cols-3 gap-0.5" role="group" aria-label="Where the program picture sits">
              {ANCHORS.map((a) => (
                <button
                  key={a}
                  type="button"
                  title="Program picture position"
                  disabled={busy}
                  onClick={() => void engine.setAd({ anchor: a })}
                  className={cn("mk-button h-5 w-6 min-w-0 rounded-[2px] px-0 font-mono text-[9px]", ad.anchor === a && "mk-lit-amber")}
                >
                  {ANCHOR_GLYPH[a]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-0.5" role="group" aria-label="Transition style">
              {AD_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  title={st.hint}
                  onClick={() => void engine.setAd({ style: st.id })}
                  className={cn("mk-button h-[1.125rem] min-w-0 rounded-[2px] px-0 font-mono text-[8px]", ad.style === st.id && "mk-lit-amber")}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-1 grid grid-cols-4 gap-1" role="group" aria-label="Advertisement layout">
              {AD_LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void engine.setAd({ layout: l.id })}
                  className={cn("mk-button h-6 min-w-0 rounded-[3px] px-0 font-mono text-[8px]", ad.layout === l.id && "mk-lit-amber")}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-4 gap-0.5" role="group" aria-label="Transition style">
              {AD_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  title={st.hint}
                  onClick={() => void engine.setAd({ style: st.id })}
                  className={cn("mk-button h-5 min-w-0 rounded-[2px] px-0 font-mono text-[8px]", ad.style === st.id && "mk-lit-amber")}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-1 grid grid-cols-5 gap-1">
          {AD_SIZES.map((v) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              onClick={() => void engine.setAd({ size: v })}
              className={cn("mk-button h-6 min-w-0 rounded-[3px] px-0 font-mono text-[9px]", Math.abs(ad.size - v) < 0.01 && "mk-lit-amber")}
            >
              {pct(v)}
            </button>
          ))}
          <button
            type="button"
            title="Fit shows the whole ad; Fill covers the area (cropped)"
            disabled={busy}
            onClick={() => void engine.setAd({ fit: ad.fit === "fit" ? "fill" : "fit" })}
            className="mk-button h-6 min-w-0 rounded-[3px] px-0 font-mono text-[8px]"
          >
            {ad.fit.toUpperCase()}
          </button>
        </div>
        {thumb && <img src={thumb} alt="Advertisement as seen by OBS" className="mt-1 h-12 w-full rounded-[3px] object-contain bg-black" />}
      </div>
    </section>
  );
}
