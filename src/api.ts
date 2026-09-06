/** JSON for other people's code and the hub. Everything here is derived; nothing is stored. */
import { YIELD_STEPS, MASTERS, fingerprint, roman } from "./coin.ts";
import { SERIES_SIZE, MASTERS_PER_SERIES, FOUNDER_PER_SERIES, BACKINGS, PREVIEW_SUPPLY, previewCoin, previewInput, mastersFound } from "./preview.ts";
import { SITE, FEE_PCT, PREVIEW, TABLES, attributesOf, oneInOf, rarestOf } from "./site.ts";

export function coinJson(n: number) {
  const c = previewCoin(n);
  const inp = previewInput(n);
  return {
    id: n,
    series: inp.series,
    seed: inp.seed.toString(),
    fingerprint: fingerprint(inp.seed),
    master: c.masterName || null,
    founder: inp.founder,
    backingUsdc: inp.backing,
    yieldBps: inp.yieldBps,
    yieldLevel: c.yieldLevel,
    attributes: attributesOf(c, inp),
    rarity: c.masterName ? null : { oneIn: oneInOf(c.traits), rarest: rarestOf(c.traits) },
    image: `https://${SITE}/coin/${n}.svg`,
    png: `https://${SITE}/coin/${n}-1024.png`,
    card: `https://${SITE}/coin/${n}.png`,
    url: `https://${SITE}/coin/${n}`,
    preview: PREVIEW,
  };
}

export function stateJson() {
  const recent = Array.from({ length: Math.min(40, PREVIEW_SUPPLY) }, (_, i) => PREVIEW_SUPPLY - i).map(coinJson);
  return {
    site: SITE,
    kind: "coins",
    preview: PREVIEW,
    contract: null,
    series: 1,
    seriesName: roman(1),
    seriesSize: SERIES_SIZE,
    totalSupply: PREVIEW_SUPPLY,
    left: SERIES_SIZE - PREVIEW_SUPPLY,
    mastersPerSeries: MASTERS_PER_SERIES,
    mastersFound: mastersFound().size,
    founderPerSeries: FOUNDER_PER_SERIES,
    backings: BACKINGS,
    feePercentOfYield: FEE_PCT,
    yieldSteps: YIELD_STEPS,
    recent,
  };
}

export function specJson() {
  return {
    site: SITE,
    seriesSize: SERIES_SIZE,
    mastersPerSeries: MASTERS_PER_SERIES,
    masters: MASTERS.map((m) => ({ name: m.name, mode: m.mode, material: m.material })),
    backings: BACKINGS,
    feePercentOfYield: FEE_PCT,
    yieldSteps: YIELD_STEPS,
    traits: TABLES.map((tb) => {
      const total = tb.weights.reduce((a, b) => a + b, 0);
      return { trait: tb.trait, values: tb.names.map((n, i) => ({ value: n, odds: tb.weights[i] / total })) };
    }),
    image: "64 by 64 pixel grid, SVG with one path per colour, drawn on chain",
  };
}
