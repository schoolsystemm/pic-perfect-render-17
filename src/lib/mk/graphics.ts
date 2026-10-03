// Built-in on-air graphics. Each layer is an OBS browser source whose HTML is
// embedded in a data: URL — nothing to host or upload. Layers live in the
// "MK Graphics" scene and are switched on/off independently of the DSKs.
import type { PlacePos } from "./fx";
import { GFX_ANIMS, type Corner, type GfxAnim, type GfxFont, type GfxId, type GraphicsConfig } from "./types";

export const GFX_SCENE = "MK Graphics";

export const GFX_LAYERS: { id: GfxId; name: string; label: string }[] = [
  { id: "logo", name: "MK Logo", label: "Logo" },
  { id: "lower", name: "MK Lower Third", label: "Lower Third" },
  { id: "ticker", name: "MK Ticker", label: "Ticker" },
  { id: "clock", name: "MK Clock", label: "Clock" },
  { id: "badge", name: "MK Badge", label: "Live Badge" },
  { id: "news", name: "MK News Tags", label: "News Tags" },
  // Newer layers go last: later = higher in the OBS scene, so Breaking sits on top of everything.
  { id: "social", name: "MK Social", label: "Social" },
  { id: "score", name: "MK Scoreboard", label: "Scoreboard" },
  { id: "full", name: "MK Full Screen", label: "Full Screen" },
  { id: "breaking", name: "MK Breaking", label: "Breaking" },
];

export const gfxName = (id: GfxId) => GFX_LAYERS.find((l) => l.id === id)!.name;
export const gfxIdByName = (name: string): GfxId | null =>
  GFX_LAYERS.find((l) => l.name === name)?.id ?? null;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const color = (c: string, fallback: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback);

/** Only real raster / svg data URLs may ever reach an <img> (imported designs are untrusted). */
export const safeImage = (v: unknown): string | null =>
  typeof v === "string" && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;

const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** #rgb / #rrggbb + opacity 0..100 -> rgba(). */
function rgba(hex: string, opacity: number, fallback = "#0a0c10") {
  let h = color(hex, fallback).slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Lighten (f>0) or darken (f<0) a colour: 1 = white, -1 = black. */
function shade(hex: string, f: number) {
  let h = color(hex, "#808080").slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const m = (v: number) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => m(v).toString(16).padStart(2, "0")).join("");
}

const BARLOW = "'Barlow Semi Condensed','Barlow Condensed','Arial Narrow',Arial,sans-serif";
const BARLOW_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&display=swap');";

const FONT: Record<GfxFont, string> = {
  sans: "'Segoe UI',Arial,sans-serif",
  condensed: "'Barlow Condensed','Arial Narrow','Roboto Condensed',Arial,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "Consolas,'JetBrains Mono',monospace",
};
const font = (f: string) => FONT[f as GfxFont] ?? FONT.sans;
/** The broadcast looks use Barlow whenever the Condensed font is picked. */
const fontB = (f: string) => (f === "condensed" ? BARLOW : font(f));
/** Glossy bar: lighter top half, darker bottom half, hard split in the middle. */
const gloss = (c: string) => `linear-gradient(180deg,${shade(c, 0.03)} 0,${shade(c, 0.18)} 50%,${shade(c, -0.28)} 50%,${shade(c, -0.03)} 100%)`;

const toDataUrl = (html: string) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

const BASE = "html,body{margin:0;background:transparent;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}";

// Bottom corners sit above the ticker bar.
const POS: Record<Corner, string> = {
  tl: "top:4vh;left:3vw",
  tr: "top:4vh;right:3vw",
  bl: "bottom:10vh;left:3vw",
  br: "bottom:10vh;right:3vw",
};

const ORIGIN: Record<Corner, string> = {
  tl: "top left",
  tr: "top right",
  bl: "bottom left",
  br: "bottom right",
};

/** A hand-placed spot, cleaned (0..1 each) or null. */
const spot = (v: unknown): PlacePos | null => {
  if (!v || typeof v !== "object") return null;
  const { x, y } = v as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
};

/**
 * CSS for an item placed by hand. 0 = its edge touches that side of the picture, 1 = the opposite edge,
 * whatever the item's own size (so it never leaves the screen). k is the size scale.
 */
const placeCss = (at: PlacePos, k = 1) => {
  const x = (at.x * 100).toFixed(3);
  const y = (at.y * 100).toFixed(3);
  return `position:absolute;left:${x}%;top:${y}%;transform-origin:0 0;transform:scale(${k}) translate(-${x}%,-${y}%)`;
};

