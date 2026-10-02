import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AudioMixer, Master } from "@/components/mk/audio-mixer";
import { ListenControl } from "@/components/mk/listen-control";
import { GraphicsPanel } from "@/components/mk/graphics-panel";
import { Multiview } from "@/components/mk/multiview";
import { OutputControls } from "@/components/mk/output-controls";
import { ReconnectOverlay } from "@/components/mk/reconnect-overlay";
import { SoundPad } from "@/components/mk/sound-pad";
import { SourceBus } from "@/components/mk/source-bus";
import { ToolsHub } from "@/components/mk/tools-hub";
import { StatusBar } from "@/components/mk/status-bar";
import { TransitionPanel } from "@/components/mk/transition-panel";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { FX_SCENE } from "@/lib/mk/fx";
import { LivePanel } from "@/components/mk/live-panel";
import { comms, tallyOf } from "@/lib/mk/intercom";
import { startPrompterHost } from "@/lib/mk/prompter";
import { useShortcuts } from "@/lib/mk/use-shortcuts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MK VISION — Professional Live Production Control" },
      {
        name: "description",
        content:
          "MK VISION is a professional virtual broadcast switcher for OBS Studio: Program, Preview, Cut, Auto Take, T-Bar, DSK, audio mixer, multiview and stream/record control.",
      },
      { property: "og:title", content: "MK VISION — Professional Live Production Control" },
      {
        property: "og:description",
        content:
          "Control OBS Studio like a television vision mixer: buses, T-Bar, DSK, audio mixer with meters, multiview monitors, streaming and recording.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Switcher,
});

type Panel = "multiview" | "wall" | "audio" | "status" | "graphics" | "sounds" | "live";
const PANEL_LABEL: Record<Panel, string> = { multiview: "Monitors", wall: "Cam Wall", audio: "Audio", status: "Tools", graphics: "Graphics", sounds: "Sounds", live: "Live FX" };

