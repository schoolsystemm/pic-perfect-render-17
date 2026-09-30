import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import {
  CAM_COUNT,
  DSK_COUNT,
  MONITOR_FPS_OPTIONS,
  TRANSITION_DURATIONS,
  camLabel,
} from "@/lib/mk/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MK VISION" },
      {
        name: "description",
        content:
          "Configure the OBS WebSocket connection, CAM 1–8 scene mapping, DSK source, transition and keyboard shortcuts for MK VISION.",
      },
      { property: "og:title", content: "Settings — MK VISION" },
      {
        property: "og:description",
        content: "OBS connection, source mapping, DSK, transition and keyboard setup.",
      },
    ],
  }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mk-panel rounded-md p-3 sm:p-4">
      <h2 className="mk-label mb-3 text-foreground">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

const fieldClass =
  "h-10 w-full rounded-sm border border-border bg-input px-2 font-mono text-sm text-foreground outline-none focus:border-ring";

function DskSourceField({
  index,
  scene,
  fallbackScene,
  value,
}: {
  index: number;
  scene: string;
  fallbackScene: string;
  value: string;
}) {
  const [items, setItems] = useState<string[]>([]);
  const target = scene || fallbackScene;
  useEffect(() => {
    let off = false;
    if (!target) {
      setItems([]);
      return;
    }
    void engine.getSceneItems(target).then((list) => {
      if (!off) setItems(list);
    });
    return () => {
      off = true;
    };
  }, [target]);

  if (items.length === 0) {
    return (
      <input
        className={fieldClass}
        value={value}
        placeholder={index === 0 ? "Lower Third" : "Logo Bug"}
        onChange={(e) => engine.setDskTarget(index, { source: e.target.value })}
      />
    );
  }
  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(e) => engine.setDskTarget(index, { source: e.target.value })}
    >
      <option value="">— none —</option>
      {items.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      {value && !items.includes(value) && <option value={value}>{value} (not in scene)</option>}
    </select>
  );
}