/** Entrance time in ms. Set per item by the Graphics Rundown; 600 when not set. */
const msOf = (cfg: unknown) => {
  const n = Number((cfg as { animMs?: unknown } | null)?.animMs);
  return Number.isFinite(n) ? Math.max(100, Math.min(3000, n)) : 600;
};

const scale = (n: number) => Math.max(0.3, Math.min(3, (Number(n) || 100) / 100));

const page = (css: string, body: string, script = "") =>
  toDataUrl(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css.includes("Barlow Semi") ? BARLOW_IMPORT : ""}${BASE}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`,
  );

/** Perceived brightness 0..255. */
function lum(hex: string) {
  let h = color(hex, "#000000").slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/** Black or white, whichever reads better on this colour. */
const contrast = (hex: string) => (lum(hex) > 150 ? "#0a0c10" : "#ffffff");

/** Keep the chosen text colour when it reads on this background, otherwise fall back to black / white. */
const readable = (fg: string, bg: string) => (Math.abs(lum(fg) - lum(bg)) >= 90 ? color(fg, "#ffffff") : contrast(bg));

type Side = "l" | "r";
const sideOf = (pos: Corner, at: PlacePos | null): Side => (at ? (at.x < 0.5 ? "l" : "r") : pos === "tr" || pos === "br" ? "r" : "l");

/**
 * Entrance animation, applied to an inner `.an` wrapper (the outer element owns position + scale,
 * so the two transforms never fight). `side` = which edge it comes in from.
 */
function enter(kind: GfxAnim | string, side: Side, ms = 600) {
  const k: GfxAnim = GFX_ANIMS.some((a) => a.id === kind) ? (kind as GfxAnim) : "fade";
  const from = side === "l" ? "-115%" : "115%";
  const hide = side === "l" ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";
  const frames: Record<GfxAnim, string> = {
    slide: `from{transform:translateX(${from});opacity:0}to{transform:none;opacity:1}`,
    fade: "from{opacity:0}to{opacity:1}",
    wipe: `from{clip-path:${hide}}to{clip-path:inset(0 0 0 0)}`,
    scale: "from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}",
    reveal: "from{clip-path:inset(100% 0 0 0);transform:translateY(18%)}to{clip-path:inset(0 0 0 0);transform:none}",
  };
  return `@keyframes gin{${frames[k]}}.an{animation:gin ${ms}ms cubic-bezier(.2,.8,.2,1) both;transform-origin:${side === "l" ? "left" : "right"} center}`;
}

function logo(g: GraphicsConfig) {
  const { pos, size, opacity } = g.logo;
  const at = spot(g.logo.at);
  const image = safeImage(g.logo.image);
  const where = at ? placeCss(at) : `position:absolute;${POS[pos]}`;
  const w = num(size, 12, 3, 60);
  const op = num(opacity, 100, 5, 100) / 100;
  const mark = (g.logo.text ?? "").trim();
  const tc = color(g.logo.textColor, "#ffffff");
  const inner = image
    ? `<img src="${image}" style="display:block;width:${w}vw;opacity:${op}">`
    : mark
      ? `<div class="m">${esc(mark)}</div>`
      : "";
  return page(
    `.sc{${where}}${enter(g.logo.anim, sideOf(pos, at), msOf(g.logo))}.m{opacity:${op};color:${tc};border:${(w * 0.0175).toFixed(2)}vw solid ${tc};font-size:${(w * 0.21).toFixed(2)}vw;font-weight:800;letter-spacing:.08em;padding:.05em .35em;white-space:nowrap}`,
    inner ? `<div class="sc"><div class="an">${inner}</div></div>` : "",
  );
}

function lower(g: GraphicsConfig) {
  const L = g.lower;
  const a = color(L.accent, "#f5a623");
  const txt = color(L.text, "#ffffff");
  const prim = color(L.primary, "#0b4fa8");
  const bgc = rgba(L.bg, L.bgOpacity);
  const ff = font(L.font);
  const at = spot(L.at);
  const sc = at
    ? placeCss(at, scale(L.size))
    : `position:absolute;left:6vw;bottom:13vh;transform:scale(${scale(L.size)});transform-origin:bottom left`;
  const head = `.sc{${sc}}${enter(L.anim, sideOf("bl", at), msOf(L))}.lt{display:flex;font-family:${ff};color:${txt}}`;
  const name = esc(L.name);
  const title = esc(L.title);

  // ---- broadcast styles (Presenter / Guest strap / Player ID)
  if (L.style === "presenter") {
    return page(
      `${head}.lt{flex-direction:column}.r{display:flex}.ab{width:.73vw;background:${a}}
