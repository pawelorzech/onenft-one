/**
 * The keeper. One job, from the deployer wallet: when Chainlink VRF never
 * answers a mint, ask it again. The contract lets anyone do this once its
 * retry window has passed, and a coin takes whichever answer lands first, so
 * a retry can only add a chance of a seed, never take one away.
 *
 * It reads the sealed coins of the last good chain state, groups them by the
 * request that owes them a seed, and sends `retry` for every request past its
 * window. It sends one transaction at a time, so the shared account's nonces
 * never race, and it never throws out of its loop: a failed round is logged
 * and the next round tries again. Runs only when DEPLOYER_KEY is set.
 */
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ABI, CONTRACT, chain, chainState, publicClient, scrubError } from "./contract.ts";

/** How often the keeper looks. The contract's window is thousands of blocks, so this is often enough. */
export const EVERY_MS = Number(process.env.KEEPER_EVERY_MS ?? 5 * 60_000);
/** Requests one round may retry, so a long outage cannot drain the wallet in one go. */
const MAX_PER_ROUND = Number(process.env.KEEPER_MAX_PER_ROUND ?? 5);

type Info = { armed: boolean; address: Address | null; sent: number; failures: number; lastAt: number | null; lastError: string | null };
const info: Info = { armed: false, address: null, sent: 0, failures: 0, lastAt: null, lastError: null };
export function keeperInfo(): Info {
  return { ...info };
}

let account: ReturnType<typeof privateKeyToAccount> | null = null;
let wallet: ReturnType<typeof createWalletClient> | null = null;
let running = false;

/** The requests that owe a seed to a coin that is still sealed, newest request per coin. */
export async function openRequests(): Promise<bigint[]> {
  const state = await chainState();
  if (!state) return [];
  const ids = new Set<bigint>();
  for (const coin of state.coins.values()) if (coin.sealed && coin.requestId > 0n) ids.add(coin.requestId);
  return [...ids];
}

/** One round. Never throws. */
export async function round(): Promise<void> {
  const client = publicClient();
  if (!client || !wallet || !account || running) return;
  running = true;
  try {
    const requests = await openRequests();
    if (!requests.length) return;
    const [head, retryBlocks] = await Promise.all([
      client.getBlockNumber(),
      client.readContract({ address: CONTRACT as Address, abi: ABI, functionName: "RETRY_BLOCKS" }),
    ]);
    const rows = await client.multicall({
      contracts: requests.map((id) => ({ address: CONTRACT as Address, abi: ABI, functionName: "requests" as const, args: [id] as const })),
      allowFailure: false,
    });
    let sent = 0;
    for (let i = 0; i < requests.length && sent < MAX_PER_ROUND; i++) {
      const [, count, blockNumber, replaced] = rows[i];
      if (count === 0 || replaced) continue;
      const openAt = BigInt(blockNumber) + retryBlocks;
      if (head <= openAt) continue;
      try {
        const hash = await wallet.writeContract({ address: CONTRACT as Address, abi: ABI, functionName: "retry", args: [requests[i]], account, chain });
        sent++;
        info.sent++;
        console.log(`keeper: retried request ${requests[i]} for ${count} sealed ${count === 1 ? "coin" : "coins"}, tx ${hash}`);
        await client.waitForTransactionReceipt({ hash, timeout: 120_000 }).catch((e) => console.error("keeper: receipt:", scrubError(e)));
      } catch (e) {
        info.failures++;
        info.lastError = scrubError(e);
        console.error(`keeper: retry ${requests[i]} failed:`, info.lastError);
      }
    }
    info.lastAt = Date.now();
  } catch (e) {
    info.failures++;
    info.lastError = scrubError(e);
    console.error("keeper round:", info.lastError);
  } finally {
    running = false;
  }
}

export function startKeeper(key: Hex, everyMs = EVERY_MS): void {
  if (!publicClient() || !CONTRACT) return;
  try {
    account = privateKeyToAccount(key);
  } catch (e) {
    console.error("keeper: DEPLOYER_KEY is not a private key, the keeper stays off:", scrubError(e));
    return;
  }
  wallet = createWalletClient({ account, chain, transport: http(process.env.BASE_RPC_URL) });
  info.armed = true;
  info.address = account.address;
  console.log(`keeper armed from ${account.address}, every ${Math.round(everyMs / 1000)} s`);
  setTimeout(() => void round(), 30_000);
  setInterval(() => void round(), everyMs);
}
