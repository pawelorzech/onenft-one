/**
 * ENS both ways so owners read as names, not hex, and /name.eth finds a wallet.
 * ENS lives on Ethereum L1, so this is the one place the site talks to a chain
 * other than Base. Failures fall back to the address; nothing depends on this:
 * a lookup that fails never throws, never blocks an image, and is retried soon,
 * while a name that does not exist is remembered for hours.
 */
import { createPublicClient, http, isAddress, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const client = createPublicClient({ chain: mainnet, transport: http(process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com", { timeout: 2500, retryCount: 0 }) });

type Reverse = { at: number; name: string | null; ok: boolean };
type Forward = { at: number; address: Address | null; ok: boolean };
const cache = new Map<string, Reverse>();
const forward = new Map<string, Forward>();
/** A name, or the absence of one, is kept for hours. */
const TTL_MS = 6 * 3600 * 1000;
/** A failed lookup (timeout, RPC down) is retried after a minute, never confused with "no name". */
const FAIL_TTL_MS = 60 * 1000;
/** Both caches are keyed by whatever the network or a visitor hands in, so they are capped. */
const MAX_ENTRIES = 5000;
/** Reverse lookups in flight at once, so one page never opens hundreds of sockets. */
const CONCURRENCY = 6;
/** Reverse lookups one call may start; the rest read as addresses until a later page fills the cache. */
const MAX_PER_CALL = 40;

/**
 * A reverse record is a string the wallet's owner chose, and the universal
 * resolver checks only that it resolves back; it does not check the characters.
 * Names go into HTML and into paths, so only a name that is already in its
 * ENSIP-15 normal form and made of plain label characters gets through.
 * Anything else falls back to the address.
 */
export function safeName(name: string | null | undefined): string | null {
  if (!name || name.length > 255) return null;
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/.test(name)) return null;
  try {
    return normalize(name) === name ? name : null;
  } catch {
    return null;
  }
}

function trim<V>(m: Map<string, V>): void {
  if (m.size > MAX_ENTRIES) m.clear();
}

function live(entry: { at: number; ok: boolean } | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.at < (entry.ok ? TTL_MS : FAIL_TTL_MS);
}

/** Runs `fn` over `items` with at most `limit` in flight. Never rejects; `fn` handles its own errors. */
async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** The lookups in flight right now, so two pages asking for the same address share one call. */
const inflight = new Map<string, Promise<void>>();

/** The reverse lookup itself. Tests swap it for a fake; nothing else does. */
let reverse: (a: Address) => Promise<string | null> = (a) => client.getEnsName({ address: a });
export function _useReverse(fn: typeof reverse | null): void {
  reverse = fn ?? ((a) => client.getEnsName({ address: a }));
  cache.clear();
}

function lookup(a: string, now: number): Promise<void> {
  const running = inflight.get(a);
  if (running) return running;
  const p = (async () => {
    try {
      const name = safeName(await reverse(a as Address));
      trim(cache);
      cache.set(a, { at: now, name, ok: true });
    } catch {
      trim(cache);
      cache.set(a, { at: now, name: null, ok: false });
    } finally {
      inflight.delete(a);
    }
  })();
  inflight.set(a, p);
  return p;
}

/**
 * Names for the addresses given, lowercase address to name, only for those that
 * have one. Cached hits cost nothing; misses are looked up a few at a time and
 * capped per call, so a page with a thousand owners does not wait on a thousand
 * calls. Never throws.
 */
export async function ensNames(addresses: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const todo: string[] = [];
  for (const raw of new Set(addresses.map((a) => a.toLowerCase()))) {
    const c = cache.get(raw);
    if (live(c, now)) {
      if (c!.name) out.set(raw, c!.name);
      continue;
    }
    if (todo.length < MAX_PER_CALL) todo.push(raw);
  }
  await pooled(todo, CONCURRENCY, (a) => lookup(a, now));
  for (const a of todo) {
    const c = cache.get(a);
    if (c?.name) out.set(a, c.name);
  }
  return out;
}

/** An address as typed, or the address behind an ENS name; null if neither. Never throws. */
export async function resolveHolder(input: string): Promise<Address | null> {
  if (isAddress(input)) return input;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(input)) return null;
  const key = input.toLowerCase();
  const hit = forward.get(key);
  if (live(hit, Date.now())) return hit!.address;
  let address: Address | null = null;
  let ok = true;
  try {
    address = await client.getEnsAddress({ name: normalize(key) });
  } catch {
    ok = false;
  }
  trim(forward);
  forward.set(key, { at: Date.now(), address, ok });
  return address;
}

/** Whether a holder lookup failed for lack of an answer, so the page can say "try again" instead of "no such name". */
export function resolveFailed(input: string): boolean {
  const hit = forward.get(input.toLowerCase());
  return Boolean(hit && !hit.ok);
}