.nm{background:${prim};color:${readable(L.text, prim)};font-size:3.33vw;font-weight:800;letter-spacing:.05vw;padding:.52vw 2.08vw;text-transform:uppercase;white-space:nowrap}
.ti{margin-left:.73vw;align-self:flex-start;background:${bgc};font-size:1.77vw;padding:.42vw 2.08vw;white-space:nowrap}`,
      `<div class="sc"><div class="an"><div class="lt"><div class="r"><div class="ab"></div><div class="nm">${name}</div></div><div class="ti">${title}</div></div></div></div>`,
    );
  }
  if (L.style === "guest") {
    const sub = title.replace(/•/g, `<span style="color:${a}">•</span>`);
    return page(
      `${head}.lt{flex-direction:column;background:${bgc};border-top:.31vw solid ${a};padding:1.15vw 2.5vw;min-width:30vw;box-shadow:0 .6vw 2vw rgba(0,0,0,.35)}
.nm{font-size:2.9vw;font-weight:700;white-space:nowrap}
.ti{font-size:1.56vw;opacity:.92;margin-top:.2vw;white-space:nowrap}`,
      `<div class="sc"><div class="an"><div class="lt"><div class="nm">${name}</div><div class="ti">${sub}</div></div></div></div>`,
    );
  }
  if (L.style === "sport") {
    return page(
      `${head}.nb{background:${a};color:${color(L.bg, "#0a0c10")};font-size:5.7vw;font-weight:800;padding:0 1.9vw;display:flex;align-items:center;font-variant-numeric:tabular-nums}
.bx{background:${prim};color:${readable(L.text, prim)};padding:.94vw 2.1vw}
.nm{font-size:3.1vw;font-weight:800;text-transform:uppercase;white-space:nowrap}
.ti{font-size:1.67vw;white-space:nowrap}`,
      `<div class="sc"><div class="an"><div class="lt"><div class="nb">${esc(L.number)}</div><div class="bx"><div class="nm">${name}</div><div class="ti">${title}</div></div></div></div></div>`,
    );
  }

  // ---- classic styles
  const glass = L.style === "glass";
  const boxed = L.style === "box";
  const under = L.style === "underline";
  const box = glass
    ? `background:${rgba(L.bg, Math.min(L.bgOpacity, 55))};backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.22);border-left:0;box-shadow:0 1vw 3vw rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.3)`
    : boxed
      ? `background:${bgc};border:.25vw solid ${a};border-radius:.5vw`
      : under
        ? `background:linear-gradient(180deg,transparent,${rgba(L.bg, Math.min(L.bgOpacity, 70))});border-bottom:.35vw solid ${a}`
        : `background:${bgc}`;
  const bar = under || boxed ? "" : `<div class="bar"></div>`;
  return page(
    `${head}
.bar{width:.9vw;background:${a}${glass ? ";box-shadow:0 0 1.4vw " + a : ""}}
.box{${box};padding:1.2vw 2.6vw 1.2vw 1.6vw}
.n{font-size:3.4vw;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.t{font-size:1.9vw;color:${a};margin-top:.3vw;white-space:nowrap}`,
    `<div class="sc"><div class="an"><div class="lt">${bar}<div class="box"><div class="n">${name}</div><div class="t">${title}</div></div></div></div></div>`,
  );
}

function ticker(g: GraphicsConfig) {
  const { text, label, speed, accent, size, direction, pos, style } = g.ticker;
  const secs = Math.max(5, num(speed, 22, 5, 120));
  // One pass, then the bar slides away on its own (the engine also takes it off air).
  const once = g.ticker.loop === false;
  const k = scale(size);
  const at = spot(g.ticker.at);
  const bc = style === "broadcast";
  const barH = (bc ? 6.25 : 7) * k; // vh
  // Hand-placed: y 0 = top edge, 1 = bottom edge. The bar slides in from whichever side it is nearer.
  const edge = at ? `top:${(at.y * Math.max(0, 100 - barH)).toFixed(3)}vh` : pos === "top" ? "top:0" : "bottom:0";
  const fromTop = at ? at.y < 0.5 : pos === "top";
  const from = fromTop ? "-100%" : "100%";
  const move = direction === "right" ? "translateX(-100%)" : "translateX(100vw)";
  const to = direction === "right" ? "translateX(100vw)" : "translateX(-100%)";
  const a = color(accent, "#e5322d");
  const txt = color(g.ticker.textColor, "#ffffff");
  const news = style === "news";
  const bg0 = color(g.ticker.bg, "#ececec");
  const bgc = bc
    ? `background:linear-gradient(180deg,${shade(bg0, -0.06)} 0,${bg0} 14%,${bg0} 50%,${shade(bg0, -0.05)} 50%,${shade(bg0, -0.01)} 96%,${shade(bg0, -0.07)} 100%)`
    : style === "glass"
      ? `background:${rgba(g.ticker.bg, Math.min(g.ticker.bgOpacity, 55))};backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.25)`
      : style === "outline"
        ? `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)};border-top:.25vw solid ${a};border-bottom:.25vw solid ${a};box-sizing:border-box`
        : `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)}`;
  // News bar: several headlines (new lines or " | ") are run together with diamonds.
  const shown = news || bc
    ? text.split(/\n+| \| /).map((t) => t.trim()).filter(Boolean).join("     ◆     ")
    : text;
  const lbText = bc ? "#fff" : news ? contrast(a) : "#fff";
  return page(
    `.tk{position:absolute;left:0;right:0;${edge};height:${barH.toFixed(2)}vh;display:flex;${bgc};color:${txt};font-family:${font(g.ticker.font)};overflow:hidden;animation:up .5s ease both${once ? `,out .5s ease ${(secs + 0.5).toFixed(1)}s forwards` : ""}}
