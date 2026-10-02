import { useEffect, useState } from "react";

import { PlacePicker } from "@/components/mk/place-picker";
import {
  AD_LAYOUTS,
  AD_STYLES,
  ANCHORS,
  ANCHOR_GLYPH,
  DSK_PLACE_SIZES,
  PIP_CORNERS,
  PIP_GLYPH,
  type AdConfig,
  type PlacePos,
} from "@/lib/mk/fx";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { DSK_COUNT } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const PIP_SIZE_CHOICES = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
const AD_SIZE_CHOICES = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fieldClass =
  "h-9 w-full rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="mk-label text-[10px] text-foreground">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Choices<T extends string | number>({
  items,
  value,
  onPick,
  label,
}: {
  items: { id: T; text: string; hint?: string }[];
  value: T;
  onPick: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          title={it.hint}
          onClick={() => onPick(it.id)}
          className={cn(
            "mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]",
            value === it.id && "mk-lit-amber",
          )}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}

/** Settings → Live FX: where PIP 1 / PIP 2 and DSK 1 / DSK 2 sit (picked on a mini screen) and the Squeeze Merge presets. */
export function LiveFxSettings() {
  const state = useSwitcher();
  const { config } = state;
  const [sources, setSources] = useState<{ name: string; kind: "scene" | "input" }[]>([]);
  const connected = state.status === "connected";
  const camScenes = config.camScenes.filter((s): s is string => !!s);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    void engine.listSources().then((list) => alive && setSources(list));
    return () => {
      alive = false;
    };
  }, [connected]);

  const adOptions = sources.filter((s) => !camScenes.includes(s.name));

  return (
    <section id="livefx" className="mk-panel rounded-md p-3 sm:p-4">
      <h2 className="mk-label mb-1 text-foreground">Live FX — PIP, DSK and Squeeze Merge</h2>
      <p className="mb-3 font-mono text-[10px] text-muted-foreground">
        Set everything here once. On the switcher you only press PIP / DSK / SQZ MERGE and pick
        which Squeeze Merge to use from its drop-down. While Squeeze Merge is in, the PIPs and DSKs
        are squeezed together with the picture.
      </p>

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {config.pips.map((pip, i) => (
            <Card key={i} title={`PIP ${i + 1}`}>
              <select
                value={pip.scene ?? ""}
                onChange={(e) => void engine.assignPip(i, e.target.value || null)}
                className={fieldClass}
                aria-label={`PIP ${i + 1} scene`}
              >
                <option value="">— no scene —</option>
                {camScenes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <PlacePicker
                label="Position — tap or drag"
                pos={pip.pos ?? null}
                size={pip.size}
                onChange={(pos: PlacePos) => void engine.setPip(i, { pos })}
              />
              <Choices
                label="PIP size"
                items={PIP_SIZE_CHOICES.map((v) => ({ id: v, text: pct(v) }))}
                value={PIP_SIZE_CHOICES.find((v) => Math.abs(v - pip.size) < 0.01) ?? -1}
                onPick={(size) => void engine.setPip(i, { size })}
              />
              <div className="flex items-center gap-1">
                <span className="mk-label text-[9px]">Or a corner</span>
                {PIP_CORNERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => void engine.setPip(i, { corner: c, pos: null })}
                    className={cn(
                      "mk-button h-6 w-8 rounded-[3px] px-0 font-mono text-[10px]",
                      !pip.pos && pip.corner === c && "mk-lit-amber",
                    )}
                  >
                    {PIP_GLYPH[c]}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: DSK_COUNT }, (_, i) => {
            const d = config.dsks[i];
            const place = d?.place ?? null;
            return (
              <Card
                key={i}
                title={`DSK ${i + 1}${d?.source ? ` — ${d.source}` : ""}`}
                right={
                  place ? (
                    <button
                      type="button"
                      onClick={() => void engine.setDskPlace(i, null)}
                      className="mk-button h-6 rounded-[3px] px-2 font-mono text-[9px]"
                    >
                      RESET
                    </button>
                  ) : undefined
                }
              >
                <PlacePicker
                  label={
                    place
                      ? "Position — tap or drag"
                      : "Not placed: stays where OBS has it. Tap to place."
                  }
                  pos={place ? { x: place.x, y: place.y } : null}
                  size={place?.size ?? 0.3}
                  onChange={(pos) =>
                    void engine.setDskPlace(i, { ...pos, size: place?.size ?? 0.3 })
                  }
                />
                <Choices
                  label="DSK size"
                  items={DSK_PLACE_SIZES.map((v) => ({ id: v, text: pct(v) }))}
                  value={
                    place
                      ? (DSK_PLACE_SIZES.find((v) => Math.abs(v - place.size) < 0.01) ?? -1)
                      : -1
                  }
                  onPick={(size) =>
                    void engine.setDskPlace(i, { x: place?.x ?? 0.5, y: place?.y ?? 0.5, size })
                  }
                />
              </Card>
            );
          })}
        </div>

        <Card
          title="Squeeze Merge presets"
          right={
            <button
              type="button"
              onClick={() => engine.addAdPreset()}
              className="mk-button h-7 rounded-[3px] px-3 font-mono text-[10px]"
            >
              + ADD
            </button>
          }
        >
          <p className="font-mono text-[10px] text-muted-foreground">
            Make as many as you need. On the switcher, Live FX → Squeeze Merge lists them; pick one,
            then press SQZ MERGE.
          </p>
          {config.adPresets.map((p, i) => (
            <PresetCard
              key={i}
              index={i}
              name={p.name}
              ad={p.ad}
              active={i === config.adActive}
              adOptions={adOptions}
              connected={connected}
              canDelete={config.adPresets.length > 1}
            />
          ))}
        </Card>
      </div>
    </section>
  );
}

