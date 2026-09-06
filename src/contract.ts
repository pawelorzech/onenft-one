/**
 * Reads state from the OneCoin contract. Without CONTRACT_ADDRESS the site
 * runs as a plain renderer with no chain: every page shows the empty state.
 *
 * The cache rule is the one every collection follows (see swr.ts): a page
 * never waits on the RPC when a last good state exists; a refresh runs behind
 * it, shared by every request; failures back off; the age of the last good
 * read is public. A read is one snapshot: when any part of it fails the whole
 * read fails and the last good state stays, so a half-read never shows as a
 * complete collection.
 *
 * What a refresh reads: the contract's own counters every time, the coins of
 * the newest window and every sealed coin every time (a sealed coin changes
 * the moment Chainlink VRF answers), and every coin ever minted once every ten
 * minutes. A revealed coin keeps its seed and its slot for good; its money and
 * its owner move, so a coin outside the window carries the numbers of its last
 * read until the next full pass.
 */
import { createPublicClient, http, parseAbi, toFunctionSelector, toEventSelector, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import { Swr } from "./swr.ts";

export const CONTRACT = (process.env.CONTRACT_ADDRESS ?? "") as Address | "";
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? (CONTRACT ? 84532 : 0));
export const chain = CHAIN_ID === 8453 ? base : baseSepolia;

/**
 * The shape of a series. Every one of these is a constant in the contract, and every one of
 * them appears in the site's copy, so the page reads them off the chain and these values are
 * only the fallback for a server with no contract configured. Nothing here is a source of
 * truth; `factsOf` is what the pages call.
 */
export const DEFAULT_SERIES_SIZE = 25000;
export const DEFAULT_MASTERS = 50;
export const DEFAULT_FOUNDERS = 100;
export const DEFAULT_BACKINGS = [5, 10, 25, 50];
/** Coins into a series after which no founder coin can be minted. */
export const DEFAULT_FOUNDER_WINDOW = 1000;
/** The author's cut of the yield, per cent. Read from `FEE_BPS` at boot; this is the fallback. */
export const DEFAULT_FEE_PCT = 10;
/** Coins one mint transaction may buy before the chain state says otherwise. */
export const DEFAULT_MAX_BATCH = 10;
/** How long a coin must wait after its mint before it can be burned, in seconds. Read from the contract; this is the fallback for a page with no chain. */
export const DEFAULT_REDEEM_LOCK = 30 * 86400;
/** How long a coin the VRF never answered for waits before its backing comes free. */
export const DEFAULT_SEALED_ESCAPE = 180 * 86400;
/** USDC has six decimals. */
export const USDC_DECIMALS = 6;

export const ABI = parseAbi([
  "function author() view returns (address)",
  "function renderer() view returns (address)",
  "function rendererLocked() view returns (bool)",
  "function minted() view returns (uint256)",
  "function nextId() view returns (uint256)",
  "function USDC() view returns (address)",
  "function VAULT() view returns (address)",
  "function treasuryShares() view returns (uint256)",
  "function treasuryAssets() view returns (uint256)",
  "function foundersFunded() view returns (bool)",
  "function founderMinted(uint256 series) view returns (uint16)",
  "function urnLeft(uint256 series) view returns (uint256)",
  "function mastersLeft(uint256 series) view returns (uint256)",
  "function backingOf(uint8 backingClass) view returns (uint256)",
  "function MAX_BATCH() view returns (uint8)",
  "function SERIES_SIZE() view returns (uint256)",
  "function MASTERS() view returns (uint256)",
  "function FOUNDERS_PER_SERIES() view returns (uint256)",
  "function vrfFeeWei() view returns (uint256)",
  "function REDEEM_LOCK() view returns (uint256)",
  "function FOUNDER_WINDOW() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function SEALED_ESCAPE() view returns (uint256)",
  "function founderWindow(uint256 series) view returns (uint256 minted, uint256 left, uint256 closesAt, bool open)",
  "function sealedEscapeAt(uint256 id) view returns (uint256)",
  "function RETRY_BLOCKS() view returns (uint256)",
  "function ownerOf(uint256 id) view returns (address)",
  "function yieldBps(uint256 id) view returns (uint32)",
  "function requests(uint256 requestId) view returns (uint64 firstId, uint16 count, uint64 blockNumber, bool replaced)",
  "function coinOf(uint256 id) view returns ((uint64 seed, uint16 slot, uint8 backingClass, bool founder, bool sealed_, address renderer, uint256 series, uint256 number, uint256 shares, uint256 principal, uint256 claimed, uint256 requestId, uint256 mintedAt, uint256 redeemableAt, uint256 nav, uint256 profit, uint256 lifetime, uint32 yieldBps) info)",
  "function mint(uint8 backingClass, uint8 count, address to) payable returns (uint256)",
  "function mintFounder(uint8 count, address to) payable returns (uint256)",
  "function claim(uint256 id) returns (uint256)",
  "function redeem(uint256 id) returns (uint256)",
  "function retry(uint256 requestId) payable returns (uint256)",
  "function fundFounders(uint8 max)",
  "event Minted(uint256 indexed id, address indexed to, uint8 backingClass, uint256 requestId)",
  "event Revealed(uint256 indexed id, uint64 seed, uint16 slot)",
  "event Claimed(uint256 indexed id, address indexed to, uint256 assets, uint256 fee)",
  "event Redeemed(uint256 indexed id, address indexed to, uint256 assets, uint256 fee)",
  // The reverts a minter or a holder can meet. The browser matches them by selector and says
  // what happened in words; without them a wallet shows four bytes of hex.
  "error FounderWindowClosed(uint256 series, uint256 closedAt)",
  "error FounderReserveFull(uint256 series, uint16 minted_, uint8 count)",
  "error VaultFull(uint256 assets, uint256 maxDeposit)",
  "error VaultIlliquid(uint256 needed, uint256 available)",
  "error TooSoon(uint256 id, uint256 redeemableAt)",
  "error SealedCoin(uint256 id)",
  "error FeeTooLow(uint256 needed, uint256 sent)",
  "error NothingToClaim(uint256 id)",
]);

