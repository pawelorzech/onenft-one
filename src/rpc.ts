import { fallback, http, type Transport } from "viem";

/** Public Base endpoints. Each limits requests per address and answers 429 when a burst runs over, so none of them is relied on alone. */
const PUBLIC_RPC: Record<number, string[]> = {
  8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  84532: ["https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org"],
};

/** BASE_RPC_URL first, then the fallbacks: BASE_RPC_FALLBACK_URLS (comma separated; empty turns them off) or the public endpoints of the chain. */
export function rpcUrls(chainId: number, env: Record<string, string | undefined> = process.env): string[] {
  const extra = env.BASE_RPC_FALLBACK_URLS === undefined ? PUBLIC_RPC[chainId] ?? [] : env.BASE_RPC_FALLBACK_URLS.split(",").map((v) => v.trim());
  return [...new Set([env.BASE_RPC_URL, ...extra].filter((v): v is string => !!v))];
}

/** Chain reads move to the next endpoint when one fails or is rate limited. No retry on the same endpoint: a retry into a rate limit only extends it. */
export function readTransport(chainId: number, timeout: number, urls = rpcUrls(chainId)): Transport {
  if (urls.length < 2) return http(urls[0], { timeout, retryCount: 1 });
  return fallback(urls.map((url) => http(url, { timeout, retryCount: 0 })), { retryCount: 0 });
}
