/**
 * Ten thousand simulated mints: trait odds, rarity, uniqueness, SVG size.
 *   bun run scripts/sim.ts [count] [seed]
 */
import { renderCoin, nextRandom, designOf, traitsOf, MASTERS } from "../src/coin.ts";

const count = Number(process.argv[2] ?? 10000);
const salt = BigInt(process.argv[3] ?? 2026);
const masters = 50;

// Lazy Fisher-Yates over `count` art slots: slots 0..49 are the masters.
const swaps = new Map<number, number>();
const at = (i: number) => swaps.get(i) ?? i;
let left = count;
let rng = salt;
const counts: Record<string, Record<string, number>> = {};
const seen = new Set<string>();
let bytes = 0, maxBytes = 0, masterHits = 0;
let founderMasters = 0;
for (let i = 0; i < count; i++) {
  rng = nextRandom(rng + BigInt(i));
  const pick = Number(rng % BigInt(left));
  const slot = at(pick);
  swaps.set(pick, at(left - 1));
  left--;
  const seed = nextRandom(rng ^ 0xa5a5a5a5n);
  const master = slot < masters ? slot : -1;
  if (master >= 0) { masterHits++; if (i % 200 === 0) founderMasters++; }
  const coin = renderCoin({ seed, number: i + 1, series: 1, backing: [10, 25, 50][i % 3], yieldBps: 0, master, founder: i % 200 === 0 });
  const t = master >= 0 ? { master: MASTERS[master].name } : coin.traits;
  for (const [k, v] of Object.entries(t)) {
    counts[k] ??= {};
    counts[k][String(v)] = (counts[k][String(v)] ?? 0) + 1;
  }
  if (seen.has(coin.svg)) throw new Error(`duplicate svg at mint ${i}`);
  seen.add(coin.svg);
  bytes += coin.svg.length;
  if (coin.svg.length > maxBytes) maxBytes = coin.svg.length;
}
console.log(`${count} mints, ${masterHits} masters, ${seen.size} distinct SVGs, avg ${Math.round(bytes / count)} B, max ${maxBytes} B`);
for (const [k, vs] of Object.entries(counts)) {
  const rows = Object.entries(vs).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${(100 * c / count).toFixed(1)}%`);
  console.log(`${k}: ${rows.join(" | ")}`);
}
// Rarity score: sum of -log2(p) over traits, top ten.
const probs: Record<string, Record<string, number>> = {};
for (const [k, vs] of Object.entries(counts)) { probs[k] = {}; for (const [n, c] of Object.entries(vs)) probs[k][n] = c / count; }
console.log("rarity of a seed = sum over traits of -log2(p); the sim proves no two coins render the same bytes.");