/** The ERC-20 calls the browser makes against USDC before a mint. */
export const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

/** Selectors the browser builds calldata from; it carries no ABI encoder of its own. */
export const SELECTORS = {
  mint: toFunctionSelector("function mint(uint8,uint8,address)"),
  mintFounder: toFunctionSelector("function mintFounder(uint8,address)"),
  claim: toFunctionSelector("function claim(uint256)"),
  redeem: toFunctionSelector("function redeem(uint256)"),
  approve: toFunctionSelector("function approve(address,uint256)"),
  allowance: toFunctionSelector("function allowance(address,address)"),
  balanceOf: toFunctionSelector("function balanceOf(address)"),
} as const;

/**
 * What ONE can cost the reader, in the author's own words. One string: the page, the mint box
 * and the JSON all quote this, so the warning cannot say one thing here and another there.
 */
export const RISK = "ONE can lose you money. The backing sits in a third-party lending vault on Base; if that vault is hacked, drained or frozen, the coins hold nothing and nobody makes it up. Yield can be zero. The coins may never trade; there may be no buyers at any price. Nobody promises a return, and the odds that this earns you nothing are large. Put in only what you can lose.";
/** The same warning in one line, for a button or a footer. */
export const RISK_SHORT = "This can lose you money. Read what can go wrong before you mint.";

/**
 * What each revert means, by selector. The wallet hands the page four bytes and nothing else,
 * so the page carries the sentence. Order does not matter; the selector is the key.
 */
export const REVERTS: [string, string][] = [
  ["FounderWindowClosed(uint256,uint256)", "The founder window of this series has closed. Founder coins are minted at its start or not at all."],
  ["FounderReserveFull(uint256,uint16,uint8)", "This series has no founder coin left to mint."],
  ["VaultFull(uint256,uint256)", "The vault is not taking deposits right now. Nothing was spent beyond gas. Try again later."],
  ["VaultIlliquid(uint256,uint256)", "The vault cannot release that much right now. Your coin is untouched. Try again later."],
  ["TooSoon(uint256,uint256)", "This coin cannot be burned yet. Its lock has not run out."],
  ["SealedCoin(uint256)", "A sealed coin cannot be burned yet. Wait for its seed, or for the escape date if the seed never comes."],
  ["FeeTooLow(uint256,uint256)", "The Chainlink fee changed while this page was open. Reload it and mint again."],
  ["NothingToClaim(uint256)", "There is nothing to claim on this coin yet."],
].map(([sig, said]) => [toFunctionSelector(sig), said]);

/** The first topic of `Minted`. The browser reads the new coins' ids from it; a mint receipt also carries ERC-721 `Transfer` logs, and those must not be mistaken for it. */
export const MINTED_TOPIC = toEventSelector("Minted(uint256,address,uint8,uint256)");