.lb{background:${a};color:${lbText};padding:0 2vw;display:flex;align-items:center;font-weight:800;font-size:${(2.4 * k).toFixed(2)}vw;letter-spacing:.1em;z-index:2${news ? ";box-shadow:.4vw 0 1.2vw rgba(0,0,0,.35)" : ""}}
.tr{flex:1;position:relative;overflow:hidden}
.tx{position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;font-size:${(2.6 * k).toFixed(2)}vw;animation:mq ${secs}s linear ${once ? "1 forwards" : "infinite"}}
@keyframes mq{from{transform:${move}}to{transform:${to}}}
@keyframes up{from{transform:translateY(${from})}to{transform:none}}
@keyframes out{from{transform:none}to{transform:translateY(${from})}}${
      bc
        ? `.tk{font-family:${fontB(g.ticker.font)}}.lb{background:${gloss(a)};min-width:6.6vw;box-sizing:border-box;padding:0 1vw 0 .6vw;font-weight:700;font-size:${(2.3 * k).toFixed(2)}vw;letter-spacing:.02em;text-shadow:0 .1vw .15vw rgba(0,0,0,.35);box-shadow:none}.tx{font-size:${(2.1 * k).toFixed(2)}vw;font-weight:500}`
        : ""
    }`,
    `<div class="tk">${label ? `<div class="lb">${esc(label)}</div>` : ""}<div class="tr"><div class="tx">${esc(shown)}</div></div></div>`,
  );
}

function clock(g: GraphicsConfig) {
  const C = g.clock;
  const { pos, seconds, h24 } = C;
  const at = spot(C.at);
  const where = at
    ? placeCss(at, scale(C.size))
    : `position:absolute;${POS[pos]};transform:scale(${scale(C.size)});transform-origin:${ORIGIN[pos]}`;
  const txt = color(C.textColor, "#ffffff");
  const a = color(C.accent, "#f5b700");
  const split = C.style === "split";
  const label = (C.label ?? "").trim();
  const look = split
    ? `.c{display:flex;color:${txt};font-family:${font(C.font)};font-size:2.4vw;font-weight:700;font-variant-numeric:tabular-nums}
.lab{background:${a};color:${contrast(a)};padding:.5vw 1.1vw;letter-spacing:.05em}
.tm{background:${rgba(C.bg, C.bgOpacity)};padding:.5vw 1.3vw}`
    : `.c{background:${rgba(C.bg, C.bgOpacity)};color:${txt};font-family:${font(C.font)};font-size:2.8vw;font-weight:700;padding:.6vw 1.6vw;border-radius:.6vw}`;
  return page(
    `.sc{${where}}${enter(C.anim, sideOf(pos, at), msOf(C))}${look}`,
    `<div class="sc"><div class="an"><div class="c">${split && label ? `<div class="lab">${esc(label)}</div>` : ""}<div class="tm" id="c">--:--</div></div></div></div>`,
    `var H24=${h24 ? "true" : "false"},SEC=${seconds ? "true" : "false"};function p(n){return String(n).padStart(2,'0')}
