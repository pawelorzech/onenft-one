/**
 * Coins that do not come from the chain: the sealed stand-in the site wears
 * before the first mint, and a coin drawn from any seed for the Master Coin
 * gallery, the yield ring page and the /preview endpoint. Nothing here is a
 * token; no page presents it as one.
 */
import { renderCoin, type Coin } from "./coin.ts";
import { BACKINGS } from "./contract.ts";

/** A sealed coin, the image the site shows while nothing is minted. */
export function placeholderCoin(): Coin {
  return renderCoin({ seed: 0n, number: 1, series: 1, backing: BACKINGS[1], yieldBps: 0, master: -1, founder: false, sealed: true });
}

/** A coin from an arbitrary seed, for the Master Coin samples and the yield levels. */
export function coinOfSeed(seed: bigint, yieldBps = 0, master = -1): Coin {
  return renderCoin({ seed, number: 0, series: 1, backing: BACKINGS[1], yieldBps, master, founder: false });
}