const ZERO = "0x0000000000000000000000000000000000000000";

/** One coin as the chain holds it: the art, the money and the holder. */
export type CoinRecord = {
  id: number;
  /** Zero while sealed. */
  seed: bigint;
  /** The art slot, 0 to 9999; below 50 it is a Master Coin. Null while sealed. */
  slot: number | null;
  backingClass: number;
  /** The class in whole USDC, one of `backings`. */
  backing: number;
  founder: boolean;
  sealed: boolean;
  renderer: Address;
  series: number;
  /** The coin's number inside its series, 1 to 10000. */
  number: number;
  shares: bigint;
  /** Backing paid or funded so far, in USDC units. */
  principal: bigint;
  /** Gross yield already paid out, in USDC units. */
  claimed: bigint;
  /** The VRF request that owes this coin its seed. Zero once revealed. */
  requestId: bigint;
  /** Unix seconds of the mint. */
  mintedAt: number;
  /** Unix seconds from which the coin can be burned. */
  redeemableAt: number;
  /** Unix seconds from which a coin the VRF never answered for can be burned anyway. */
  sealedEscapeAt: number;
  /** What the coin's shares are worth now, in USDC units. */
  nav: bigint;
  /** Yield not yet claimed, in USDC units. */
  profit: bigint;
  /** Everything the coin ever earned, claimed and unclaimed. */
  lifetime: bigint;
  yieldBps: number;
  /** The Master Coin index, or -1. */
  master: number;
  owner: Address | null;
};

/**
 * The author's founder coins for a series: how many are out, how many are left, the last coin
 * of the series at which any can still be minted, and whether the window is open right now.
 * `open` is the contract's own answer, not ours.
 */
export type FounderWindow = { minted: number; left: number; closesAt: number; open: boolean };

export type ChainState = {
  address: Address;
  chainId: number;
  author: Address;
  renderer: Address;
  rendererLocked: boolean;
  usdc: Address;
  vault: Address;
  /** Coins ever minted, every series, burns included. */
  minted: number;
  /** The id the next coin will take. */
  nextId: number;
  /** The series being minted now. */
  series: number;
  /** Coins minted in that series so far. */
  seriesMinted: number;
  /** Coins of the current series still sealed, waiting for their seed. */
  pending: number;
  /** Art slots left in the current series' urn. */
  urnLeft: number;
  /** Master Coin slots nobody has drawn in the current series. */
  mastersLeft: number;
  /** Founder coins the author has minted in the current series. */
  founderMinted: number;
  foundersFunded: boolean;
  /** The author's unwithdrawn fee, in USDC units. */
  treasuryAssets: bigint;
  /** Coins in one series, from the contract. */
  seriesSize: number;
  /** Master Coin slots in a series' urn, from the contract. */
  masters: number;
  /** Founder coins the author may mint per series, from the contract. */
  foundersPerSeries: number;
  /** Coins one transaction may mint. */
  maxBatch: number;
  /** Seconds a coin must wait after its mint before it can be burned. */
  redeemLock: number;
  /** The ETH a mint must send on to the Chainlink subscription, in wei. One fee per transaction, whatever the count. */
  vrfFeeWei: bigint;
  /** Coins into a series after which the founder window shuts for good. */
  founderWindow: number;
  /** The author's cut of the yield, per cent, from `FEE_BPS`. */
  feePct: number;
  /** `FEE_BPS` itself: basis points, so the fee is exact in integers. */
  feeBps: number;
  /** Seconds a coin stays sealed before it can be burned without ever having had a seed. */
  sealedEscape: number;
  /** The position the next coin of the series will take, 1-based. */
  position: number;
  /** Where the next founder coin can be minted, straight from the contract. */
  founder: FounderWindow;
  /** The three backing classes in whole USDC, read from the contract. */
  backings: number[];
  /** Every coin that exists, by id. A redeemed coin leaves the map. */
  coins: Map<number, CoinRecord>;
  /** Unix milliseconds of the read this state came from. */
  readAt: number;
};

export type ChainStatus = {
  configured: boolean;
  known: boolean;
  stale: boolean;
  readAt: number | null;
  ageSeconds: number | null;
  error: string | null;
  errorAt: number | null;
};

