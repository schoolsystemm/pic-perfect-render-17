import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { layerUrl } from "@/lib/mk/graphics";
import { GFX_THEMES } from "@/lib/mk/gfx-themes";
import {
  makeTag,
  newsDesk,
  previewGraphics,
  useNewsDesk,
  type NewsStory,
} from "@/lib/mk/news-desk";
import { useSwitcher } from "@/lib/mk/use-switcher";
import type { GfxId, GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";
const area = "mk-field min-h-[4.5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs";
const VIDEO =
  "bg-[linear-gradient(135deg,oklch(0.38_0.1_250),oklch(0.2_0.06_300)_55%,oklch(0.3_0.08_20))]";
const ICON =
  "mk-button flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] disabled:opacity-30";

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label text-[9px]">{t}</span>
      {children}
    </label>
  );
}

function Frame({ id, g }: { id: GfxId; g: GraphicsConfig }) {
  const part = JSON.stringify(g[id]);
  const url = useMemo(() => layerUrl(id, g), [id, part]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <iframe
      title={`${id} layer`}
      src={url}
      sandbox="allow-scripts"
      className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
    />
  );
}

function Big({
  tone,
  onClick,
  label,
  hint,
  disabled,
  icon,
}: {
  tone: "program" | "preview" | "amber" | "plain";
  onClick: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const lit =
    tone === "program"
      ? "mk-lit-program"
      : tone === "preview"
        ? "mk-lit-preview"
        : tone === "amber"
          ? "mk-lit-amber"
          : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "mk-button flex h-14 min-w-[6rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-[3px] px-3 text-sm tracking-wider active:scale-95 disabled:opacity-40",
        lit,
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {hint && <span className="font-mono text-[9px] font-normal opacity-70">{hint}</span>}
    </button>
  );
}