function t(){var d=new Date(),h=d.getHours(),s='';if(!H24){s=h>=12?' PM':' AM';h=h%12||12}
document.getElementById('c').textContent=p(h)+':'+p(d.getMinutes())+(SEC?':'+p(d.getSeconds()):'')+s}
t();setInterval(t,500);`,
  );
}

function badge(g: GraphicsConfig) {
  const B = g.badge;
  const { text, pos, color: c, style } = B;
  const at = spot(B.at);
  const where = at
    ? placeCss(at, scale(B.size))
    : `position:absolute;${POS[pos]};transform:scale(${scale(B.size)});transform-origin:${ORIGIN[pos]}`;
  const col = color(c, "#e5322d");
  const txt = color(B.textColor, "#ffffff");
  const head = `.sc{${where}}${enter(B.anim, sideOf(pos, at), msOf(B))}@keyframes p{50%{opacity:.25}}`;

  if (style === "gloss") {
    const right = pos === "tr" || pos === "br";
    const where2 = at
      ? where
      : `position:absolute;${right ? "right:0" : "left:0"};${pos === "bl" || pos === "br" ? "bottom:10vh" : "top:1vh"};transform:scale(${scale(B.size)});transform-origin:${ORIGIN[pos]}`;
    return page(
      `.sc{${where2}}${enter(B.anim, sideOf(pos, at), msOf(B))}
.g{display:flex;align-items:center;box-sizing:border-box;width:12.5vw;height:2.94vw;padding-left:.74vw;border-left:.44vw solid ${shade(col, -0.32)};border-bottom:.15vw solid ${shade(col, -0.55)};background:${gloss(col)};color:${txt};font-family:${fontB(B.font)};font-weight:700;font-size:1.7vw;letter-spacing:.03em;text-shadow:0 .1vw .15vw rgba(0,0,0,.35);white-space:nowrap}`,
      `<div class="sc"><div class="an"><div class="g">${esc(text)}</div></div></div>`,
    );
  }

  if (style === "location") {
    const locBg = color(B.locBg, "#0a1628");
    const loc = (B.location ?? "").trim();
    return page(
      `${head}.b{display:flex;font-family:${font(B.font)};font-weight:800;font-size:1.9vw}
.tg{display:flex;align-items:center;gap:.62vw;background:${col};color:${txt};padding:.42vw 1.04vw}
.d{width:.83vw;height:.83vw;border-radius:50%;background:${txt};animation:p 1.2s ease-in-out infinite}
.lc{background:${locBg};color:${contrast(locBg)};padding:.42vw 1.25vw;letter-spacing:.1em;text-transform:uppercase}`,
      `<div class="sc"><div class="an"><div class="b"><div class="tg"><span class="d"></span>${esc(text)}</div>${loc ? `<div class="lc">${esc(loc)}</div>` : ""}</div></div></div>`,
    );
  }

  const look =
    style === "outline"
      ? `background:transparent;border:.25vw solid ${col};color:${txt}`
      : style === "glass"
        ? `background:${rgba(col, 45)};backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);color:${txt}`
        : `background:${col};color:${txt}`;
  return page(
    `${head}.b{display:flex;align-items:center;gap:.8vw;${look};font-family:${font(B.font)};font-weight:800;font-size:2.4vw;letter-spacing:.1em;padding:.5vw 1.6vw;border-radius:.6vw}
.d{width:1.2vw;height:1.2vw;border-radius:50%;background:${style === "outline" ? col : txt};animation:p 1.2s ease-in-out infinite}`,
    `<div class="sc"><div class="an"><div class="b"><span class="d"></span>${esc(text)}</div></div></div>`,
  );
}

/**
 * News tags: [updates tag] over [main tag] over [below tag]. The page cycles the story's tags by itself
 * (fixed seconds each), so one press of PLAY runs the whole story; the next story is one more press.
 */
function news(g: GraphicsConfig) {
  const N = g.news;
  const tags = (Array.isArray(N.tags) ? N.tags : [])
    .slice(0, 20)
    .map((t) => ({ main: String(t?.main ?? "").slice(0, 160), below: String(t?.below ?? "").slice(0, 200) }))
    .filter((t) => t.main.trim() || t.below.trim());
  const kicker = (N.kicker ?? "").trim();
  if (!tags.length && !kicker) return page("", "");
  const prim = color(N.primary, "#0b4fa8");
  const acc = color(N.accent, "#f5b700");
  const dark = color(N.bg, "#0a1628");
  const txt = color(N.textColor, "#ffffff");
  const ms = Math.round(num(N.seconds, 6, 2, 120) * 1000);
  const start = Math.max(0, Math.min(Math.max(0, tags.length - 1), Math.round(num(N.start, 0, 0, 19))));
  const hasBelow = tags.some((t) => t.below.trim());
  const json = JSON.stringify(tags).replace(/</g, "\\u003c");
  const ff = fontB(N.font);
  const mainTxt = readable(N.textColor, prim);
  const belowTxt = readable(N.textColor, dark);
  return page(
    `.sc{position:absolute;left:.44vw;bottom:7vh;transform:scale(${scale(N.size)});transform-origin:bottom left}${enter(N.anim, "l", msOf(N))}
