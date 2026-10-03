// One-tap graphics themes: a palette + font + matching broadcast styles applied to every layer at once.
// They only change the Studio draft — press Save there to push the look into OBS.
import type { BadgeStyle, GfxFont, GraphicsConfig, LowerStyle, TickerStyle } from "./types";

export interface GfxTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  font: GfxFont;
  lower: LowerStyle;
  /** Text colour on the dark surfaces (clock, lower strap) when `text` is made for light ones. */
  onDark?: string;
  /** Own ticker look + light bar colour (default: News bar in the secondary colour). */
  tickerStyle?: TickerStyle;
  tickerBg?: string;
  /** Own live-badge look (default: Live + location). */
  badge?: BadgeStyle;
}

const lum = (hex: string) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

export const GFX_THEMES: GfxTheme[] = [
  { id: "broadcast", name: "Broadcast Red", primary: "#e8e8e8", secondary: "#1d1d1d", accent: "#cf0102", text: "#262626", font: "condensed", lower: "presenter", onDark: "#ffffff", tickerStyle: "broadcast", tickerBg: "#ececec", badge: "gloss" },
  { id: "news", name: "Modern News", primary: "#0b4fa8", secondary: "#0a1628", accent: "#f5b700", text: "#ffffff", font: "condensed", lower: "presenter" },
  { id: "university", name: "University TV", primary: "#7a1f2b", secondary: "#1b1414", accent: "#e8c766", text: "#ffffff", font: "sans", lower: "guest" },
  { id: "sports", name: "Sports", primary: "#0f8a4a", secondary: "#0b130f", accent: "#d7ff3a", text: "#ffffff", font: "condensed", lower: "sport" },
  { id: "corporate", name: "Corporate", primary: "#2f3b4c", secondary: "#f4f5f7", accent: "#00a3a3", text: "#13202f", font: "sans", lower: "presenter" },
  { id: "event", name: "Event", primary: "#c2410c", secondary: "#140b07", accent: "#fde68a", text: "#ffffff", font: "serif", lower: "guest" },
];

const LIVE_RED = "#d0161d";

/** Re-colour and re-style every layer from a theme. Text, positions, sizes and scroll presets are kept. */
export function applyTheme(g: GraphicsConfig, t: GfxTheme): GraphicsConfig {
  return {
    // The logo mark floats over the picture (not on a coloured bar), so it stays white in every theme.
    logo: { ...g.logo, textColor: "#ffffff" },
    lower: { ...g.lower, style: t.lower, primary: t.primary, accent: t.accent, bg: t.secondary, bgOpacity: 96, text: t.onDark ?? t.text, font: t.font },
    ticker: { ...g.ticker, style: t.tickerStyle ?? "news", accent: t.accent, bg: t.tickerBg ?? t.secondary, bgOpacity: t.tickerBg ? 100 : 96, textColor: t.text, font: t.font },
    clock: { ...g.clock, style: "split", label: g.clock.label || "EAT", accent: t.accent, bg: t.secondary, bgOpacity: 100, textColor: lum(t.secondary) < 128 ? (t.onDark ?? "#ffffff") : t.text, font: t.font },
    badge: { ...g.badge, style: t.badge ?? "location", color: t.badge === "gloss" ? t.accent : LIVE_RED, locBg: t.secondary, textColor: "#ffffff", font: t.font },
    news: { ...g.news, primary: t.primary, accent: t.accent, bg: t.secondary, textColor: t.text, font: t.font },
    breaking: { ...g.breaking, accent: LIVE_RED, font: t.font },
    score: { ...g.score, primary: t.primary, accent: t.accent, bg: t.secondary, textColor: t.text, font: t.font },
    social: { ...g.social, accent: t.accent, bg: t.secondary, textColor: t.text, font: t.font },
    full: { ...g.full, primary: t.primary, secondary: t.secondary, accent: t.accent, textColor: t.text, font: t.font },
  };
}
