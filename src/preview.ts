/**
 * The preview series. Until the contract exists the site shows a simulated
 * series: seeds from a salt, art slots from the same lazy Fisher-Yates urn the
 * contract will run, backing classes in turn, and a yield that grows with age
 * so the ring can be seen. Every number here is marked as preview on the page.
 */
import { nextRandom, renderCoin, type CoinInput, type Coin } from "./coin.ts";

export const SERIES_SIZE = 10000;
export const MASTERS_PER_SERIES = 50;
export const FOUNDER_PER_SERIES = 50;
export const BACKINGS = [10, 25, 50] as const;

const SALT = BigInt(process.env.PREVIEW_SALT ?? "2026");
/** How many coins the preview shows as minted. */
export const PREVIEW_SUPPLY = Math.min(SERIES_SIZE, Math.max(0, Number(process.env.PREVIEW_SUPPLY ?? 240)));

/** Lazy Fisher-Yates over the series' slots; slot < 50 is a master. Computed once, in mint order. */
const slots: number[] = [];
const seeds: bigint[] = [];
const swaps = new Map<number, number>();
let rng = SALT;
function drawTo(n: number) {
  while (slots.length < n) {
    const i = slots.length;
    rng = nextRandom(rng + BigInt(i));
    const left = SERIES_SIZE - i;
    const pick = Number(rng % BigInt(left));
    const at = (k: number) => swaps.get(k) ?? k;
    const slot = at(pick);
    swaps.set(pick, at(left - 1));
    slots.push(slot);
    seeds.push(nextRandom(rng ^ 0xa5a5a5a5n));
  }
}

/** The input of preview coin n (1-based) in series 1. */
export function previewInput(n: number, supply = PREVIEW_SUPPLY): CoinInput {
  drawTo(n);
  const slot = slots[n - 1];
  const age = Math.max(0, supply - n);
  return {
    seed: seeds[n - 1],
    number: n,
    series: 1,
    backing: BACKINGS[(n - 1) % 3],
    yieldBps: Math.min(60000, age * 25),
    master: slot < MASTERS_PER_SERIES ? slot : -1,
    founder: (n - 1) % 200 === 0,
  };
}

const cache = new Map<number, Coin>();
export function previewCoin(n: number, supply = PREVIEW_SUPPLY): Coin {
  const key = n * 1000003 + supply;
  const hit = cache.get(key);
  if (hit) return hit;
  const coin = renderCoin(previewInput(n, supply));
  if (cache.size > 2000) cache.clear();
  cache.set(key, coin);
  return coin;
}

/** The masters drawn so far: master index to coin number. */
export function mastersFound(supply = PREVIEW_SUPPLY): Map<number, number> {
  drawTo(supply);
  const m = new Map<number, number>();
  for (let i = 0; i < supply; i++) if (slots[i] < MASTERS_PER_SERIES) m.set(slots[i], i + 1);
  return m;
}

/** A coin from an arbitrary seed, for the preview endpoint. */
export function coinOfSeed(seed: bigint, yieldBps = 0, master = -1): Coin {
  return renderCoin({ seed, number: 0, series: 1, backing: 25, yieldBps, master, founder: false });
}