const TTL_MS = Number(process.env.CHAIN_TTL_MS ?? 12_000);
export const STALE_AFTER_MS = Number(process.env.STALE_AFTER_MS ?? 90_000);
const DEADLINE_MS = Number(process.env.CHAIN_DEADLINE_MS ?? 2_500);
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS ?? 8_000);
/** Coins at the head of the collection that are re-read on every refresh. */
const RECENT = 120;
/** How often every coin is re-read, so money and owners outside the window catch up. */
const ALL_TTL_MS = Number(process.env.COINS_TTL_MS ?? 10 * 60_000);
const CHUNK = 400;

const client = CONTRACT ? createPublicClient({ chain, transport: http(process.env.BASE_RPC_URL, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }) }) : null;

export function contractEnabled(): boolean {
  return Boolean(client && CONTRACT);
}
export function publicClient() {
  return client;
}

/** Errors from the RPC can quote the URL it was sent to, which may carry a key. Keep the first line, without URLs. */
export function scrubError(e: unknown): string {
  const m = ((e as any)?.shortMessage ?? (e as Error)?.message ?? String(e)).split("\n")[0];
  return m.replace(/https?:\/\/\S+/g, "[rpc]").slice(0, 200);
}

/**
 * The numbers a page needs about a series, from the chain when there is one. A page never
 * reaches for a constant of its own: a contract deployed with a different series size or a
 * fourth backing class must change the copy, not silently disagree with it.
 */
export type Facts = {
  seriesSize: number;
  masters: number;
  founders: number;
  backings: number[];
  maxBatch: number;
  /** The author's cut of the yield, per cent, for copy. */
  feePct: number;
  /** The same cut in basis points, the integer the arithmetic uses. */
  feeBps: number;
  /** Coins into a series after which no founder coin can be minted. */
  founderWindow: number;
  /** Days a coin waits after its mint before it can be burned. */
  lockDays: number;
  /** Days a coin the VRF never answered for waits before its backing comes free. */
  escapeDays: number;
};
export function factsOf(chain: ChainState | null): Facts {
  const d = (seconds: number) => Math.round(seconds / 86400);
  return chain
    ? { seriesSize: chain.seriesSize, masters: chain.masters, founders: chain.foundersPerSeries, backings: chain.backings, maxBatch: chain.maxBatch, feePct: chain.feePct, feeBps: chain.feeBps, founderWindow: chain.founderWindow, lockDays: d(chain.redeemLock), escapeDays: d(chain.sealedEscape) }
    : { seriesSize: DEFAULT_SERIES_SIZE, masters: DEFAULT_MASTERS, founders: DEFAULT_FOUNDERS, backings: DEFAULT_BACKINGS, maxBatch: DEFAULT_MAX_BATCH, feePct: DEFAULT_FEE_PCT, feeBps: DEFAULT_FEE_PCT * 100, founderWindow: DEFAULT_FOUNDER_WINDOW, lockDays: d(DEFAULT_REDEEM_LOCK), escapeDays: d(DEFAULT_SEALED_ESCAPE) };
}
/** The classes as one phrase: "5, 10, 25 or 50". */
export function backingList(backings: number[]): string {
  return backings.length < 2 ? String(backings[0] ?? "") : `${backings.slice(0, -1).join(", ")} or ${backings[backings.length - 1]}`;
}

/** Ids are global; a series is a window of `seriesSize` of them. */
export const seriesOfIn = (id: number, seriesSize: number) => Math.floor((id - 1) / seriesSize) + 1;
export const numberOfIn = (id: number, seriesSize: number) => ((id - 1) % seriesSize) + 1;

const coins = new Map<number, CoinRecord>();
let allReadAt = 0;

type Info = {
  seed: bigint; slot: number; backingClass: number; founder: boolean; sealed_: boolean; renderer: Address;
  series: bigint; number: bigint; shares: bigint; principal: bigint; claimed: bigint; requestId: bigint;
  mintedAt: bigint; redeemableAt: bigint; nav: bigint; profit: bigint; lifetime: bigint; yieldBps: number;
};

/** One multicall in chunks. A reverted call is a null (the coin was redeemed, or never existed); any other failure throws, so a read is all or nothing. */
async function multicallBatch<T>(ids: number[], fn: "coinOf" | "ownerOf"): Promise<(T | null)[]> {
  if (!client || !ids.length) return [];
  const c = { address: CONTRACT as Address, abi: ABI } as const;
  const out: (T | null)[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const res = await client.multicall({ contracts: part.map((id) => ({ ...c, functionName: fn, args: [BigInt(id)] as const })), allowFailure: true });
    res.forEach((r, j) => {
      if (r.status === "success") out.push(r.result as T);
      else if (/revert/i.test(r.error?.message ?? "")) out.push(null);
      else throw new Error(`${fn}(${part[j]}) failed: ${scrubError(r.error)}`);
    });
  }
  return out;
}

