/**
 * Fixtures for the TS ↔ Solidity byte-equality tests. TypeScript is the source
 * of truth. Each case carries the input, the 4096-byte grid of colour slots,
 * the palette, the SVG and the metadata JSON the contract must reproduce.
 *
 * Cases: twelve random seeds; one seed per value of every trait table (found
 * by search, so every branch of the renderer runs); every master; one seed
 * across every yield level; a founder coin; a partly funded founder coin.
 */
import { renderCoin, designOf, traitsOf, nextRandom, MASTERS, YIELD_STEPS, type Traits } from "../src/coin.ts";
import { metadataOf, type MetaInput } from "../src/metadata.ts";
import { TABLES } from "../src/site.ts";

type Case = MetaInput & { why: string };
const base = { series: 1, backing: 25, yieldBps: 0, master: -1, founder: false };
const full = (backing: number) => BigInt(backing) * 1000000n;
const cases: Case[] = [];
const seedAt = (i: bigint) => nextRandom(i * 0x9e3779b97f4a7c15n);

for (let i = 1n; i <= 12n; i++) cases.push({ ...base, seed: seedAt(i), number: Number(i), backing: [10, 25, 50][Number(i) % 3], fundedUnits: full([10, 25, 50][Number(i) % 3]), lifetimeUnits: 0n, why: "random" });

// One seed per trait value.
const KEYS: (keyof Traits)[] = ["material", "ground", "rim", "field", "symmetry", "core", "glyph", "surface", "halo", "accent", "anomaly"];
TABLES.forEach((tb, ti) => {
  for (const value of tb.names) {
    for (let s = 1n; s < 400000n; s++) {
      const seed = nextRandom(s * 7n + 3n);
      const t = traitsOf(designOf(seed));
      if (String(t[KEYS[ti]]) === value) {
        cases.push({ ...base, seed, number: 100 + cases.length, fundedUnits: full(25), lifetimeUnits: 0n, why: `${tb.trait} ${value}` });
        break;
      }
    }
  }
});

// Every master, with a 50 USDC backing so the legend reads 50.
MASTERS.forEach((m, i) => cases.push({ ...base, seed: seedAt(1000n + BigInt(i)), number: 500 + i, backing: 50, fundedUnits: full(50), lifetimeUnits: 0n, master: i, why: `master ${m.name}` }));

// One seed across every yield level, with the lifetime figure it implies.
for (const bps of [0, ...YIELD_STEPS]) cases.push({ ...base, seed: seedAt(77n), number: 3871, yieldBps: bps, fundedUnits: full(25), lifetimeUnits: (full(25) * BigInt(bps)) / 10000n, why: `yield ${bps}` });

// A founder coin, full; a founder coin funded in part; a series II coin with a large number.
cases.push({ ...base, seed: seedAt(2001n), number: 1, backing: 50, founder: true, fundedUnits: full(50), lifetimeUnits: 1234567n, yieldBps: 246, why: "founder" });
cases.push({ ...base, seed: seedAt(2002n), number: 201, backing: 50, founder: true, fundedUnits: 12400000n, lifetimeUnits: 0n, why: "founder part funded" });
cases.push({ ...base, seed: seedAt(2003n), number: 9999, series: 2, backing: 10, fundedUnits: full(10), lifetimeUnits: 0n, why: "series II" });
cases.push({ ...base, seed: seedAt(2004n), number: 10000, series: 14, backing: 10, fundedUnits: full(10), lifetimeUnits: 0n, why: "series XIV" });
cases.push({ ...base, seed: 0n, number: 123, backing: 25, sealed: true, fundedUnits: full(25), lifetimeUnits: 0n, why: "sealed" });
cases.push({ ...base, seed: 0n, number: 124, backing: 50, sealed: true, founder: true, yieldBps: 2000, fundedUnits: 0n, lifetimeUnits: 0n, why: "sealed founder with a ring" });

const hexOf = (b: Uint8Array) => "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
const out = cases.map((c) => {
  const { json, coin } = metadataOf(c);
  return {
    why: c.why,
    seed: c.seed.toString(),
    number: c.number,
    series: c.series,
    backing: c.backing,
    yieldBps: c.yieldBps,
    master: c.master,
    founder: c.founder,
    sealed: c.sealed === true,
    fundedUnits: c.fundedUnits.toString(),
    lifetimeUnits: c.lifetimeUnits.toString(),
    grid: hexOf(coin.grid.g),
    colors: coin.colors,
    svg: coin.svg,
    json,
    traits: coin.traits,
    masterName: coin.masterName,
    yieldLevel: coin.yieldLevel,
  };
});
await Bun.write(new URL("./test/fixtures/coin_cases.json", import.meta.url).pathname, JSON.stringify(out));
console.log(`${out.length} cases`);
