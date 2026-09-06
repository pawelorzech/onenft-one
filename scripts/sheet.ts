/**
 * Review sheets: grids of coins as PNG in out/.
 *   bun run scripts/sheet.ts coins [count] [seedStart]   random coins
 *   bun run scripts/sheet.ts masters                     the fifty 1/1s
 *   bun run scripts/sheet.ts yield [seed]                one coin across yield levels
 *   bun run scripts/sheet.ts one <seed> [yieldBps]       one coin, big
 */
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderCoin, nextRandom, MASTERS, YIELD_STEPS } from "../src/coin.ts";

const [, , what = "coins", arg1, arg2] = process.argv;
mkdirSync("out", { recursive: true });

function png(svg: string, width: number): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true } });
  return Buffer.from(r.render().asPng());
}

function grid(svgs: string[], cols: number, cell: number, name: string) {
  const rows = Math.ceil(svgs.length / cols);
  let inner = "";
  svgs.forEach((svg, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const body = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/id="(\w+)"/g, `id="c${i}$1"`).replace(/href="#(\w+)"/g, `href="#c${i}$1"`).replace(/url\(#(\w+)\)/g, `url(#c${i}$1)`);
    inner += `<svg x="${x}" y="${y}" width="${cell}" height="${cell}" viewBox="0 0 64 64" shape-rendering="crispEdges">${body}</svg>`;
  });
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}">${inner}</svg>`;
  writeFileSync(`out/${name}.png`, png(sheet, cols * cell));
  console.log(`out/${name}.png (${svgs.length} coins)`);
}

const seedAt = (i: number) => nextRandom(BigInt(i) * 7919n + 17n);
const backingOf = (i: number) => [10, 25, 50][i % 3];

if (what === "coins") {
  const count = Number(arg1 ?? 36);
  const start = Number(arg2 ?? 0);
  const svgs: string[] = [];
  for (let i = start; i < start + count; i++) {
    svgs.push(renderCoin({ seed: seedAt(i), number: i + 1, series: 1, backing: backingOf(i), yieldBps: 0, master: -1, founder: false }).svg);
  }
  grid(svgs, 6, 256, `coins-${start}`);
} else if (what === "masters") {
  const svgs = MASTERS.map((_, i) =>
    renderCoin({ seed: seedAt(1000 + i), number: 100 + i, series: 1, backing: backingOf(i), yieldBps: 0, master: i, founder: false }).svg,
  );
  grid(svgs, 10, 256, "masters");
} else if (what === "yield") {
  const seed = arg1 ? BigInt(arg1) : seedAt(3);
  const svgs = [0, ...YIELD_STEPS].map((bps) =>
    renderCoin({ seed, number: 3871, series: 1, backing: 25, yieldBps: bps, master: -1, founder: false }).svg,
  );
  grid(svgs, 5, 256, "yield");
} else if (what === "one") {
  const seed = BigInt(arg1 ?? "0");
  const coin = renderCoin({ seed, number: 1, series: 1, backing: 25, yieldBps: Number(arg2 ?? 0), master: -1, founder: false });
  writeFileSync("out/one.svg", coin.svg);
  writeFileSync("out/one.png", png(coin.svg, 1024));
  console.log(coin.traits, coin.svg.length, "bytes");
}