function recordOf(id: number, info: Info, owner: Address | null, backings: number[], sealedEscape: number, masters: number): CoinRecord {
  const slot = info.sealed_ ? null : info.slot;
  return {
    id,
    seed: info.sealed_ ? 0n : info.seed,
    slot,
    backingClass: info.backingClass,
    backing: backings[info.backingClass] ?? DEFAULT_BACKINGS[info.backingClass] ?? 0,
    founder: info.founder,
    sealed: info.sealed_,
    renderer: info.renderer,
    series: Number(info.series),
    number: Number(info.number),
    shares: info.shares,
    principal: info.principal,
    claimed: info.claimed,
    requestId: info.requestId,
    mintedAt: Number(info.mintedAt),
    redeemableAt: Number(info.redeemableAt),
    sealedEscapeAt: Number(info.mintedAt) + sealedEscape,
    nav: info.nav,
    profit: info.profit,
    lifetime: info.lifetime,
    yieldBps: Number(info.yieldBps),
    master: slot !== null && slot < masters ? slot : -1,
    owner,
  };
}

/** Which coins this refresh reads: everything once every ten minutes, otherwise the newest window and every coin still sealed. */
function idsToRead(last: number, all: boolean): number[] {
  if (last < 1) return [];
  if (all) return Array.from({ length: last }, (_, i) => i + 1);
  const want = new Set<number>();
  for (let id = Math.max(1, last - RECENT + 1); id <= last; id++) want.add(id);
  for (const c of coins.values()) if (c.sealed) want.add(c.id);
  return [...want].sort((a, b) => a - b);
}

async function readChainState(): Promise<ChainState> {
  if (!client || !CONTRACT) throw new Error("no contract configured");
  const c = { address: CONTRACT, abi: ABI } as const;
  const [author, renderer, rendererLocked, mintedRaw, nextIdRaw, usdc, vault, treasury, foundersFunded, maxBatch, seriesSize, masters, foundersPerSeries, redeemLock, vrfFeeWei, founderWindowSize, feeBps, sealedEscape, b0, b1, b2, b3] = await client.multicall({
    contracts: [
      { ...c, functionName: "author" }, { ...c, functionName: "renderer" }, { ...c, functionName: "rendererLocked" },
      { ...c, functionName: "minted" }, { ...c, functionName: "nextId" }, { ...c, functionName: "USDC" }, { ...c, functionName: "VAULT" },
      { ...c, functionName: "treasuryAssets" }, { ...c, functionName: "foundersFunded" }, { ...c, functionName: "MAX_BATCH" }, { ...c, functionName: "SERIES_SIZE" }, { ...c, functionName: "MASTERS" }, { ...c, functionName: "FOUNDERS_PER_SERIES" }, { ...c, functionName: "REDEEM_LOCK" }, { ...c, functionName: "vrfFeeWei" }, { ...c, functionName: "FOUNDER_WINDOW" }, { ...c, functionName: "FEE_BPS" }, { ...c, functionName: "SEALED_ESCAPE" },
      { ...c, functionName: "backingOf", args: [0] }, { ...c, functionName: "backingOf", args: [1] }, { ...c, functionName: "backingOf", args: [2] }, { ...c, functionName: "backingOf", args: [3] },
    ],
    allowFailure: false,
  });
  const size = Number(seriesSize);
  const last = Number(nextIdRaw) - 1;
  const series = last >= 1 ? seriesOfIn(last, size) : 1;
  const [urnLeft, mastersLeft, founderMinted, window] = await client.multicall({
    contracts: [
      { ...c, functionName: "urnLeft", args: [BigInt(series)] },
      { ...c, functionName: "mastersLeft", args: [BigInt(series)] },
      { ...c, functionName: "founderMinted", args: [BigInt(series)] },
      { ...c, functionName: "founderWindow", args: [BigInt(series)] },
    ],
    allowFailure: false,
  });
  const backings = [b0, b1, b2, b3].map((u) => Number(u / 10n ** BigInt(USDC_DECIMALS)));

  const all = Date.now() - allReadAt > ALL_TTL_MS;
  const ids = idsToRead(last, all);
  const infos = await multicallBatch<Info>(ids, "coinOf");
  const owners = await multicallBatch<Address>(ids, "ownerOf");

  // Every chunk answered, so the read may be written.
  ids.forEach((id, i) => {
    const info = infos[i];
    if (!info) { coins.delete(id); return; }
    coins.set(id, recordOf(id, info, owners[i] ?? null, backings, Number(sealedEscape), Number(masters)));
  });
  if (all) allReadAt = Date.now();

  let pending = 0;
  for (const coin of coins.values()) if (coin.sealed && coin.series === series) pending++;

  return {
    address: CONTRACT,
    chainId: CHAIN_ID,
    author,
    renderer,
    rendererLocked,
    usdc,
    vault,
    minted: Number(mintedRaw),
    nextId: Number(nextIdRaw),
    series,
    seriesMinted: Math.max(0, last - (series - 1) * size),
    pending,
    urnLeft: Number(urnLeft),
    mastersLeft: Number(mastersLeft),
    founderMinted: Number(founderMinted),
    foundersFunded,
    treasuryAssets: treasury,
    maxBatch: Number(maxBatch),
    seriesSize: Number(seriesSize),
    masters: Number(masters),
    foundersPerSeries: Number(foundersPerSeries),
    redeemLock: Number(redeemLock),
    vrfFeeWei,
    founderWindow: Number(founderWindowSize),
    feePct: Number(feeBps) / 100,
    feeBps: Number(feeBps),
    sealedEscape: Number(sealedEscape),
    position: numberOfIn(Number(nextIdRaw), size),
    founder: { minted: Number(window[0]), left: Number(window[1]), closesAt: Number(window[2]), open: window[3] },
    backings,
    coins,
    readAt: Date.now(),
  };
}

