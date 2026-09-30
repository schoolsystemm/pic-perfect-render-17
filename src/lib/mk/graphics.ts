// Built-in on-air graphics. Each layer is an OBS browser source whose HTML is
// embedded in a data: URL — nothing to host or upload. Layers live in the
// "MK Graphics" scene and are switched on/off independently of the DSKs.
import type { Corner, GfxId, GraphicsConfig } from "./types";

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

const scale = (n: number) => Math.max(0.3, Math.min(3, (Number(n) || 100) / 100));

const page = (css: string, body: string, script = "") =>
  toDataUrl(
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`,
  );

function logo(g: GraphicsConfig) {
  const { image, pos, size } = g.logo;
  const img = image
    ? `<img src="${image}" style="position:absolute;${POS[pos]};width:${Math.max(3, Math.min(60, size))}vw;animation:in .5s ease both">`
    : "";
  return page("@keyframes in{from{opacity:0}to{opacity:1}}", img);
}

function lower(g: GraphicsConfig) {
  const a = color(g.lower.accent, "#f5a623");
  return page(
    `.sc{position:absolute;left:6vw;bottom:13vh;transform:scale(${scale(g.lower.size)});transform-origin:bottom left}
.lt{display:flex;animation:in .6s cubic-bezier(.2,.8,.2,1) both}
.bar{width:.9vw;background:${a}}
.box{background:rgba(10,12,16,.9);padding:1.2vw 2.6vw 1.2vw 1.6vw;color:#fff}
.n{font-size:3.4vw;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.t{font-size:1.9vw;color:${a};margin-top:.3vw;white-space:nowrap}
@keyframes in{from{transform:translateX(-120%);opacity:0}to{transform:none;opacity:1}}`,
    `<div class="sc"><div class="lt"><div class="bar"></div><div class="box"><div class="n">${esc(g.lower.name)}</div><div class="t">${esc(g.lower.title)}</div></div></div></div>`,
  );
}

function ticker(g: GraphicsConfig) {
  const { text, label, speed, accent, size, direction, pos } = g.ticker;
  const k = scale(size);
  const edge = pos === "top" ? "top:0" : "bottom:0";
  const from = pos === "top" ? "-100%" : "100%";
  const move = direction === "right" ? "translateX(-100%)" : "translateX(100vw)";
  const to = direction === "right" ? "translateX(100vw)" : "translateX(-100%)";
  const a = color(accent, "#e5322d");
  return page(
    `.tk{position:absolute;left:0;right:0;${edge};height:${(7 * k).toFixed(2)}vh;display:flex;background:rgba(10,12,16,.94);color:#fff;overflow:hidden;animation:up .5s ease both}
.lb{background:${a};padding:0 2vw;display:flex;align-items:center;font-weight:800;font-size:${(2.4 * k).toFixed(2)}vw;letter-spacing:.1em;z-index:2}
.tr{flex:1;position:relative;overflow:hidden}
.tx{position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;font-size:${(2.6 * k).toFixed(2)}vw;animation:mq ${Math.max(5, speed)}s linear infinite}
@keyframes mq{from{transform:${move}}to{transform:${to}}}
@keyframes up{from{transform:translateY(${from})}to{transform:none}}`,
    `<div class="tk">${label ? `<div class="lb">${esc(label)}</div>` : ""}<div class="tr"><div class="tx">${esc(text)}</div></div></div>`,
  );
}

function clock(g: GraphicsConfig) {
  const { pos, seconds, h24 } = g.clock;
  return page(
    `.c{position:absolute;${POS[pos]};transform:scale(${scale(g.clock.size)});transform-origin:${ORIGIN[pos]};background:rgba(10,12,16,.88);color:#fff;font-family:Consolas,monospace;font-size:2.8vw;font-weight:700;padding:.6vw 1.6vw;border-radius:.6vw;animation:in .5s ease both}
@keyframes in{from{opacity:0}to{opacity:1}}`,
    `<div class="c" id="c">--:--</div>`,
    `var H24=${h24},SEC=${seconds};function p(n){return String(n).padStart(2,'0')}
function t(){var d=new Date(),h=d.getHours(),s='';if(!H24){s=h>=12?' PM':' AM';h=h%12||12}
document.getElementById('c').textContent=p(h)+':'+p(d.getMinutes())+(SEC?':'+p(d.getSeconds()):'')+s}
t();setInterval(t,500);`,
  );
}

function badge(g: GraphicsConfig) {
  const { text, pos, color: c } = g.badge;
  const col = color(c, "#e5322d");
  return page(
    `.b{position:absolute;${POS[pos]};transform:scale(${scale(g.badge.size)});transform-origin:${ORIGIN[pos]};display:flex;align-items:center;gap:.8vw;background:${col};color:#fff;font-weight:800;font-size:2.4vw;letter-spacing:.1em;padding:.5vw 1.6vw;border-radius:.6vw;animation:in .4s ease both}
.d{width:1.2vw;height:1.2vw;border-radius:50%;background:#fff;animation:p 1.2s ease-in-out infinite}
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
