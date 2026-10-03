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
  // Newer layers go last: later = higher in the OBS scene, so Breaking sits on top of everything.
  { id: "score", name: "MK Scoreboard", label: "Scoreboard" },
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

const FONT: Record<GfxFont, string> = {
  sans: "'Segoe UI',Arial,sans-serif",
  condensed: "'Barlow Condensed','Arial Narrow','Roboto Condensed',Arial,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "Consolas,'JetBrains Mono',monospace",
};
const font = (f: string) => FONT[f as GfxFont] ?? FONT.sans;

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

const scale = (n: number) => Math.max(0.3, Math.min(3, (Number(n) || 100) / 100));

const page = (css: string, body: string, script = "") =>
  toDataUrl(
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`,
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
    `.sc{${where}}${enter(g.logo.anim, sideOf(pos, at))}.m{opacity:${op};color:${tc};border:${(w * 0.0175).toFixed(2)}vw solid ${tc};font-size:${(w * 0.21).toFixed(2)}vw;font-weight:800;letter-spacing:.08em;padding:.05em .35em;white-space:nowrap}`,
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
  const head = `.sc{${sc}}${enter(L.anim, sideOf("bl", at))}.lt{display:flex;font-family:${ff};color:${txt}}`;
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
  const barH = 7 * k; // vh
  // Hand-placed: y 0 = top edge, 1 = bottom edge. The bar slides in from whichever side it is nearer.
  const edge = at ? `top:${(at.y * Math.max(0, 100 - barH)).toFixed(3)}vh` : pos === "top" ? "top:0" : "bottom:0";
  const fromTop = at ? at.y < 0.5 : pos === "top";
  const from = fromTop ? "-100%" : "100%";
  const move = direction === "right" ? "translateX(-100%)" : "translateX(100vw)";
  const to = direction === "right" ? "translateX(100vw)" : "translateX(-100%)";
  const a = color(accent, "#e5322d");
  const txt = color(g.ticker.textColor, "#ffffff");
  const news = style === "news";
  const bgc =
    style === "glass"
      ? `background:${rgba(g.ticker.bg, Math.min(g.ticker.bgOpacity, 55))};backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.25)`
      : style === "outline"
        ? `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)};border-top:.25vw solid ${a};border-bottom:.25vw solid ${a};box-sizing:border-box`
        : `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)}`;
  // News bar: several headlines (new lines or " | ") are run together with diamonds.
  const shown = news
    ? text.split(/\n+| \| /).map((t) => t.trim()).filter(Boolean).join("     ◆     ")
    : text;
  const lbText = news ? contrast(a) : "#fff";
  return page(
    `.tk{position:absolute;left:0;right:0;${edge};height:${(7 * k).toFixed(2)}vh;display:flex;${bgc};color:${txt};font-family:${font(g.ticker.font)};overflow:hidden;animation:up .5s ease both${once ? `,out .5s ease ${(secs + 0.5).toFixed(1)}s forwards` : ""}}
.lb{background:${a};color:${lbText};padding:0 2vw;display:flex;align-items:center;font-weight:800;font-size:${(2.4 * k).toFixed(2)}vw;letter-spacing:.1em;z-index:2${news ? ";box-shadow:.4vw 0 1.2vw rgba(0,0,0,.35)" : ""}}
.tr{flex:1;position:relative;overflow:hidden}
.tx{position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;font-size:${(2.6 * k).toFixed(2)}vw;animation:mq ${secs}s linear ${once ? "1 forwards" : "infinite"}}
@keyframes mq{from{transform:${move}}to{transform:${to}}}
@keyframes up{from{transform:translateY(${from})}to{transform:none}}
@keyframes out{from{transform:none}to{transform:translateY(${from})}}`,
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
    `.sc{${where}}${enter(C.anim, sideOf(pos, at))}${look}`,
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
  const head = `.sc{${where}}${enter(B.anim, sideOf(pos, at))}@keyframes p{50%{opacity:.25}}`;

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

function breaking(g: GraphicsConfig) {
  const B = g.breaking;
  const k = scale(B.size);
  const acc = color(B.accent, "#d0161d");
  return page(
    `.sc{position:absolute;left:0;right:0;bottom:8.5vh}${enter(B.anim, "l")}
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
    `.sc{${where}}${enter(S.anim, sideOf(S.pos, at))}
.s{display:flex;font-family:${font(S.font)};font-size:2.1vw;font-weight:800;color:${txt}}
.tm{background:${color(S.primary, "#0f8a4a")};color:${readable(txt, color(S.primary, "#0f8a4a"))};padding:.42vw 1.25vw;letter-spacing:.05em}
.sb{background:${txt};color:${readable(dark, txt)};padding:.42vw 1.15vw;font-variant-numeric:tabular-nums}
.ck{background:${color(S.accent, "#d7ff3a")};color:${dark};padding:.42vw 1.15vw;font-variant-numeric:tabular-nums}`,
    `<div class="sc"><div class="an"><div class="s"><div class="tm">${esc(S.home)}</div><div class="sb">${esc(S.homeScore)}–${esc(S.awayScore)}</div><div class="tm">${esc(S.away)}</div>${S.clock ? `<div class="ck">${esc(S.clock)}</div>` : ""}</div></div></div>`,
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
    case "breaking":
      return breaking(g);
    case "score":
      return score(g);
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
