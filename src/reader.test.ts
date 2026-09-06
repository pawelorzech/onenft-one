import { test, expect } from "bun:test";
import { createChainReader } from "./contract.ts";
import { refreshAllowed } from "./contract.ts";
import { rpcFixture, TOKEN, OWNER, OTHER } from "./test-fixtures/rpc.ts";

test("every new id is read after a burst larger than the recent window; every RPC uses the same block", async () => {
  const { state, client } = rpcFixture();
  const reader = createChainReader(client, TOKEN, () => state.now);
  const first = await reader.read();
  state.last = 281; state.head++; state.now += 12000; state.tags = [];
  const next = await reader.read();
  expect(next.coins.size).toBe(281);
  for (let id = 122; id <= 281; id++) expect(next.coins.has(id)).toBe(true);
  expect(first.coins.size).toBe(121);
  expect(new Set(state.tags)).toEqual(new Set(["0x2711"]));
});

test("a vault revert in a later chunk keeps the snapshot and cursor; retry recovers every new coin", async () => {
  const { state, client } = rpcFixture();
  const reader = createChainReader(client, TOKEN, () => state.now);
  const first = await reader.read();
  state.last = 900; state.failId = 700; state.now += 12000;
  await expect(reader.read()).rejects.toThrow("coinOf(700) failed");
  expect(first.coins.size).toBe(121);
  state.failId = 0;
  expect((await reader.read()).coins.size).toBe(900);
});

test("only the typed missing-token revert removes a token; owner failure cannot partially write", async () => {
  const { state, client } = rpcFixture();
  const reader = createChainReader(client, TOKEN, () => state.now);
  const first = await reader.read();
  state.failOwners = true;
  await expect(reader.read()).rejects.toThrow("ownerOf");
  expect(first.coins.size).toBe(121);
  state.failOwners = false; state.burned.add(120);
  const next = await reader.read();
  expect(next.coins.has(120)).toBe(false);
  expect(first.coins.has(120)).toBe(true);
});

test("an old coin can refresh without falsely refreshing the age of other old holdings", async () => {
  const { state, client } = rpcFixture(); state.last = 281;
  const reader = createChainReader(client, TOKEN, () => state.now);
  const first = await reader.read();
  state.now += 12000; state.owners.set(1, OTHER); reader.request(1);
  const next = await reader.read();
  expect(first.coins.get(1)!.owner).toBe(OWNER);
  expect(next.coins.get(1)!.owner).toBe(OTHER);
  expect(next.coins.get(1)!.readAt).toBe(state.now);
  expect(next.coins.get(2)!.readAt).toBe(first.readAt);
  expect(next.ownersReadAt).toBe(first.readAt);
});

test("supply rollback rebuilds the snapshot, dropping tokens from the abandoned branch", async () => {
  const { state, client } = rpcFixture();
  const reader = createChainReader(client, TOKEN, () => state.now);
  await reader.read(); state.last = 100;
  const next = await reader.read();
  expect(next.coins.size).toBe(100);
  expect(next.coins.has(121)).toBe(false);
});

test("explicit refreshes back off after RPC errors and resume at the retry boundary", () => {
  expect(refreshAllowed({ error: "RPC unavailable", errorAt: 1000, failures: 1 }, 3999)).toBe(false);
  expect(refreshAllowed({ error: "RPC unavailable", errorAt: 1000, failures: 1 }, 4000)).toBe(true);
  expect(refreshAllowed({ error: "RPC unavailable", errorAt: 1000, failures: 8 }, 60999)).toBe(false);
  expect(refreshAllowed({ error: "RPC unavailable", errorAt: 1000, failures: 8 }, 61000)).toBe(true);
  expect(refreshAllowed({ error: null, errorAt: 1000, failures: 0 }, 1001)).toBe(true);
});

test('explicit post-transaction refresh rereads all holdings before the normal TTL', async () => {
  const {state,client}=rpcFixture();
  const reader=createChainReader(client,TOKEN,()=>state.now);
  const first=await reader.read();
  state.head++;state.now++;state.owners.set(1,OTHER);
  reader.requestAll();
  const after=await reader.read();
  expect(first.coins.get(1)!.owner).toBe(OWNER);
  expect(after.coins.get(1)!.owner).toBe(OTHER);
  expect(after.ownersReadBlock).toBe(state.head);
  expect(after.coins.get(1)!.readBlock).toBe(state.head);
});
