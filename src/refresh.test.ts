import { expect, test } from "bun:test";
import { createChainReader, createRefreshController } from "./contract.ts";
import { Swr } from "./swr.ts";
import { rpcFixture, TOKEN, OTHER } from "./test-fixtures/rpc.ts";
async function setup() {
  const { state, client } = rpcFixture(); state.last = 281; state.burned.add(1);
  const reader = createChainReader(client, TOKEN, () => state.now);
  let loads = 0;
  const store = new Swr({ load: () => { loads++; return reader.read(); }, ttlMs: 12000, staleAfterMs: 90000, deadlineMs: 2500, now: () => state.now });
  await store.refresh();
  return { state, reader, store, loads: () => loads, refresh: createRefreshController(reader, store, () => state.now) };
}
test("a confirmed absent token is cached without repeated RPC and rechecked after TTL", async () => {
  const f = await setup(), first = f.store.peek()!;
  expect(first.absentCoins!.get(1)!.readBlock).toBe(f.state.head);
  for (let i = 0; i < 30; i++) await f.refresh.coin(1);
  expect(f.loads()).toBe(1);
  f.state.now += 12000;
  await f.refresh.coin(1);
  expect(f.loads()).toBe(2);
  for (let i = 0; i < 30; i++) await f.refresh.coin(1);
  expect(f.loads()).toBe(2);
  expect(first.absentCoins!.get(1)!.readAt).not.toBe(f.state.now);
});
test("different ids and forced blocks cannot bypass a shared request budget", async () => {
  const f = await setup(); f.state.now += 12000;
  await Promise.all(Array.from({length: 100}, (_, i) => f.refresh.coin(i + 1, 999999n)));
  expect(f.loads()).toBe(2);
  for (let id = 1; id <= 100; id++) { await f.refresh.coin(id, 999999n); await f.refresh.holdings(999999n); }
  expect(f.loads()).toBe(2);
  f.state.now += 12000; await f.refresh.holdings(); expect(f.loads()).toBe(3);
});
test("afterBlock discovers a newly minted id despite the fresh old supply snapshot", async () => {
  const f = await setup(); f.state.last = 282; f.state.head++; f.state.now++;
  const next = await f.refresh.coin(282, f.state.head);
  expect(next!.coins.get(282)!.readBlock).toBe(f.state.head); expect(f.loads()).toBe(2);
});
test("a confirmed burn invalidates the coin, and a later branch can invalidate cached absence", async () => {
  const f = await setup(); f.state.burned.add(2); f.state.head++; f.state.now++;
  const burned = await f.refresh.coin(2, f.state.head);
  expect(burned!.coins.has(2)).toBe(false); expect(burned!.absentCoins!.get(2)!.readBlock).toBe(f.state.head);
  f.state.burned.delete(2); f.state.head++; f.state.now += 12000;
  const restored = await f.refresh.coin(2, f.state.head);
  expect(restored!.coins.has(2)).toBe(true); expect(restored!.absentCoins!.has(2)).toBe(false);
});
test("afterBlock refreshes holdings early once and preserves ownership read block", async () => {
  const f = await setup(); f.state.head++; f.state.now++; f.state.owners.set(2, OTHER);
  const next = await f.refresh.holdings(f.state.head);
  expect(next!.coins.get(2)!.owner).toBe(OTHER); expect(next!.ownersReadBlock).toBe(f.state.head);
  await f.refresh.holdings(f.state.head + 1n); expect(f.loads()).toBe(2);
});
test("refresh failure does not write absence or turn every retry into another RPC", async () => {
  const f = await setup(); f.state.now += 12000; f.state.failId = 2;
  const hit = f.store.peek(); await f.refresh.coin(2, f.state.head + 1n);
  expect(f.store.peek()).toBe(hit); expect(hit!.absentCoins!.has(2)).toBe(false);
  for (let i = 0; i < 20; i++) await f.refresh.coin(2, f.state.head + 1n);
  expect(f.loads()).toBe(2);
});
