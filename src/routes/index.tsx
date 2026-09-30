import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AudioMixer } from "@/components/mk/audio-mixer";
import { Multiview } from "@/components/mk/multiview";
import { OutputControls } from "@/components/mk/output-controls";
import { ReconnectOverlay } from "@/components/mk/reconnect-overlay";
import { SourceBus } from "@/components/mk/source-bus";
import { StatusBar } from "@/components/mk/status-bar";
import { TransitionPanel } from "@/components/mk/transition-panel";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
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

type Panel = "multiview" | "audio";

function Switcher() {
  const state = useSwitcher();
  useShortcuts(state.config.shortcuts);
  const [show, setShow] = useState<Record<Panel, boolean>>({ multiview: true, audio: true });
  const toggle = (p: Panel) => setShow((s) => ({ ...s, [p]: !s[p] }));

  return (
    <div className="mk-chassis flex h-[100dvh] flex-col overflow-hidden">
      <StatusBar status={state.status} statusMessage={state.statusMessage} demo={state.demo} />
      <ReconnectOverlay
        status={state.status}
        message={state.statusMessage}
        demo={state.demo}
        onRetry={() => void engine.connect()}
      />

      <div className="flex gap-1.5 border-b border-border px-2 py-1 phone-land:py-0.5">
        {(["multiview", "audio"] as Panel[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className={cn("mk-button h-7 rounded-sm px-2 text-[10px]", show[p] && "text-foreground")}
          >
            {p === "multiview" ? "Monitors" : "Audio"} {show[p] ? "▾" : "▸"}
          </button>
        ))}
      </div>

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 sm:flex-row sm:gap-3 sm:p-3 phone-land:flex-row phone-land:gap-2 phone-land:p-1.5">
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 phone-land:gap-1.5">
          {show.multiview && (
            <div className="phone-land:hidden">
              <Multiview
                program={state.program}
                preview={state.preview}
                programScene={state.programScene}
                previewScene={state.previewScene}
                tBar={state.tBar}
                transitioning={state.transitioning}
                dskActive={state.dskActive}
                streaming={state.stream.active}
                recording={state.record.active}
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
          {show.audio && (
            <AudioMixer
              channels={state.audio}
              levels={state.levels}
              afv={state.config.audioFollowVideo}
              camOf={(name) => engine.audioCam(name)}
              onVolume={(name, db) => void engine.setAudioVolume(name, db)}
              onMute={(name) => void engine.toggleAudioMute(name)}
              onAfv={(on) => engine.setAudioFollowVideo(on)}
            />
          )}
        </div>

        <div className="flex flex-col gap-2 sm:gap-3 phone-land:w-44 phone-land:gap-1.5">
          <OutputControls
            stream={state.stream}
            record={state.record}
            onStream={() => void engine.toggleStream()}
            onRecord={() => void engine.toggleRecord()}
            onPause={() => void engine.toggleRecordPause()}
          />
          <TransitionPanel
            dskActive={state.dskActive}
            tBar={state.tBar}
            transitionName={state.config.transition}
            duration={state.config.transitionDuration}
            onDsk={() => void engine.toggleDSK()}
            onAutoTake={() => void engine.autoTake()}
            onCut={() => void engine.cut()}
            onTBarChange={(value) => engine.setTBar(value)}
            onTBarRelease={(value) => engine.setTBar(value, true)}
          />
        </div>
      </main>
    </div>
  );
}