.st{width:85.9vw;font-family:${ff}}
.kk{display:inline-block;box-sizing:border-box;height:2.57vw;line-height:2.4vw;background:${acc};border-top:.15vw solid ${shade(acc, -0.55)};color:${contrast(acc)};font-size:2vw;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:0 2.94vw;white-space:nowrap}
.rw{display:flex}.ab{width:.88vw;flex:none}
.r1 .ab{background:linear-gradient(180deg,${shade(acc, -0.33)},${rgba(shade(acc, -0.33), 55)})}
.r2 .ab{background:linear-gradient(180deg,${shade(acc, -0.65)},${shade(acc, -0.35)})}
.mt{flex:1;min-width:0;height:3.55vw;display:flex;align-items:center;overflow:hidden;background:linear-gradient(180deg,${shade(prim, 0.01)},${shade(prim, -0.015)} 55%,${shade(prim, 0.03)});color:${mainTxt}}
.bl{flex:1;min-width:0;height:3.6vw;display:flex;align-items:center;overflow:hidden;background:${dark};box-shadow:inset 0 -.15vw 0 ${shade(dark, 0.1)};color:${belowTxt}}
.mt div,.bl div{box-sizing:border-box;width:100%;padding:0 2.2vw;white-space:nowrap;overflow:hidden}
.mt div{font-size:2.63vw;font-weight:700;line-height:1.1;text-transform:uppercase}
.bl div{font-size:2.2vw;font-weight:600;line-height:1.15;font-variant:small-caps;letter-spacing:.02em}
.o{animation:so .28s ease-in both}.i{animation:si .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes so{to{opacity:0;transform:translateY(-35%)}}@keyframes si{from{opacity:0;transform:translateY(45%)}to{opacity:1;transform:none}}`,
    `<div class="sc"><div class="an"><div class="st">${kicker ? `<div class="kk">${esc(kicker)}</div>` : ""}${tags.length ? `<div class="rw r1"><div class="ab"></div><div class="mt"><div id="m"></div></div></div>${hasBelow ? `<div class="rw r2"><div class="ab"></div><div class="bl"><div id="b"></div></div></div>` : ""}` : ""}</div></div></div><!--${Math.round(num(N.run, 0, 0, 1e9))}-->`,
    tags.length
      ? `var T=${json},MS=${ms},LOOP=${N.loop === false ? "false" : "true"},i=${start};
var m=document.getElementById('m'),b=document.getElementById('b'),bl=b&&b.closest('.r2');
function fit(e){e.style.fontSize='';var s=parseFloat(getComputedStyle(e).fontSize);while(e.scrollWidth>e.clientWidth&&s>8){s-=.5;e.style.fontSize=s+'px'}}
function put(n){var t=T[n];m.textContent=t.main;fit(m);if(b){b.textContent=t.below;bl.style.visibility=t.below.trim()?'visible':'hidden';fit(b)}}
function fx(c){m.className=c;if(b)b.className=c;if(b&&c==='i')b.style.animationDelay='.09s';else if(b)b.style.animationDelay='0s'}
function go(n){fx('o');setTimeout(function(){i=n;put(i);fx('i');wait()},280)}
function wait(){if(T.length<2)return;if(i>=T.length-1&&!LOOP)return;setTimeout(function(){go(i>=T.length-1?0:i+1)},MS)}
put(i);fx('i');wait();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){put(i)});`
      : "",
  );
}

function breaking(g: GraphicsConfig) {
  const B = g.breaking;
  const k = scale(B.size);
  const acc = color(B.accent, "#d0161d");
  return page(
    `.sc{position:absolute;left:0;right:0;bottom:8.5vh}${enter(B.anim, "l", msOf(B))}
