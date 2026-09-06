/** JSON for other people's code and the hub. Everything here is derived from the chain; nothing is stored. */
import { YIELD_STEPS, MASTERS, fingerprint, roman } from "./coin.ts";
import {
  SERIES_SIZE, MASTERS_PER_SERIES, FOUNDER_PER_SERIES, BACKINGS, FEE_PCT,
  coinIds, coinsOf, explorer, openseaCoin, type ChainState, type ChainStatus, type CoinRecord,
} from "./contract.ts";
import { SITE, TABLES, oneInOf, rarestOf, isAuthor, redeemable, type Names, NO_NAMES } from "./site.ts";
import { coinOf, metaOf, attrsOf } from "./token.ts";
import { holderFacts } from "./facts.ts";

/** How old the data in an answer is. `known` false means no chain read ever succeeded, so counts are null, never zero. */
export function chainBlock(status: ChainStatus | null) {
  if (!status?.configured) return { configured: false, known: false, stale: false, readAt: null, ageSeconds: null, error: null };
  return { configured: true, known: status.known, stale: status.stale, readAt: status.readAt === null ? null : new Date(status.readAt).toISOString(), ageSeconds: status.ageSeconds, error: status.error };
}

const units = (u: bigint) => u.toString();

export function coinJson(c: CoinRecord, chain: ChainState, names: Names = NO_NAMES, status: ChainStatus | null = null) {
  const coin = coinOf(c);
  const { json } = metaOf(c);
  const meta = JSON.parse(json) as { name: string; description: string };
  return {
    id: c.id,
    series: c.series,
    number: c.number,
    name: meta.name,
    description: meta.description,
    sealed: c.sealed,
    seed: c.sealed ? null : c.seed.toString(),
    fingerprint: c.sealed ? null : fingerprint(c.seed),
    slot: c.slot,
    master: coin.masterName || null,
    founder: c.founder,
    backingUsdc: c.backing,
    /** USDC units, six decimals, as strings: JSON numbers cannot hold them safely. */
    fundedUnits: units(c.principal),
    navUnits: units(c.nav),
    profitUnits: units(c.profit),
    claimedUnits: units(c.claimed),
    lifetimeUnits: units(c.lifetime),
    yieldBps: c.yieldBps,
    yieldLevel: coin.yieldLevel,
    /** Unix seconds. A coin can be burned from `redeemableAt`, and never while it is sealed. */
    mintedAt: c.mintedAt,
    redeemableAt: c.redeemableAt,
    redeemable: redeemable(c),
    attributes: attrsOf(c),
    rarity: c.sealed || coin.masterName ? null : { oneIn: oneInOf(coin.traits), rarest: rarestOf(coin.traits) },
    owner: c.owner ?? null,
    ownerName: c.owner ? names.get(c.owner.toLowerCase()) ?? null : null,
    /** The current holder is the author's wallet. */
    treasury: isAuthor(chain, c.owner),
    palette: coin.palette,
    image: `https://${SITE}/coin/${c.id}.svg`,
    png: `https://${SITE}/coin/${c.id}-1024.png`,
    card: `https://${SITE}/coin/${c.id}.png`,
    url: `https://${SITE}/coin/${c.id}`,
    opensea: openseaCoin(chain.chainId, chain.address, c.id),
    explorer: `${explorer(chain.chainId)}/nft/${chain.address}/${c.id}`,
    chain: chainBlock(status),
  };
}

export function stateJson(chain: ChainState | null, names: Names = NO_NAMES, status: ChainStatus | null = null) {
  const recent = chain ? coinIds(chain).slice(0, 40).map((id) => coinJson(chain.coins.get(id)!, chain, names, status)) : [];
  return {
    site: SITE,
    kind: "coins",
    contract: chain ? { address: chain.address, chainId: chain.chainId, renderer: chain.renderer, rendererLocked: chain.rendererLocked, author: chain.author, usdc: chain.usdc, vault: chain.vault } : null,
    series: chain?.series ?? null,
    seriesName: chain ? roman(chain.series) : null,
    seriesSize: SERIES_SIZE,
    /** Coins minted in the current series. Null, not zero, when the chain never answered. */
    totalSupply: chain?.seriesMinted ?? null,
    /** Every coin ever minted, all series, burns included. */
    mintedEver: chain?.minted ?? null,
    /** Coins that still exist: minted minus burned. */
    live: chain?.coins.size ?? null,
    /** Coins minted and still waiting for their seed from Chainlink VRF. */
    pending: chain?.pending ?? null,
    maxSupply: SERIES_SIZE,
    left: chain ? SERIES_SIZE - chain.seriesMinted : null,
    /** Master Coin slots nobody has drawn in this series. The hub reads this as the 1/1 pool. */
    poolLeft: chain?.mastersLeft ?? null,
    urnLeft: chain?.urnLeft ?? null,
    mastersPerSeries: MASTERS_PER_SERIES,
    mastersLeft: chain?.mastersLeft ?? null,
    mastersFound: chain ? MASTERS_PER_SERIES - chain.mastersLeft : null,
    founderPerSeries: FOUNDER_PER_SERIES,
    founderMinted: chain?.founderMinted ?? null,
    foundersFunded: chain?.foundersFunded ?? null,
    treasuryAssetsUnits: chain ? units(chain.treasuryAssets) : null,
    maxBatch: chain?.maxBatch ?? null,
    redeemLockSeconds: chain?.redeemLock ?? null,
    backings: chain?.backings ?? [...BACKINGS],
    feePercentOfYield: FEE_PCT,
    yieldSteps: YIELD_STEPS,
    chain: chainBlock(status),
    recent,
  };
}

export function specJson() {
  return {
    site: SITE,
    seriesSize: SERIES_SIZE,
    mastersPerSeries: MASTERS_PER_SERIES,
    masters: MASTERS.map((m) => ({ name: m.name, mode: m.mode, material: m.material })),
    backings: [...BACKINGS],
    feePercentOfYield: FEE_PCT,
    yieldSteps: YIELD_STEPS,
    traits: TABLES.map((tb) => {
      const total = tb.weights.reduce((a, b) => a + b, 0);
      return { trait: tb.trait, values: tb.names.map((n, i) => ({ value: n, odds: tb.weights[i] / total })) };
    }),
    image: "64 by 64 pixel grid, SVG with one path per colour, drawn on chain",
  };
}

/** One wallet's coins, with the sums the hub shows above them. */
export function holderJson(who: string, chain: ChainState, names: Names = NO_NAMES, status: ChainStatus | null = null) {
  const mine = coinsOf(chain, who);
  return {
    site: SITE,
    address: who,
    name: names.get(who.toLowerCase()) ?? null,
    treasury: isAuthor(chain, who),
    count: mine.length,
    chain: chainBlock(status),
    facts: holderFacts(who, chain),
    coins: mine.map((c) => coinJson(c, chain, names, status)),
  };
}
