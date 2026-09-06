import { expect, test } from "bun:test";
import { coinOf, metaOf, inputOf } from "./token.ts";
import { metadataOf } from "./metadata.ts";
import type { CoinRecord } from "./contract.ts";
const base: CoinRecord = { id: 918, seed: 123456n, slot: 100, backingClass: 0, backing: 5, founder: false, sealed: false, renderer: "0x3333333333333333333333333333333333333333", series: 1, number: 918, shares: 5000000n, principal: 5000000n, claimed: 0n, requestId: 0n, mintedAt: 1, redeemableAt: 2592001, sealedEscapeAt: 15552001, nav: 5000000n, profit: 0n, lifetime: 0n, yieldBps: 0, master: -1, owner: "0x2222222222222222222222222222222222222222" };
test("cached metadata preserves uncached renderer bytes across every render and capital input", () => {
  const changes: Partial<CoinRecord>[] = [{}, { seed: 98765n }, { series: 2 }, { number: 25000 }, { backing: 50 }, { master: 0 }, { founder: true }, { sealed: true }, { yieldBps: 1000 }, { principal: 9999999n }, { lifetime: 123456n }];
  for (const change of changes) {
    const record = { ...base, ...change }, expected = metadataOf(inputOf(record)), cached = metaOf(record);
    expect(cached.json).toBe(expected.json); expect(cached.coin.svg).toBe(expected.coin.svg); expect(metaOf({ ...record })).toBe(cached);
  }
});
test("capital updates invalidate metadata while retaining the unchanged image; owner updates do not redraw", () => {
  const first = metaOf(base), funded = metaOf({ ...base, principal: 6000000n }), yielded = metaOf({ ...base, lifetime: 200000n });
  expect(funded.json).toContain("funded 6.000000 USDC"); expect(yielded.json).toContain("lifetime yield 0.200000 USDC");
  expect(funded.coin).toBe(first.coin); expect(yielded.coin).toBe(first.coin);
  expect(metaOf({ ...base, owner: "0x4444444444444444444444444444444444444444" })).toBe(first);
  expect(coinOf({ ...base, yieldBps: 1000 })).not.toBe(first.coin);
});