.bn{display:flex;height:${(11 * k).toFixed(2)}vh;font-family:${font(B.font)}}
.lb{background:${acc};color:${contrast(acc)};font-size:${(2.8 * k).toFixed(2)}vw;font-weight:800;padding:0 2.5vw;display:flex;align-items:center;letter-spacing:.1vw;white-space:nowrap}
.lb span{animation:pl 1.2s ease-in-out infinite}
.hd{flex:1;min-width:0;background:${color(B.bg, "#ffffff")};color:${color(B.textColor, "#111111")};font-size:${(2.6 * k).toFixed(2)}vw;font-weight:700;display:flex;align-items:center;padding:0 2.1vw;line-height:1.1}
.hd div{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@keyframes pl{50%{opacity:.55}}`,
    `<div class="sc"><div class="an"><div class="bn"><div class="lb"><span>${esc(B.label)}</span></div><div class="hd"><div>${esc(B.headline)}</div></div></div></div></div>`,
  );
}

function score(g: GraphicsConfig) {
  const S = g.score;
  const at = spot(S.at);
  const where = at
    ? placeCss(at, scale(S.size))
    : `position:absolute;${POS[S.pos]};transform:scale(${scale(S.size)});transform-origin:${ORIGIN[S.pos]}`;
  const txt = color(S.textColor, "#ffffff");
  const dark = color(S.bg, "#0b130f");
  return page(
    `.sc{${where}}${enter(S.anim, sideOf(S.pos, at), msOf(S))}
.s{display:flex;font-family:${font(S.font)};font-size:2.1vw;font-weight:800;color:${txt}}
.tm{background:${color(S.primary, "#0f8a4a")};color:${readable(txt, color(S.primary, "#0f8a4a"))};padding:.42vw 1.25vw;letter-spacing:.05em}
.sb{background:${txt};color:${readable(dark, txt)};padding:.42vw 1.15vw;font-variant-numeric:tabular-nums}
.ck{background:${color(S.accent, "#d7ff3a")};color:${dark};padding:.42vw 1.15vw;font-variant-numeric:tabular-nums}`,
    `<div class="sc"><div class="an"><div class="s"><div class="tm">${esc(S.home)}</div><div class="sb">${esc(S.homeScore)}–${esc(S.awayScore)}</div><div class="tm">${esc(S.away)}</div>${S.clock ? `<div class="ck">${esc(S.clock)}</div>` : ""}</div></div></div>`,
  );
}

function social(g: GraphicsConfig) {
  const S = g.social;
  const a = color(S.accent, "#f5b700");
  const dark = color(S.bg, "#0a1628");
  const txt = color(S.textColor, "#ffffff");
  return page(
    `.sc{position:absolute;right:6.25vw;bottom:13vh;transform:scale(${scale(S.size)});transform-origin:bottom right}${enter(S.anim, "r", msOf(S))}
.s{display:flex;font-family:${font(S.font)};font-size:2.3vw;font-weight:700;border-radius:99vw;overflow:hidden;white-space:nowrap}
.pl{background:${a};color:${contrast(a)};padding:.73vw 1.56vw}
.hd{background:${dark};color:${readable(txt, dark)};padding:.73vw 1.9vw}`,
    `<div class="sc"><div class="an"><div class="s"><div class="pl">${esc(S.platform)}</div><div class="hd">${esc(S.handle)}</div></div></div></div>`,
  );
}

const lines = (v = "") =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
/** 1920x1080 design pixels -> vw / vh, so the full-screen cards scale to any output size. */
const vw = (px: number) => `${(px / 19.2).toFixed(3)}vw`;
const vh = (px: number) => `${(px / 10.8).toFixed(3)}vh`;

function full(g: GraphicsConfig) {
  const F = g.full;
  const prim = color(F.primary, "#0b4fa8");
  const sec = color(F.secondary, "#0a1628");
  const acc = color(F.accent, "#f5b700");
  const txt = color(F.textColor, "#ffffff");
  const ff = font(F.font);
  const base = `.sc{position:absolute;inset:0}${enter(F.anim, "l", msOf(F))}.an{position:absolute;inset:0}.fx{position:absolute;inset:0;font-family:${ff};color:${txt};overflow:hidden}`;

  if (F.kind === "quote") {
    return page(
      `${base}.fx{background:${sec};display:flex;flex-direction:column;justify-content:center;padding:0 ${vw(220)}}
.q{font-size:${vw(260)};color:${acc};line-height:.6;height:${vh(140)}}
.t{font-size:${vw(88)};font-weight:600;line-height:1.15}
.a{font-size:${vw(44)};margin-top:${vh(50)};color:${acc}}`,
      `<div class="sc"><div class="an"><div class="fx"><div class="q">“</div><div class="t">${esc(F.quote)}</div><div class="a">— ${esc(F.author)}</div></div></div></div>`,
    );
  }
  if (F.kind === "standings") {
    const rows = lines(F.rows)
      .slice(0, 12)
      .map((r, i) => {
        const [team = "", p = "", pts = ""] = r.split(",").map((x) => x.trim());
        return `<div class="r${i % 2 ? "" : " z"}"><div class="n">${i + 1}</div><div class="tm">${esc(team)}</div><div class="p">${esc(p)}</div><div class="pt">${esc(pts)}</div></div>`;
      })
      .join("");
    return page(
      `${base}.fx{background:${rgba(sec, 93)};padding:${vh(120)} ${vw(360)}}
.h{font-size:${vw(64)};font-weight:800;border-bottom:${vw(8)} solid ${acc};padding-bottom:${vh(16)}}
.r{display:flex;font-size:${vw(48)};padding:${vh(18)} 0;border-bottom:1px solid ${rgba(txt, 20)}}
.z{background:${rgba(prim, 33)}}
.n{width:${vw(90)};padding-left:${vw(20)};color:${acc};font-weight:800}.tm{flex:1}.p{width:${vw(140)};text-align:right}.pt{width:${vw(160)};text-align:right;padding-right:${vw(20)};font-weight:800}`,
      `<div class="sc"><div class="an"><div class="fx"><div class="h">${esc(F.title)}</div>${rows}</div></div></div>`,
    );
  }
  if (F.kind === "countdown") {
    const total = Math.max(0, Math.round(F.seconds));
    return page(
      `${base}.fx{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,${sec},${prim})}
