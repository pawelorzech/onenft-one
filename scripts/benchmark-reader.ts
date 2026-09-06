/** Local encoding/decoding benchmark; no network or transactions. Not a production RPC SLA. */
import { createChainReader } from "../src/contract.ts";
import { rpcFixture, TOKEN } from "../src/test-fixtures/rpc.ts";
for (const size of [1000, 10000, 25000]) {
  const { state, client } = rpcFixture();
  state.last = size;
  const reader = createChainReader(client, TOKEN, () => state.now);
  const start = performance.now();
  const first = await reader.read();
  const fullMs = performance.now() - start;
  const fullCalls = state.calls;
  state.calls = 0;
  state.ids = [];
  state.now += 12000;
  const nextStart = performance.now();
  const next = await reader.read();
  if (first.coins.size !== size || next.coins.size !== size) throw new Error(`Incomplete snapshot for ${size}`);
  if (state.ids.length !== 120) throw new Error(`Recent read visited ${state.ids.length} ids instead of 120`);
  console.log(JSON.stringify({ size, fullMs: Math.round(fullMs), fullRpcCalls: fullCalls, refreshMs: Math.round(performance.now() - nextStart), refreshRpcCalls: state.calls, refreshedCoins: state.ids.length }));
}
