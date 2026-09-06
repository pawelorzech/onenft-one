/**
 * One coin of the chain, drawn and described. The renderer takes the same
 * numbers the contract hands its own renderer, so the image this site serves
 * is the image in `tokenURI`, and the metadata is `src/metadata.ts` with the
 * contract's funded and lifetime amounts.
 */
import { renderCoin, type Coin } from "./coin.ts";
import { metadataOf, attributes, type MetaInput } from "./metadata.ts";
import type { CoinRecord } from "./contract.ts";

/** The `CoinView` the contract passes its renderer, as the TypeScript renderer wants it. */
export function inputOf(c: CoinRecord): MetaInput {
  return {
    seed: c.seed,
    number: c.number,
    series: c.series,
    backing: c.backing,
    yieldBps: c.yieldBps,
    master: c.master,
    founder: c.founder,
    sealed: c.sealed,
    fundedUnits: c.principal,
    lifetimeUnits: c.lifetime,
  };
}

const cache = new Map<string, Coin>();
const keyOf = (c: CoinRecord) => `${c.id}:${c.seed}:${c.yieldBps}:${c.sealed ? 1 : 0}:${c.series}:${c.number}:${c.backing}:${c.master}:${c.founder}`;

/** The coin's image and traits. Cached: a revealed coin only redraws when its yield level moves. */
export function coinOf(c: CoinRecord): Coin {
  const key = keyOf(c);
  const hit = cache.get(key);
  if (hit) return hit;
  const coin = renderCoin(inputOf(c));
  if (cache.size > 3000) cache.clear();
  cache.set(key, coin);
  return coin;
}

/** The token's traits, exactly as the contract's renderer lists them. */
export function attrsOf(c: CoinRecord) {
  return attributes(coinOf(c), inputOf(c));
}

/** The token metadata, the same JSON the contract's renderer builds. */
const metadata = new Map<string, { json: string; coin: Coin }>();
export function metaOf(c: CoinRecord): { json: string; coin: Coin } {
  const key = `${keyOf(c)}:${c.principal}:${c.lifetime}`;
  const hit = metadata.get(key);
  if (hit) { metadata.delete(key); metadata.set(key, hit); return hit; }
  const result = metadataOf(inputOf(c), coinOf(c));
  if (metadata.size >= 512) metadata.delete(metadata.keys().next().value!);
  metadata.set(key, result);
  return result;
}