const store = new Swr<ChainState>({
  load: readChainState,
  ttlMs: TTL_MS,
  staleAfterMs: STALE_AFTER_MS,
  deadlineMs: DEADLINE_MS,
  describe: scrubError,
  onError: (m, n) => console.error(`chain read failed (${n}):`, m),
});

/** The last good state at once, or null before the first read answers (see swr.ts). Never throws. */
export async function chainState(): Promise<ChainState | null> {
  if (!client || !CONTRACT) return null;
  return store.get();
}
export function readNow(): Promise<ChainState> {
  return store.refresh();
}
export function chainStatus(): ChainStatus {
  const s = store.status();
  return { configured: contractEnabled(), known: s.known, stale: s.stale, readAt: s.readAt, ageSeconds: s.ageSeconds, error: s.error, errorAt: s.errorAt };
}

/** The newest coin of the collection, or null when nothing is minted. */
export function newestCoin(chain: ChainState): CoinRecord | null {
  for (let id = chain.nextId - 1; id >= 1; id--) {
    const coin = chain.coins.get(id);
    if (coin) return coin;
  }
  return null;
}
/** Coin ids newest first. */
export function coinIds(chain: ChainState): number[] {
  return [...chain.coins.keys()].sort((a, b) => b - a);
}
/** One wallet's coins, newest first. */
export function coinsOf(chain: ChainState, who: string): CoinRecord[] {
  const me = who.toLowerCase();
  return [...chain.coins.values()].filter((c) => c.owner?.toLowerCase() === me).sort((a, b) => b.id - a.id);
}
/** Master index to the coin that drew it, for the current series. */
export function mastersFound(chain: ChainState): Map<number, CoinRecord> {
  const out = new Map<number, CoinRecord>();
  for (const coin of chain.coins.values()) if (coin.master >= 0 && coin.series === chain.series) out.set(coin.master, coin);
  return out;
}

export function explorer(chainId: number): string {
  return chainId === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
}
export function chainName(chainId: number): string {
  return chainId === 8453 ? "Base" : "Base Sepolia";
}
export function openseaCoin(chainId: number, address: string, id: number): string {
  return chainId === 8453 ? `https://opensea.io/assets/base/${address}/${id}` : `https://testnets.opensea.io/assets/base-sepolia/${address}/${id}`;
}
export function openseaWallet(chainId: number, who: string): string {
  return chainId === 8453 ? `https://opensea.io/${who}` : `https://testnets.opensea.io/${who}`;
}
export const isZero = (a?: string | null) => !a || a.toLowerCase() === ZERO;
