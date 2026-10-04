import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { LiveFxSettings } from "@/components/mk/live-fx-settings";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { GFX_SCENE } from "@/lib/mk/graphics";
import { resolveListenUrl } from "@/lib/mk/listen";
import type { OutputCheckRow } from "@/lib/mk/types";
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


/** Check / fix / restore the OBS Recording output that feeds pre-listen. */
function PrelistenOutput({ connected }: { connected: boolean }) {
  const [rows, setRows] = useState<OutputCheckRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (job: () => Promise<OutputCheckRow[] | null>) => {
    setBusy(true);
    setRows(await job());
    setBusy(false);
  };
  const btn = "mk-button h-9 rounded-sm px-3 text-xs";
  return (
    <div className="grid gap-2 rounded-sm border border-border p-2">
      <span className="mk-label">OBS pre-listen output (Recording tab to MediaMTX)</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!connected || busy} className={btn} onClick={() => void run(() => engine.checkPrelistenOutput(false))}>
          CHECK
        </button>
        <button type="button" disabled={!connected || busy} className={`${btn} mk-lit-amber`} onClick={() => void run(() => engine.checkPrelistenOutput(true))}>
          SET UP IN OBS
        </button>
        <button type="button" disabled={!connected || busy} className={btn} onClick={() => void run(() => engine.restorePrelistenOutput())}>
          RESTORE MY OLD SETTINGS
        </button>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">
        SET UP IN OBS writes: Recording = Custom Output (FFmpeg) to rtsp://127.0.0.1:8554/mk, audio Track 2 only. That uses
        OBS&apos;s Recording slot, so normal file recording stops while it is set. RESTORE puts back what was there before.
        Press REC in OBS (or in MK) to start the feed.
      </p>
      {!connected && <p className="font-mono text-[10px] text-amber">Connect to OBS first.</p>}
      {rows && (
        <ul className="grid gap-0.5 font-mono text-[10px]">
          {rows.map((r) => (
            <li key={r.label} className={r.ok ? "text-preview" : "text-amber"}>
              {r.ok ? (r.fixed ? "FIXED" : "OK   ") : r.manual ? "DO IN OBS" : "WRONG"} · {r.label}
              {!r.ok && ` (now: ${r.actual}, want: ${r.expected})`}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  // MK Graphics is always pickable for a DSK, even before it exists in OBS.
  const dskSceneOptions = sceneOptions.includes(GFX_SCENE) ? sceneOptions : [...sceneOptions, GFX_SCENE];

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
                  {dskSceneOptions.map((scene) => (
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
            Each DSK toggles its own source. Pick “MK Graphics” as the scene to put the built-in graphics (logo, lower third,
            ticker, clock, badge) on that DSK, then choose the layer in the source dropdown. Design them on the Graphics page.
          </p>
        </Section>

        <LiveFxSettings />

        <Section title="Graphics">
          <Link to="/graphics" className="mk-button flex h-11 w-fit items-center rounded-sm px-4 text-sm text-foreground">
            Open Graphics studio
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground">
            Design the logo, lower third, ticker, clock and badge on their own page, pick the one scene they
            belong to, and press Save.
          </p>
        </Section>

        <Section title="Sounds">
          <Link to="/sounds" className="mk-button flex h-11 w-fit items-center rounded-sm px-4 text-sm text-foreground">
            Open Sounds library
          </Link>
        </Section>

        <Section title="Listen (hear OBS on this device)">
          <label className="grid gap-1">
            <span className="mk-label">Audio address (WHEP)</span>
            <input
              className={fieldClass}
              value={config.listenUrl}
              placeholder={resolveListenUrl("", config.host) || "http://192.168.1.100:8889/mk/whep"}
              onChange={(e) => engine.setListen({ listenUrl: e.target.value })}
            />
          </label>
          <p className="font-mono text-[10px] text-muted-foreground">
            Leave empty to use the OBS host with port 8889. Needs the free MediaMTX server running on the OBS PC and OBS
            sending audio to it — see audio-bridge/SETUP.md. Then press Listen at the top of the switcher.
          </p>
          <button
            type="button"
            aria-pressed={config.listenRemote}
            className={`mk-button h-10 w-fit rounded-sm px-4 text-sm ${config.listenRemote ? "mk-lit-preview" : ""}`}
            onClick={() => engine.setListen({ listenRemote: !config.listenRemote })}
          >
            REMOTE LISTENING {config.listenRemote ? "ON" : "OFF"}
          </button>
          <p className="font-mono text-[10px] text-muted-foreground">
            ON = also connect across routers and the internet (adds a STUN server). The address must be https when this page
            is https (phones block http): see audio-bridge/REMOTE.md.
          </p>
          <label className="grid gap-1">
            <span className="mk-label">Extra ICE servers (optional, separated by ;)</span>
            <input
              className={fieldClass}
              value={config.listenIce}
              placeholder="turn:host:3478|user|password"
              onChange={(e) => engine.setListen({ listenIce: e.target.value })}
            />
          </label>
          <PrelistenOutput connected={state.status === "connected"} />
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
