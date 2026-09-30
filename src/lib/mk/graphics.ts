// On-air graphics: a logo bug and a lower third, rendered as OBS browser sources.
// The HTML is embedded in a data: URL, so nothing needs hosting or uploading.
import type { GraphicsConfig } from "./types";

export const GFX_SCENE = "MK Graphics";
export const GFX_LOWER = "MK Lower Third";
export const GFX_LOGO = "MK Logo";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const safeColor = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#f5a623");

const toDataUrl = (html: string) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

const BASE_CSS =
  "html,body{margin:0;background:transparent;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}";

export function lowerThirdUrl(g: GraphicsConfig): string {
  const accent = safeColor(g.accent);
  return toDataUrl(
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
.lt{position:absolute;left:6vw;bottom:9vh;display:flex;animation:in .6s cubic-bezier(.2,.8,.2,1) both}
.bar{width:.9vw;background:${accent}}
.box{background:rgba(10,12,16,.9);padding:1.2vw 2.6vw 1.2vw 1.6vw;color:#fff}
.n{font-size:3.4vw;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.t{font-size:1.9vw;color:${accent};margin-top:.3vw;white-space:nowrap}
@keyframes in{from{transform:translateX(-120%);opacity:0}to{transform:none;opacity:1}}
</style></head><body><div class="lt"><div class="bar"></div><div class="box"><div class="n">${esc(g.lowerName)}</div><div class="t">${esc(g.lowerTitle)}</div></div></div></body></html>`,
  );
}

const POS: Record<GraphicsConfig["logoPos"], string> = {
  tl: "top:4vh;left:3vw",
  tr: "top:4vh;right:3vw",
  bl: "bottom:4vh;left:3vw",
  br: "bottom:4vh;right:3vw",
};

export function logoUrl(g: GraphicsConfig): string {
  const img = g.logo
    ? `<img src="${g.logo}" style="position:absolute;${POS[g.logoPos]};width:${Math.max(3, Math.min(60, g.logoSize))}vw;animation:in .5s ease both">`
    : "";
  return toDataUrl(
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
@keyframes in{from{opacity:0}to{opacity:1}}</style></head><body>${img}</body></html>`,
  );
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