const download = (name: string, body: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/**
 * News Desk: pick a bulletin (a news time), fill each story's changing tags, then run it —
 * START BULLETIN (logo + clock + scroll), PLAY a story (its tags cycle by themselves), NEXT STORY.
 */
export function NewsDesk({ say }: { say: (msg: string) => void }) {
  const state = useSwitcher();
  const nd = useNewsDesk();
  const fileRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState<{ id: string; text: string } | null>(null);

  const bulletin = nd.bulletins.find((b) => b.id === nd.bulletinId) ?? nd.bulletins[0]!;
  const story = bulletin.stories.find((s) => s.id === nd.storyId) ?? bulletin.stories[0];
  const live = bulletin.stories.find((s) => s.id === nd.liveStoryId);
  const tagsOn = state.gfxActive.news;
  const liveIdx = live ? bulletin.stories.indexOf(live) : -1;

  const pv = useMemo(
    () => previewGraphics(state.config.graphics, bulletin, story, nd.run),
    [state.config.graphics, bulletin, story, nd.run],
  );

  // ---- keyboard (not while typing in a field)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      if (e.key === "Escape") el.blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      newsDesk.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if ((k === " " || k === "Enter") && el.tagName === "BUTTON") return;
    if (k === " ") {
      e.preventDefault();
      void newsDesk.playStory();
    } else if (k === "ArrowRight" || k === "n") newsDesk.nextStory(1);
    else if (k === "ArrowLeft" || k === "p") newsDesk.nextStory(-1);
    else if (k === "r") newsDesk.replay();
    else if (k === "Escape") void newsDesk.clearTags();
    else if (k === "s") void newsDesk.startBulletin();
    else if (k === "x") void newsDesk.allOff();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const setTag = (s: NewsStory, i: number, patch: Partial<{ main: string; below: string; full: boolean }>) =>
    newsDesk.setTags(
      s.id,
      s.tags.map((t, n) => (n === i ? { ...t, ...patch } : t)),
    );
  const moveTag = (s: NewsStory, i: number, d: -1 | 1) => {
    const list = [...s.tags];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    newsDesk.setTags(s.id, list);
  };

  const applyQuick = () => {
    if (!story || !quick) return;
    const tags = quick.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [main = "", ...rest] = l.split("|");
        const below = rest.join("|").trim().slice(0, 200);
        return makeTag(main.trim().slice(0, 160), below, !below);
      });
    if (!tags.length) return;
    newsDesk.setTags(story.id, tags);
    setQuick(null);
    say(`${tags.length} tag${tags.length === 1 ? "" : "s"} set`);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:overflow-hidden">
      {/* ------------------------------------------------ left: run the bulletin */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1.5 lg:overflow-y-auto">
        <div className="mk-panel flex shrink-0 flex-wrap items-center gap-1 rounded-md p-1.5">
          <span className="mk-label mr-1 text-[9px]">News time</span>
          <select
            className={cn(field, "w-auto min-w-[10rem] flex-1 sm:flex-none")}
            value={bulletin.id}
            onChange={(e) => newsDesk.selectBulletin(e.target.value)}
            aria-label="Bulletin"
          >
            {nd.bulletins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mk-button flex h-8 items-center gap-1 rounded-[3px] px-2 text-[10px]"
            onClick={() => {
              const name = window.prompt(
                "Name for the new news time (e.g. Midday News · 12 PM)",
                "New bulletin",
              );
              if (name?.trim()) newsDesk.newBulletin(name.trim().slice(0, 60));
            }}
          >
            <Plus className="h-3 w-3" /> New
          </button>
          <button
            type="button"
            className="mk-button flex h-8 items-center gap-1 rounded-[3px] px-2 text-[10px]"
            title="Copy this bulletin, e.g. to make the next news time"
            onClick={() => {
              newsDesk.duplicateBulletin();
              say("Bulletin copied — rename it on the right");
            }}
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button
            type="button"
            className="mk-button flex h-8 items-center gap-1 rounded-[3px] px-2 text-[10px]"
            onClick={() => {
              download(
                `${bulletin.name.replace(/[^\w-]+/g, "_") || "bulletin"}.news.json`,
                newsDesk.exportJson(),
              );
              say("Bulletin file downloaded");
            }}
          >
            <Download className="h-3 w-3" /> Export
          </button>
          <button
            type="button"
            className="mk-button flex h-8 items-center gap-1 rounded-[3px] px-2 text-[10px]"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3 w-3" /> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                say(`Imported ${newsDesk.importJson(await file.text())}`);
              } catch (err) {
                say(err instanceof Error ? err.message : "Could not import that file");
              }
            }}
          />
          <button
            type="button"
            className="mk-button ml-auto h-8 rounded-[3px] px-2 text-[10px]"
            onClick={() => {
              if (!newsDesk.deleteBulletin()) say("Keep at least one bulletin");
            }}
            title="Delete this bulletin"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* preview */}
        <div className="mk-panel shrink-0 rounded-md p-1.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="mk-label text-[9px]">Preview · {story?.name ?? "—"}</span>
            <span className="mk-label text-[9px]">
              {tagsOn ? <span className="text-program">TAGS ON AIR</span> : "TAGS OFF AIR"}
            </span>
          </div>
          <div
            className={cn(
              "relative aspect-video w-full overflow-hidden rounded-[3px] border border-white/10",
              VIDEO,
            )}
          >
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/40 to-transparent" />
            <Frame id="logo" g={pv} />
            <Frame id="clock" g={pv} />
            <Frame id="ticker" g={pv} />
            <Frame id="news" g={pv} />
          </div>
        </div>

        {/* playout */}
        <div className="mk-panel grid shrink-0 gap-1.5 rounded-md p-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Big
              tone={nd.furnitureOn ? "program" : "amber"}
              label="START BULLETIN"
              hint="logo · clock · scroll   S"
              icon={<Radio className="h-4 w-4" />}
              onClick={() => void newsDesk.startBulletin()}
            />
            <Big
              tone="plain"
              label="ALL OFF"
              hint="everything   X"
              onClick={() => void newsDesk.allOff()}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Big
              tone="plain"
              label="PREV"
              hint="story   ←"
              icon={<SkipBack className="h-4 w-4" />}
              disabled={!bulletin.stories.length}
              onClick={() => newsDesk.nextStory(-1)}
            />
            <Big
              tone="program"
              label="PLAY STORY"
              hint="selected   SPACE"
              icon={<Play className="h-4 w-4" />}
              onClick={() => void newsDesk.playStory()}
            />
            <Big
              tone="preview"
              label="NEXT STORY"
              hint="plays it   →"
              icon={<SkipForward className="h-4 w-4" />}
              onClick={() => newsDesk.nextStory(1)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mk-label mr-1 text-[9px]">
              {live ? `On air: ${live.name}` : "Nothing on air"}
            </span>
            {live &&
              live.tags.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className="mk-button h-7 min-w-[2.2rem] rounded-[3px] px-2 text-[10px]"
                  title={`Jump to tag ${i + 1} (it carries on from there)`}
                  onClick={() => newsDesk.playTag(i)}
                >
                  TAG {i + 1}
                </button>
              ))}
            <button
              type="button"
              className="mk-button ml-auto flex h-7 items-center gap-1 rounded-[3px] px-2 text-[10px]"
              onClick={() => newsDesk.replay()}
            >
              <RotateCcw className="h-3 w-3" /> REPLAY{" "}
              <span className="font-mono opacity-60">R</span>
            </button>
            <button
              type="button"
              className="mk-button h-7 rounded-[3px] px-2 text-[10px]"
              onClick={() => void newsDesk.clearTags()}
            >
              TAGS OFF <span className="font-mono opacity-60">ESC</span>
            </button>
          </div>
        </div>

        {/* story list */}
        <div className="mk-panel grid shrink-0 gap-1 rounded-md p-1.5">
          <div className="flex items-center gap-2">
            <span className="mk-label text-[9px]">
              Stories · {bulletin.stories.length}
              {liveIdx >= 0 && ` · on air ${liveIdx + 1}`}
            </span>
            <button
              type="button"
              className="mk-button ml-auto flex h-7 items-center gap-1 rounded-[3px] px-2 text-[10px]"
              onClick={() => newsDesk.addStory()}
            >
              <Plus className="h-3 w-3" /> Add story
            </button>
          </div>
          {bulletin.stories.map((s, i) => {
            const on = s.id === nd.liveStoryId;
            const sel = s.id === story?.id;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-[3px] border px-1.5 py-1",
                  on
                    ? "border-program/70 bg-program/10"
                    : sel
                      ? "border-amber/60 bg-white/5"
                      : "border-white/10",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => newsDesk.selectStory(s.id)}
                  onDoubleClick={() => void newsDesk.playStory(s.id)}
                >
                  <span className="mk-label w-5 shrink-0 text-center font-mono text-[10px]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-foreground">
                      {s.name}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-engrave">
                      {s.kicker || "—"} · {s.tags.length} tag{s.tags.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {on && <span className="mk-label shrink-0 text-[9px] text-program">ON AIR</span>}
                </button>
                <button
                  type="button"
                  className={ICON}
                  aria-label={`Play ${s.name}`}
                  title="Play this story"
                  onClick={() => void newsDesk.playStory(s.id)}
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={ICON}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => newsDesk.moveStory(s.id, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={ICON}
                  aria-label="Move down"
                  disabled={i === bulletin.stories.length - 1}
                  onClick={() => newsDesk.moveStory(s.id, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={ICON}
                  aria-label="Copy story"
                  onClick={() => newsDesk.duplicateStory(s.id)}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={ICON}
                  aria-label="Delete story"
                  disabled={bulletin.stories.length < 2}
                  onClick={() => newsDesk.removeStory(s.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {nd.log.length > 0 && (
          <div className="mk-panel shrink-0 rounded-md p-1.5 font-mono text-[10px] text-engrave">
            {nd.log.slice(0, 4).map((l, i) => (
              <div key={i} className={cn("truncate", i === 0 && "text-foreground")}>
                {l.t} · {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ right: edit */}
      <div className="flex min-h-0 min-w-0 flex-col gap-1.5 lg:overflow-y-auto">
        {story && (
          <div className="mk-panel grid shrink-0 gap-2 rounded-md p-2">
            <span className="mk-label text-[9px]">Story · what goes on air</span>
            <div className="grid grid-cols-2 gap-2">
              <Lbl t="Story name (not on air)">
                <input
                  className={field}
                  value={story.name}
                  maxLength={80}
                  onChange={(e) => newsDesk.patchStory(story.id, { name: e.target.value })}
                />
              </Lbl>
              <Lbl t="Updates tag (on top)">
                <input
                  className={field}
                  value={story.kicker}
                  maxLength={40}
                  placeholder="LIVE UPDATES"
                  onChange={(e) => newsDesk.patchStory(story.id, { kicker: e.target.value })}
                />
              </Lbl>
              <Lbl t={`Seconds per tag (0 = bulletin's ${bulletin.tagSeconds}s)`}>
                <input
                  type="number"
                  className={field}
                  min={0}
                  max={120}
                  value={story.seconds}
                  onChange={(e) =>
                    newsDesk.patchStory(story.id, {
                      seconds: Math.max(0, Math.min(120, Number(e.target.value) || 0)),
                    })
                  }
                />
              </Lbl>
              <Lbl t="When the last tag is reached">
                <button
                  type="button"
                  aria-pressed={story.loop}
                  className={cn(
                    "mk-button h-8 rounded-[3px] px-3 text-[10px]",
                    story.loop && "mk-lit-amber",
                  )}
                  onClick={() => newsDesk.patchStory(story.id, { loop: !story.loop })}
                >
                  {story.loop ? "KEEP GOING ROUND" : "HOLD THE LAST TAG"}
                </button>
              </Lbl>
            </div>

            <div className="flex items-center gap-2">
              <span className="mk-label text-[9px]">
                Tags · {story.tags.length} (changing, in order)
              </span>
              <button
                type="button"
                className="mk-button ml-auto h-7 rounded-[3px] px-2 text-[10px]"
                onClick={() =>
                  setQuick(
                    quick
                      ? null
                      : {
                          id: story.id,
                          text: story.tags
                            .map((t) => (t.full || !t.below ? t.main : `${t.main} | ${t.below}`))
                            .join("\n"),
                        },
                  )
                }
              >
                {quick ? "Close quick entry" : "Quick entry"}
              </button>
              <button
                type="button"
                className="mk-button flex h-7 items-center gap-1 rounded-[3px] px-2 text-[10px]"
                disabled={story.tags.length >= 20}
                onClick={() => newsDesk.setTags(story.id, [...story.tags, makeTag()])}
              >
                <Plus className="h-3 w-3" /> Add tag
              </button>
            </div>

            {quick && quick.id === story.id && (
              <div className="grid gap-1.5">
                <textarea
                  className={cn(area, "min-h-[7rem] font-mono")}
                  value={quick.text}
                  placeholder={"Title | Lower tag\nFull title (no bar)\nTitle | Lower tag"}
                  onChange={(e) => setQuick({ id: story.id, text: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-engrave">
                    One tag per line: "Title | Lower tag", or just "Full title"
                  </span>
                  <button
                    type="button"
                    className="mk-button mk-lit-preview ml-auto h-7 rounded-[3px] px-3 text-[10px]"
                    onClick={applyQuick}
                  >
                    APPLY
                  </button>
                </div>
              </div>
            )}

            {story.tags.map((t, i) => (
              <div
                key={i}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-1.5 rounded-[3px] border border-white/10 p-1.5"
              >
                <span className="mk-label pt-2 text-center font-mono text-[10px]">{i + 1}</span>
                <div className="grid gap-1.5">
                  <div className="flex gap-1">
                    {([
                      [true, "FULL TITLE"],
                      [false, "TITLE + LOWER TAG"],
                    ] as const).map(([full, label]) => (
                      <button
                        key={label}
                        type="button"
                        className={cn(
                          "mk-button h-6 rounded-[3px] px-2 text-[9px]",
                          !!t.full === full && "mk-lit-preview",
                        )}
                        onClick={() => setTag(story, i, { full })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    className={field}
                    value={t.main}
                    maxLength={160}
                    placeholder={t.full ? "Full title" : "Title"}
                    onChange={(e) => setTag(story, i, { main: e.target.value })}
                  />
                  {!t.full && (
                    <input
                      className={field}
                      value={t.below}
                      maxLength={200}
                      placeholder="Lower tag"
                      onChange={(e) => setTag(story, i, { below: e.target.value })}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className={ICON}
                    aria-label="Move tag up"
                    disabled={i === 0}
                    onClick={() => moveTag(story, i, -1)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className={ICON}
                    aria-label="Move tag down"
                    disabled={i === story.tags.length - 1}
                    onClick={() => moveTag(story, i, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className={ICON}
                    aria-label="Delete tag"
                    disabled={story.tags.length < 2}
                    onClick={() =>
                      newsDesk.setTags(
                        story.id,
                        story.tags.filter((_, n) => n !== i),
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mk-panel grid shrink-0 gap-2 rounded-md p-2">
          <span className="mk-label text-[9px]">This news time · logo, clock, scroll, look</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Lbl t="Bulletin name">
                <input
                  className={field}
                  value={bulletin.name}
                  maxLength={60}
                  onChange={(e) => newsDesk.patchBulletin({ name: e.target.value })}
                />
              </Lbl>
            </div>
            <Lbl t="Look">
              <select
                className={field}
                value={bulletin.themeId}
                onChange={(e) => newsDesk.patchBulletin({ themeId: e.target.value })}
              >
                {GFX_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Lbl>
            <Lbl t="Default seconds per tag">
              <input
                type="number"
                className={field}
                min={2}
                max={120}
                value={bulletin.tagSeconds}
                onChange={(e) =>
                  newsDesk.patchBulletin({
                    tagSeconds: Math.max(2, Math.min(120, Number(e.target.value) || 6)),
                  })
                }
              />
            </Lbl>
            <Lbl t="Studio mark (an uploaded logo wins)">
              <input
                className={field}
                value={bulletin.logoText}
                maxLength={24}
                onChange={(e) => newsDesk.patchBulletin({ logoText: e.target.value })}
              />
            </Lbl>
            <Lbl t="Clock label">
              <input
                className={field}
                value={bulletin.clockLabel}
                maxLength={12}
                onChange={(e) => newsDesk.patchBulletin({ clockLabel: e.target.value })}
              />
            </Lbl>
            <Lbl t="Scroll label">
              <input
                className={field}
                value={bulletin.scrollLabel}
                maxLength={24}
                onChange={(e) => newsDesk.patchBulletin({ scrollLabel: e.target.value })}
              />
            </Lbl>
            <Lbl t="Scroll seconds per pass">
              <input
                type="number"
                className={field}
                min={8}
                max={120}
                value={bulletin.scrollSpeed}
                onChange={(e) =>
                  newsDesk.patchBulletin({
                    scrollSpeed: Math.max(8, Math.min(120, Number(e.target.value) || 45)),
                  })
                }
              />
            </Lbl>
            <div className="col-span-2">
              <Lbl t="Scroll headlines (one per line)">
                <textarea
                  className={area}
                  value={bulletin.scrollLines}
                  maxLength={1200}
                  onChange={(e) => newsDesk.patchBulletin({ scrollLines: e.target.value })}
                />
              </Lbl>
            </div>
          </div>
          <p className="font-mono text-[9px] leading-relaxed text-engrave">
            Press START BULLETIN, then PLAY STORY. Each story's tags change by themselves; NEXT
            STORY brings the next one. Changed the scroll? Press START BULLETIN again.
          </p>
        </div>
      </div>
    </div>
  );
}