function SettingsPage() {
  const state = useSwitcher();
  const { config } = state;
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port));
  const [password, setPassword] = useState(config.password);

  const sceneOptions = state.scenes;

  return (
    <div className="mk-chassis min-h-[100dvh] pb-10">
      <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
        <Link
          to="/"
          className="mk-button flex h-9 items-center gap-2 rounded-sm px-3 text-xs"
          aria-label="Back to switcher"
        >
          <ArrowLeft className="h-4 w-4" /> Switcher
        </Link>
        <h1 className="text-base tracking-[0.2em] text-foreground">SETTINGS</h1>
        <span className="mk-label ml-auto text-[9px]">By Konchella</span>
      </header>

      <div className="mx-auto grid max-w-3xl gap-3 p-3">
        <Section title="OBS Connection">
          <label className="grid gap-1">
            <span className="mk-label">Host / IP</span>
            <input
              className={fieldClass}
              value={host}
              placeholder="192.168.1.100"
              onChange={(e) => setHost(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="mk-label">Port</span>
              <input
                className={fieldClass}
                value={port}
                inputMode="numeric"
                onChange={(e) => setPort(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="mk-label">Password</span>
              <input
                className={fieldClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Stored on this device only. Never sent to any server.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="mk-button h-11 rounded-sm px-4 text-sm text-foreground"
              onClick={() => {
                engine.setConnectionSettings({
                  host: host.trim(),
                  port: Number(port) || 4455,
                  password,
                });
                void engine.setDemoMode(false);
                void engine.connect();
              }}
            >
              Connect to OBS
            </button>
            <button
              type="button"
              className="mk-button h-11 rounded-sm px-4 text-sm"
              onClick={() => void engine.disconnect()}
            >
              Disconnect
            </button>
            <button
              type="button"
              className={`mk-button h-11 rounded-sm px-4 text-sm ${state.demo ? "mk-lit-amber" : ""}`}
              onClick={() => void engine.setDemoMode(!state.demo)}
            >
              Demo Mode {state.demo ? "On" : "Off"}
            </button>
            <label className="mk-button flex h-11 items-center gap-2 rounded-sm px-3 text-xs">
              <input
                type="checkbox"
                checked={config.autoConnect}
                onChange={(e) => engine.setAutoConnect(e.target.checked)}
              />
              Auto connect
            </label>
          </div>
          {!state.demo && !state.studioMode && state.status === "connected" && (
            <p className="font-mono text-[10px] text-amber">
              Studio Mode is off in OBS — Preview and T-Bar need it enabled.
            </p>
          )}
        </Section>

        <Section title="Source Mapping">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="mk-button h-9 rounded-sm px-3 text-xs"
              onClick={() => engine.autoMapScenes()}
            >
              Auto map first 8 scenes
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: CAM_COUNT }, (_, index) => (
              <label key={index} className="flex items-center gap-2">
                <span className="mk-label w-14 shrink-0">{camLabel(index)}</span>
                <select
                  className={fieldClass}
                  value={config.camScenes[index] ?? ""}
                  onChange={(e) => engine.mapCam(index, e.target.value || null)}
                >
                  <option value="">— none —</option>
                  {sceneOptions.map((scene) => (
                    <option key={scene} value={scene}>
                      {scene}
                    </option>
                  ))}
                  {config.camScenes[index] &&
                    !sceneOptions.includes(config.camScenes[index]!) && (
                      <option value={config.camScenes[index]!}>
                        {config.camScenes[index]} (offline)
                      </option>
                    )}
                </select>
              </label>
            ))}
          </div>
        </Section>

        <Section title="DSK (Downstream Keyers)">
          {Array.from({ length: DSK_COUNT }, (_, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="mk-label">DSK {i + 1} — scene containing graphics</span>
                <select
                  className={fieldClass}
                  value={config.dsks[i]?.scene ?? ""}
                  onChange={(e) => engine.setDskTarget(i, { scene: e.target.value })}
                >
                  <option value="">— current program —</option>
                  {sceneOptions.map((scene) => (
                    <option key={scene} value={scene}>
                      {scene}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="mk-label">DSK {i + 1} — source name</span>
                <DskSourceField
                  index={i}
                  scene={config.dsks[i]?.scene ?? ""}
                  fallbackScene={state.programScene ?? ""}
                  value={config.dsks[i]?.source ?? ""}
                />
              </label>
            </div>
          ))}
          {config.dsks[0]?.source &&
            config.dsks[0].source === config.dsks[1]?.source &&
            config.dsks[0].scene === config.dsks[1]?.scene && (
              <p className="font-mono text-[10px] text-amber">
                DSK 1 and DSK 2 are set to the same source — pick a different one for DSK 2.
              </p>
            )}
          <p className="font-mono text-[10px] text-muted-foreground">
            Each DSK toggles its own source. The source must exist as an item inside the chosen scene. With “current program” it must exist in every
            camera scene.
          </p>
        </Section>

        <Section title="Monitors (real video)">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`mk-button h-11 rounded-sm px-4 text-sm ${config.liveVideo ? "mk-lit-preview" : ""}`}
              onClick={() => engine.setLiveVideo(!config.liveVideo)}
            >
              Live video {config.liveVideo ? "On" : "Off"}
            </button>
            <label className="flex items-center gap-2">
              <span className="mk-label">Refresh</span>
              <select
                className={`${fieldClass} w-28`}
                value={config.monitorFps}
                onChange={(e) => engine.setMonitorFps(Number(e.target.value))}
              >
                {MONITOR_FPS_OPTIONS.map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} fps
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Frames come from OBS screenshots over the WebSocket. Lower the rate on slow Wi-Fi.
          </p>
        </Section>

        <Section title="Transition">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="mk-label">Transition</span>
              <select
                className={fieldClass}
                value={config.transition}
                onChange={(e) => void engine.setTransition(e.target.value)}
              >
                {(state.transitions.length
                  ? state.transitions
                  : ["Cut", "Fade", "Fade to Color", "Swipe"]
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="mk-label">Duration</span>
              <select
                className={fieldClass}
                value={config.transitionDuration}
                onChange={(e) => void engine.setTransitionDuration(Number(e.target.value))}
              >
                {TRANSITION_DURATIONS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms} ms
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        <Section title="Keyboard">
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="flex items-center gap-2">
              <span className="mk-label w-20">Cut</span>
              <input
                className={fieldClass}
                value={config.shortcuts.cut}
                maxLength={1}
                onChange={(e) =>
                  engine.setShortcuts({ ...config.shortcuts, cut: e.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="mk-label w-20">Auto Take</span>
              <input
                className={fieldClass}
                value={config.shortcuts.autoTake === " " ? "SPACE" : config.shortcuts.autoTake}
                onChange={(e) =>
                  engine.setShortcuts({
                    ...config.shortcuts,
                    autoTake: e.target.value.toUpperCase() === "SPACE" ? " " : e.target.value,
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="mk-label w-20">DSK 1</span>
              <input
                className={fieldClass}
                value={config.shortcuts.dsk}
                maxLength={1}
                onChange={(e) =>
                  engine.setShortcuts({ ...config.shortcuts, dsk: e.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="mk-label w-20">DSK 2</span>
              <input
                className={fieldClass}
                value={config.shortcuts.dsk2}
                maxLength={1}
                onChange={(e) =>
                  engine.setShortcuts({ ...config.shortcuts, dsk2: e.target.value })
                }
              />
            </label>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Keys 1–8 select CAM 1–8 on Preview.
          </p>
        </Section>
      </div>
    </div>
  );
}
