/**
 * Text that fits the card. resvg measures a string in the card's own fonts,
 * so the wordmark can shrink to the width it has and a trait line can shrink
 * a little and then lose items from its end. Widths grow with the font size,
 * so one measurement per string is enough; they are kept by string.
 */
import { Resvg } from "@resvg/resvg-js";

const fontDir = new URL("../assets/fonts/", import.meta.url).pathname;
export const FONTS = [fontDir + "Syne-ExtraBold.ttf", fontDir + "Newsreader.ttf"];
export const FONT_OPTS = { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Newsreader" };

/** The right column starts at x=662 and ends 30 px before the edge. */
export const COLUMN = 1200 - 662 - 30;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const widths = new Map<string, number>();
/** Width in px of `text` set in `family` at `size`. */
export function textWidth(text: string, family: string, size: number, weight = 400): number {
  const key = `${family}|${weight}|${size}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="600"><text x="0" y="400" font-family="${family}" font-weight="${weight}" font-size="${size}">${esc(text)}</text></svg>`;
  const box = new Resvg(svg, { font: FONT_OPTS }).getBBox();
  const w = box ? box.width : 0;
  widths.set(key, w);
  return w;
}

/** The largest size, at most `size`, at which `text` fits `max` px; half-pixel steps. */
export function fitSize(text: string, family: string, size: number, weight: number, max = COLUMN): number {
  const w = textWidth(text, family, size, weight);
  if (w <= max) return size;
  return Math.max(1, Math.floor((size * max) / w * 2) / 2);
}

/**
 * A line that fits: at `size` when it can, smaller down to `min` when it
 * must, and with items dropped from the end (split on ", ") when even that
 * is not enough. A single item still too long is cut to fit with an ellipsis.
 */
export function fitLine(text: string, family: string, size: number, weight: number, max = COLUMN, min = Math.round(size * 0.8)): { text: string; size: number } {
  const items = text.split(", ");
  for (let n = items.length; n >= 1; n--) {
    const t = items.slice(0, n).join(", ");
    const s = fitSize(t, family, size, weight, max);
    if (s >= min) return { text: t, size: s };
  }
  let one = items[0] ?? "";
  while (one.length > 1 && textWidth(`${one}…`, family, min, weight) > max) one = one.slice(0, -1).trimEnd();
  return { text: `${one}…`, size: min };
}
