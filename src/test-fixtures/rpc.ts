import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, encodeErrorResult, multicall3Abi, parseAbi, type Hex } from "viem";
import { base } from "viem/chains";
import { ABI, type Info } from "../contract.ts";

export const TOKEN = "0x3333333333333333333333333333333333333333";
export const OWNER = "0x2222222222222222222222222222222222222222";
export const OTHER = "0x4444444444444444444444444444444444444444";

/** Real viem multicall encoding over an in-memory RPC. No keys or network. */
export function rpcFixture() {
  const state = { last: 121, head: 10000n, now: 1_000_000, failId: 0, failOwners: false, burned: new Set<number>(), owners: new Map<number, string>(), tags: [] as string[], calls: 0, ids: [] as number[] };
  const values: Record<string, unknown> = { author: OWNER, renderer: TOKEN, rendererLocked: false, USDC: TOKEN, VAULT: TOKEN, treasuryAssets: 0n, foundersFunded: true, MAX_BATCH: 40, SERIES_SIZE: 25000n, MASTERS: 50n, FOUNDERS_PER_SERIES: 100n, REDEEM_LOCK: 2592000n, vrfFeeWei: 1n, FOUNDER_WINDOW: 1000n, FEE_BPS: 1000n, SEALED_ESCAPE: 15552000n, urnLeft: 24000n, mastersLeft: 50n, founderMinted: 0, founderWindow: [0n, 100n, 1000n, true] };
  const client = createPublicClient({ chain: base, transport: custom({ request: async ({ method, params }) => {
    if (method === "eth_blockNumber") return `0x${state.head.toString(16)}`;
    if (method !== "eth_call") throw new Error(`unexpected RPC ${method}`);
    state.calls++;
    const [tx, tag] = params as [{ data: Hex }, string];
    state.tags.push(tag);
    const { args } = decodeFunctionData({ abi: multicall3Abi, data: tx.data });
    const results = (args![0] as readonly { callData: Hex }[]).map(({ callData }) => {
      const { functionName: name, args: input } = decodeFunctionData({ abi: ABI, data: callData });
      const id = Number(input?.[0] ?? 0);
      let result: unknown = values[name];
      if (name === "minted") result = BigInt(state.last);
      if (name === "nextId") result = BigInt(state.last + 1);
      if (name === "backingOf") result = [5n, 10n, 25n, 50n][id] * 1000000n;
      if (name === "coinOf" || name === "ownerOf") {
        if (name === "coinOf") state.ids.push(id);
        if (state.burned.has(id)) return { success: false, returnData: encodeErrorResult({ abi: ABI, errorName: "ERC721NonexistentToken", args: [BigInt(id)] }) };
        if (id === state.failId || (state.failOwners && name === "ownerOf")) return { success: false, returnData: encodeErrorResult({ abi: parseAbi(["error VaultUnavailable()"]), errorName: "VaultUnavailable" }) };
        if (name === "ownerOf") result = state.owners.get(id) ?? OWNER;
        else result = { seed: BigInt(id), slot: 100, backingClass: 0, founder: false, sealed_: false, renderer: TOKEN, series: 1n, number: BigInt(id), shares: 5000000n, principal: 5000000n, claimed: 0n, requestId: 0n, mintedAt: 1n, redeemableAt: 2592001n, nav: 5000000n, profit: 0n, lifetime: 0n, yieldBps: 0 } satisfies Info;
      }
      return { success: true, returnData: encodeFunctionResult({ abi: ABI, functionName: name, result: result as never }) };
    });
    return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: results });
  } }) });
  return { state, client };
}
