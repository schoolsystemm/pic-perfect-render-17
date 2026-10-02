// Built-in on-air graphics. Each layer is an OBS browser source whose HTML is
// embedded in a data: URL — nothing to host or upload. Layers live in the
// "MK Graphics" scene and are switched on/off independently of the DSKs.
import type { PlacePos } from "./fx";
import type { Corner, GfxFont, GfxId, GraphicsConfig } from "./types";

export const GFX_SCENE = "MK Graphics";

export const GFX_LAYERS: { id: GfxId; name: string; label: string }[] = [
  { id: "logo", name: "MK Logo", label: "Logo" },
  { id: "lower", name: "MK Lower Third", label: "Lower Third" },
  { id: "ticker", name: "MK Ticker", label: "Ticker" },
  { id: "clock", name: "MK Clock", label: "Clock" },
  { id: "badge", name: "MK Badge", label: "Live Badge" },
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

function logo(g: GraphicsConfig) {
  const { pos, size, opacity } = g.logo;
  const at = spot(g.logo.at);
  const image = safeImage(g.logo.image);
  const where = at ? placeCss(at) : `position:absolute;${POS[pos]}`;
  const img = image
    ? `<img src="${image}" style="${where};width:${num(size, 12, 3, 60)}vw;opacity:${num(opacity, 100, 5, 100) / 100};animation:in .5s ease both">`
    : "";
  return page("@keyframes in{from{opacity:0}to{opacity:1}}", img);
}

function lower(g: GraphicsConfig) {
  const L = g.lower;
  const a = color(L.accent, "#f5a623");
  const txt = color(L.text, "#ffffff");
  const bgc = rgba(L.bg, L.bgOpacity);
  const ff = font(L.font);
  const at = spot(L.at);
  const sc = at
    ? placeCss(at, scale(L.size))
    : `position:absolute;left:6vw;bottom:13vh;transform:scale(${scale(L.size)});transform-origin:bottom left`;
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
    `.sc{${sc}}
.lt{display:flex;animation:in .6s cubic-bezier(.2,.8,.2,1) both;font-family:${ff}}
.bar{width:.9vw;background:${a}${glass ? ";box-shadow:0 0 1.4vw " + a : ""}}
.box{${box};padding:1.2vw 2.6vw 1.2vw 1.6vw;color:${txt}}
.n{font-size:3.4vw;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.t{font-size:1.9vw;color:${a};margin-top:.3vw;white-space:nowrap}
@keyframes in{from{transform:translateX(-120%);opacity:0}to{transform:none;opacity:1}}`,
    `<div class="sc"><div class="lt">${bar}<div class="box"><div class="n">${esc(L.name)}</div><div class="t">${esc(L.title)}</div></div></div></div>`,
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
  const bgc =
    style === "glass"
      ? `background:${rgba(g.ticker.bg, Math.min(g.ticker.bgOpacity, 55))};backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.25)`
      : style === "outline"
        ? `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)};border-top:.25vw solid ${a};border-bottom:.25vw solid ${a};box-sizing:border-box`
        : `background:${rgba(g.ticker.bg, g.ticker.bgOpacity)}`;
  return page(
    `.tk{position:absolute;left:0;right:0;${edge};height:${(7 * k).toFixed(2)}vh;display:flex;${bgc};color:${txt};font-family:${font(g.ticker.font)};overflow:hidden;animation:up .5s ease both${once ? `,out .5s ease ${(secs + 0.5).toFixed(1)}s forwards` : ""}}
.lb{background:${a};color:#fff;padding:0 2vw;display:flex;align-items:center;font-weight:800;font-size:${(2.4 * k).toFixed(2)}vw;letter-spacing:.1em;z-index:2}
.tr{flex:1;position:relative;overflow:hidden}
.tx{position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;font-size:${(2.6 * k).toFixed(2)}vw;animation:mq ${secs}s linear ${once ? "1 forwards" : "infinite"}}
@keyframes mq{from{transform:${move}}to{transform:${to}}}
@keyframes up{from{transform:translateY(${from})}to{transform:none}}
@keyframes out{from{transform:none}to{transform:translateY(${from})}}`,
    `<div class="tk">${label ? `<div class="lb">${esc(label)}</div>` : ""}<div class="tr"><div class="tx">${esc(text)}</div></div></div>`,
  );
}

function clock(g: GraphicsConfig) {
  const { pos, seconds, h24 } = g.clock;
  const at = spot(g.clock.at);
  const where = at
    ? placeCss(at, scale(g.clock.size))
    : `position:absolute;${POS[pos]};transform:scale(${scale(g.clock.size)});transform-origin:${ORIGIN[pos]}`;
  return page(
    `.c{${where};background:${rgba(g.clock.bg, g.clock.bgOpacity)};color:${color(g.clock.textColor, "#ffffff")};font-family:${font(g.clock.font)};font-size:2.8vw;font-weight:700;padding:.6vw 1.6vw;border-radius:.6vw;animation:in .5s ease both}
@keyframes in{from{opacity:0}to{opacity:1}}`,
    `<div class="c" id="c">--:--</div>`,
    `var H24=${h24 ? "true" : "false"},SEC=${seconds ? "true" : "false"};function p(n){return String(n).padStart(2,'0')}
function t(){var d=new Date(),h=d.getHours(),s='';if(!H24){s=h>=12?' PM':' AM';h=h%12||12}
document.getElementById('c').textContent=p(h)+':'+p(d.getMinutes())+(SEC?':'+p(d.getSeconds()):'')+s}
t();setInterval(t,500);`,
  );
}

function badge(g: GraphicsConfig) {
  const { text, pos, color: c, style } = g.badge;
  const at = spot(g.badge.at);
  const where = at
    ? placeCss(at, scale(g.badge.size))
    : `position:absolute;${POS[pos]};transform:scale(${scale(g.badge.size)});transform-origin:${ORIGIN[pos]}`;
  const col = color(c, "#e5322d");
  const txt = color(g.badge.textColor, "#ffffff");
  const look =
    style === "outline"
      ? `background:transparent;border:.25vw solid ${col};color:${txt}`
      : style === "glass"
        ? `background:${rgba(col, 45)};backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);color:${txt}`
        : `background:${col};color:${txt}`;
  return page(
    `.b{${where};display:flex;align-items:center;gap:.8vw;${look};font-family:${font(g.badge.font)};font-weight:800;font-size:2.4vw;letter-spacing:.1em;padding:.5vw 1.6vw;border-radius:.6vw;animation:in .4s ease both}
.d{width:1.2vw;height:1.2vw;border-radius:50%;background:${style === "outline" ? col : txt};animation:p 1.2s ease-in-out infinite}
@keyframes p{50%{opacity:.25}}@keyframes in{from{opacity:0}to{opacity:1}}`,
    `<div class="b"><span class="d"></span>${esc(text)}</div>`,
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
