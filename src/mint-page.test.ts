import { test, expect } from "bun:test";
import { mintPage } from "./mint-page.ts";
test("cursor pages cover bursts, gaps and bootstrap without duplicates", () => {
  const ids = Array.from({ length: 250 }, (_, i) => i + 1).filter((id) => id !== 12);
  const c = { chainId: 8453, address: "0xABC" };
  let cursor = 0; const seen: number[] = [];
  for (let i = 0; i < 3; i++) {
    const p = mintPage(c, ids, new URLSearchParams(`after=${cursor}&limit=100`), (id) => id);
    if ("error" in p) throw new Error(p.error);
    cursor = p.nextCursor; seen.push(...p.items);
  }
  expect(seen).toEqual(ids);
  expect(mintPage(c, ids, new URLSearchParams("after=latest"), (id) => id)).toMatchObject({ namespace: "8453:0xabc", nextCursor: 250, items: [] });
  expect(mintPage(c, ids, new URLSearchParams("limit=101"), (id) => id)).toHaveProperty("error");
});
