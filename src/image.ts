/**
 * PNG for link previews (1200 by 630) and square 1024 PNGs of a coin.
 * Pixel art, so no smoothing. Rasters are kept in memory by key.
 */
import { Resvg } from "@resvg/resvg-js";
import type { Coin } from "./coin.ts";
import { FONT_OPTS, esc, fitLine, fitSize } from "./cardtext.ts";
import { SITE } from "./site.ts";

const cards = new Map<string, Uint8Array>();
const squares = new Map<string, Uint8Array>();

export function cardSvg(title: string, sub: string, line: string, coin: Coin): string {
  const inner = coin.svg.replace(/^<svg [^>]*>/, "").replace(/<\/svg>$/, "");
  const bg = coin.palette.bg, fg = coin.palette.fg;
  const tl = fitLine(line, "Newsreader", 28, 400);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${bg}"/>
<svg x="30" y="30" width="570" height="570" viewBox="0 0 64 64" shape-rendering="crispEdges">${inner}</svg>
<rect x="30" y="30" width="570" height="570" fill="none" stroke="${fg}" stroke-opacity=".4" stroke-width="2"/>
<text x="662" y="150" font-family="Newsreader" font-size="40" fill="${fg}" fill-opacity=".7">${esc(sub)}</text>
<text x="654" y="290" font-family="Syne" font-weight="800" font-size="${fitSize(title, "Syne", 150, 800)}" fill="${fg}">${esc(title)}</text>
<text x="662" y="360" font-family="Newsreader" font-size="${tl.size}" fill="${fg}">${esc(tl.text)}</text>
<text x="662" y="560" font-family="Syne" font-weight="800" font-size="${fitSize(SITE, "Syne", 44, 800)}" fill="${fg}">${SITE}</text>
</svg>`;
}

export function cardPng(key: string, title: string, sub: string, line: string, coin: Coin): Uint8Array {
  const hit = cards.get(key);
  if (hit) return hit;
  const png = new Resvg(cardSvg(title, sub, line, coin), { fitTo: { mode: "width", value: 1200 }, font: FONT_OPTS }).render().asPng();
  if (cards.size > 500) cards.clear();
  cards.set(key, png);
  return png;
}

export const SQUARE_PX = 1024;
export function squarePng(key: string, coin: Coin): Uint8Array {
  const hit = squares.get(key);
  if (hit) return hit;
  const png = new Resvg(coin.svg, { fitTo: { mode: "width", value: SQUARE_PX }, imageRendering: 1 }).render().asPng();
  if (squares.size > 500) squares.clear();
  squares.set(key, png);
  return png;
}