function PresetCard({
  index,
  name,
  ad,
  active,
  adOptions,
  connected,
  canDelete,
}: {
  index: number;
  name: string;
  ad: AdConfig;
  active: boolean;
  adOptions: { name: string; kind: "scene" | "input" }[];
  connected: boolean;
  canDelete: boolean;
}) {
  const edit = (patch: Partial<AdConfig>) => void engine.editAdPreset(index, patch);
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border p-2",
        active ? "border-amber/60" : "border-white/10",
      )}
    >
      <div className="flex items-center gap-1">
        <input
          value={name}
          onChange={(e) => engine.renameAdPreset(index, e.target.value)}
          className={cn(fieldClass, "flex-1")}
          aria-label="Preset name"
        />
        <button
          type="button"
          disabled={active}
          onClick={() => void engine.selectAdPreset(index)}
          className={cn(
            "mk-button h-9 shrink-0 rounded-[3px] px-2 font-mono text-[9px]",
            active && "mk-lit-amber",
          )}
        >
          {active ? "IN USE" : "USE"}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => void engine.removeAdPreset(index)}
            className="mk-button h-9 shrink-0 rounded-[3px] px-2 font-mono text-[9px]"
            aria-label="Delete preset"
          >
            ✕
          </button>
        )}
      </div>

      <select
        value={ad.scene ?? ""}
        onChange={(e) => edit({ scene: e.target.value || null })}
        className={fieldClass}
        aria-label="Advertisement source"
      >
        <option value="">— advertisement: none —</option>
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
        {ad.scene && !adOptions.some((s) => s.name === ad.scene) && (
          <option value={ad.scene}>
            {ad.scene}
            {connected ? " (not found)" : ""}
          </option>
        )}
      </select>

      <Choices
        label="Look"
        items={[
          {
            id: "frame" as const,
            text: "FRAME",
            hint: "Ad fills the screen behind; the picture shrinks into a spot",
          },
          { id: "strip" as const, text: "STRIP", hint: "Ad is a bar beside the picture" },
        ]}
        value={ad.look}
        onPick={(look) => edit({ look })}
      />

      {ad.look === "frame" ? (
        <div className="flex items-center gap-2">
          <span className="mk-label text-[9px]">Picture sits</span>
          <div
            className="grid grid-cols-3 gap-0.5"
            role="group"
            aria-label="Where the program picture sits"
          >
            {ANCHORS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => edit({ anchor: a })}
                className={cn(
                  "mk-button h-7 w-9 rounded-[2px] px-0 font-mono text-[10px]",
                  ad.anchor === a && "mk-lit-amber",
                )}
              >
                {ANCHOR_GLYPH[a]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Choices
          label="Ad side"
          items={AD_LAYOUTS.map((l) => ({ id: l.id, text: l.label }))}
          value={ad.layout}
          onPick={(layout) => edit({ layout })}
        />
      )}

      <Choices
        label="Ad size"
        items={AD_SIZE_CHOICES.map((v) => ({ id: v, text: pct(v) }))}
        value={AD_SIZE_CHOICES.find((v) => Math.abs(v - ad.size) < 0.01) ?? -1}
        onPick={(size) => edit({ size })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Choices
          label="Motion"
          items={AD_STYLES.map((st) => ({ id: st.id, text: st.label, hint: st.hint }))}
          value={ad.style}
          onPick={(style) => edit({ style })}
        />
        <Choices
          label="Fit or fill"
          items={[
            { id: "fit" as const, text: "FIT", hint: "Whole ad visible" },
            { id: "fill" as const, text: "FILL", hint: "Ad covers its area (cropped)" },
          ]}
          value={ad.fit}
          onPick={(fit) => edit({ fit })}
        />
      </div>
    </div>
  );
}