.ti{font-size:${vw(48)};letter-spacing:${vw(12)};text-transform:uppercase;color:${acc}}
.cd{font-size:${vw(300)};font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.su{font-size:${vw(40)};opacity:.8}`,
      `<div class="sc"><div class="an"><div class="fx"><div class="ti">${esc(F.title)}</div><div class="cd" id="c">00:00</div><div class="su">${esc(F.subtitle)}</div></div></div></div>`,
      `var T=${total}*1000,S=Date.now();function p(n){return String(n).padStart(2,'0')}
function t(){var l=Math.max(0,T-(Date.now()-S));document.getElementById('c').textContent=p(Math.floor(l/60000))+':'+p(Math.floor((l%60000)/1000))}
t();setInterval(t,250);`,
    );
  }
  if (F.kind === "announcement") {
    return page(
      `${base}.fx{display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 40%,${prim},${sec})}
.ti{font-size:${vw(200)};font-weight:800;letter-spacing:${vw(10)};text-align:center}
.su{font-size:${vw(60)};color:${acc}}`,
      `<div class="sc"><div class="an"><div class="fx"><div class="ti">${esc(F.title)}</div><div class="su">${esc(F.subtitle)}</div></div></div></div>`,
    );
  }
  if (F.kind === "credits") {
    const secs = Math.max(5, Math.round(F.speed));
    const body = lines(F.lines)
      .map((l) => {
        const [r = "", n = ""] = l.split("—").map((x) => x.trim());
        return `<div class="l"><div class="ro">${esc(r)}</div><div class="na">${esc(n)}</div></div>`;
      })
      .join("");
    return page(
      `${base}.fx{background:${sec}}
.ro{font-size:${vw(34)};opacity:.7}.na{font-size:${vw(56)};font-weight:700}.l{margin-bottom:${vh(50)}}
.rl{text-align:center;animation:roll ${secs}s linear infinite}
.tt{font-size:${vw(90)};font-weight:800;color:${acc};margin-bottom:${vh(80)}}
@keyframes roll{from{transform:translateY(100vh)}to{transform:translateY(-100%)}}`,
      `<div class="sc"><div class="an"><div class="fx"><div class="rl"><div class="tt">${esc(F.title)}</div>${body}</div></div></div></div>`,
    );
  }
  // headline
  return page(
    `${base}.fx{background:linear-gradient(120deg,${sec} 55%,${prim});padding:${vh(180)} ${vw(160)}}
.k{font-size:${vw(40)};color:${acc};letter-spacing:${vw(8)};font-weight:700}
.hl{font-size:${vw(120)};font-weight:800;line-height:1.02;max-width:${vw(1400)};margin-top:${vh(24)}}
.bar{width:${vw(200)};height:${vw(10)};background:${acc};margin:${vh(48)} 0}
.bd{font-size:${vw(44)};max-width:${vw(1300)};opacity:.9}`,
    `<div class="sc"><div class="an"><div class="fx"><div class="k">${esc(F.kicker)}</div><div class="hl">${esc(F.headline)}</div><div class="bar"></div><div class="bd">${esc(F.body)}</div></div></div></div>`,
  );
}

export function layerUrl(id: GfxId, g: GraphicsConfig): string {
  switch (id) {
    case "logo":
      return logo(g);
    case "lower":
      return lower(g);
    case "ticker":
      return ticker(g);
    case "clock":
      return clock(g);
    case "badge":
      return badge(g);
    case "news":
      return news(g);
    case "breaking":
      return breaking(g);
    case "score":
      return score(g);
    case "social":
      return social(g);
    case "full":
      return full(g);
  }
}

/** Read an image file and shrink it so the data URL stays small. */
export function fileToLogo(file: File, maxWidth = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Not a valid image"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