function Switcher() {
  const state = useSwitcher();
  useShortcuts(state.config.shortcuts);
  // Teleprompter host: keeps the /prompter output window in sync even when the Tools panel is hidden.
  useEffect(() => startPrompterHost(), []);
  // Camera tally for the operators' phones (red = on air, green = next). Runs even when the Tools panel is hidden.
  useEffect(() => {
    const t = tallyOf(state);
    comms.setTally(t.pgm, t.pvw, state.config.camScenes);
  }, [state]);
  const [show, setShow] = useState<Record<Panel, boolean>>({ multiview: true, wall: true, audio: true, status: true, graphics: true, sounds: true, live: true });
  const toggle = (p: Panel) => setShow((s) => ({ ...s, [p]: !s[p] }));
  // MK's own helper sources (graphics layers, the sound-pad clip) are not mixer inputs.
  const mixInputs = state.audio.filter((c) => !/^MK /i.test(c.name));
  const hiddenAudio = state.config.hiddenAudio;
  const stripInputs = mixInputs.filter((c) => !hiddenAudio.includes(c.name));
  const bottom = show.audio || show.status || show.graphics || show.sounds || show.live;

  const menus = (["multiview", "wall", "audio", "status", "graphics", "sounds", "live"] as Panel[]).map((p) => (
    <button
      key={p}
      type="button"
      onClick={() => toggle(p)}
      aria-pressed={show[p]}
      className={cn("mk-button h-7 shrink-0 rounded-[3px] px-2 text-[9px] tracking-[0.12em]", show[p] && "text-foreground")}
    >
      {PANEL_LABEL[p]} {show[p] ? "▾" : "▸"}
    </button>
  ));

  return (
    <div className="mk-chassis flex h-[100dvh] flex-col overflow-hidden">
      <StatusBar
        status={state.status}
        statusMessage={state.statusMessage}
        demo={state.demo}
        menus={menus}
        listen={<ListenControl config={state.config} />}
      />
      <ReconnectOverlay
        status={state.status}
        message={state.statusMessage}
        demo={state.demo}
        onRetry={() => void engine.connect()}
      />

      {/* Console: one screen, nothing scrolls. Below 900px wide it falls back to a scrolling stack. */}
      <main className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 fit:flex-row fit:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
          {show.multiview && (
            <div className="min-h-0 shrink-0 fit:flex-1">
              <Multiview
                program={state.program}
                preview={state.preview}
                programScene={state.programScene}
                programFeed={state.live.on && state.live.progBus ? state.live.progBus : state.fx.running || state.fx.layout ? FX_SCENE : null}
                previewFeed={state.live.on ? state.live.previewBus : null}
                previewScene={state.previewScene}
                tBar={state.tBar}
                transitioning={state.transitioning}
                dskActive={state.dskActive}
                streaming={state.stream.active}
                recording={state.record.active}
                liveVideo={state.config.liveVideo}
                fps={state.config.monitorFps}
                connected={state.status === "connected"}
                getFrame={engine.getScreenshot}
                demo={state.demo}
                graphics={state.config.graphics}
                gfxActive={state.gfxActive}
                wall={show.wall}
                camScenes={state.config.camScenes}
                getThumb={engine.getThumb}
                onPreviewCam={(cam) => void engine.selectPreview(cam)}
                onProgramCam={(cam) => void engine.selectProgram(cam)}
              />
            </div>
          )}
          <SourceBus
            kind="program"
            active={state.program}
            camScenes={state.config.camScenes}
            onSelect={(cam) => void engine.selectProgram(cam)}
          />
          <SourceBus
            kind="preview"
            active={state.preview}
            camScenes={state.config.camScenes}
            onSelect={(cam) => void engine.selectPreview(cam)}
          />
          {bottom && (
            <div
              className={cn(
                "flex min-h-0 shrink-0 flex-col gap-1.5 fit:flex-row",
                show.multiview ? "fit:h-[clamp(190px,29vh,270px)]" : "fit:flex-1",
              )}
            >
              {show.audio && (
                <div className="h-56 min-w-0 fit:h-auto fit:max-w-[52%] fit:flex-[0_1_auto]">
                  <AudioMixer
                    hidden={hiddenAudio.filter((n) => mixInputs.some((c) => c.name === n))}
                    onHide={(name) => engine.hideAudio(name)}
                    onShow={(name) => engine.showAudio(name)}
                    onShowAll={() => engine.showAllAudio()}
                    channels={stripInputs}
                    levels={state.levels}
                    afv={state.config.audioFollowVideo}
                    limiter={state.config.limiter}
                    gr={state.gr}
                    masterMuted={state.masterMuted}
                    camOf={(name) => engine.audioCam(name)}
                    onVolume={(name, db) => void engine.setAudioVolume(name, db)}
                    onMute={(name) => void engine.toggleAudioMute(name)}
                    onMonitor={(name) => void engine.cycleAudioMonitor(name)}
                    onStream={(name) => void engine.toggleAudioStream(name)}
                    onPre={(name) => void engine.toggleAudioPre(name)}
                    onHearFinal={(on) => void engine.hearFinalInPre(on)}
                    onAfv={(on) => engine.setAudioFollowVideo(on)}
                    onLimiter={(patch) => engine.setLimiter(patch)}
                    onMuteOut={() => void engine.toggleMasterMute()}
                  />
                </div>
              )}
              {show.status && (
                <div className="h-40 min-w-0 fit:h-auto fit:min-w-[16rem] fit:flex-1">
                  <ToolsHub
                    dskActive={state.dskActive}
                    gfxActive={state.gfxActive}
                    audio={state.audio}
                    rundown={state.config.rundown}
                    masterMuted={state.masterMuted}
                  />
                </div>
              )}
              {show.graphics && (
                <div className="min-w-0 fit:w-[16rem] fit:shrink-0">
                  <GraphicsPanel graphics={state.config.graphics} active={state.gfxActive} />
                </div>
              )}
              {show.live && (
                <div className="min-w-0 fit:w-[17rem] fit:shrink-0">
                  <LivePanel
                    live={state.live}
                    pips={state.config.pips}
                    ad={state.config.ad}
                    presets={state.config.adPresets}
                    adActive={state.config.adActive}
                    scenes={state.config.camScenes.filter((s): s is string => !!s)}
                    connected={state.status === "connected"}
                    busy={state.fx.running}
                  />
                </div>
              )}
              {show.sounds && (
                <div className="h-32 min-w-0 fit:h-auto fit:w-[13.5rem] fit:shrink-0">
                  <SoundPad />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-1.5 fit:min-h-0 fit:w-[15rem]">
          <OutputControls
            stream={state.stream}
            record={state.record}
            onStream={() => void engine.toggleStream()}
            onRecord={() => void engine.toggleRecord()}
            onPause={() => void engine.toggleRecordPause()}
          />
          <TransitionPanel
            dskActive={state.dskActive}
            dsks={state.config.dsks}
            tBar={state.tBar}
            transitioning={state.transitioning}
            fx={state.fx}
            fxConfig={state.config.fx}
            live={state.live}
            pipScenes={state.config.pips.map((p) => p.scene)}
            adScene={state.config.ad.scene}
            adName={state.config.adPresets[state.config.adActive]?.name}
            adPresets={state.config.adPresets}
            adActive={state.config.adActive}
            mergePresets={state.config.mergePresets}
            mergeActive={state.config.mergeActive}
            onPip={(slot) => void engine.togglePip(slot)}
            onSqueezeMerge={() => void engine.squeezeMerge()}
            onMove={(dir) => void engine.moveTake(dir)}
            onLayout={(kind) => void engine.toggleLayout(kind)}
            onSqueeze={() => void engine.squeeze()}
            onFxOption={(patch) => engine.setFx(patch)}
            transitionName={state.config.transition}
            duration={state.config.transitionDuration}
            transitions={state.transitions}
            onTransition={(name) => void engine.setTransition(name)}
            onDuration={(ms) => void engine.setTransitionDuration(ms)}
            onDsk={(index) => void engine.toggleDSK(index)}
            onAutoTake={() => void engine.autoTake()}
            onCut={() => void engine.cut()}
            onTBarChange={(value) => engine.setTBar(value)}
            onTBarRelease={(value) => engine.setTBar(value, true)}
          />
          {show.audio && (
            <div className={cn("h-56 shrink-0 fit:h-[clamp(190px,29vh,270px)]", !show.multiview && "fit:h-[clamp(190px,42vh,380px)]")}>
              <Master
                channels={mixInputs}
                levels={state.levels}
                afv={state.config.audioFollowVideo}
                limiter={state.config.limiter}
                gr={state.gr}
                masterMuted={state.masterMuted}
                camOf={(name) => engine.audioCam(name)}
                onVolume={(name, db) => void engine.setAudioVolume(name, db)}
                onMute={(name) => void engine.toggleAudioMute(name)}
                onMonitor={(name) => void engine.cycleAudioMonitor(name)}
                onStream={(name) => void engine.toggleAudioStream(name)}
                onPre={(name) => void engine.toggleAudioPre(name)}
                onHearFinal={(on) => void engine.hearFinalInPre(on)}
                onAfv={(on) => engine.setAudioFollowVideo(on)}
                onLimiter={(patch) => engine.setLimiter(patch)}
                onMuteOut={() => void engine.toggleMasterMute()}
              />
            </div>
          )}
        </div>
      </main>
      {state.notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
          <div className="mk-panel rounded-md border-amber px-3 py-2 font-mono text-xs text-amber">{state.notice}</div>
        </div>
      )}
    </div>
  );
}
