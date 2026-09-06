import { expect, test } from "bun:test";
import { safeName, ensNames, _useReverse } from "./ens.ts";

test("a plain ENS name passes", () => {
  expect(safeName("pawelorzech.eth")).toBe("pawelorzech.eth");
  expect(safeName("sub.name-1.eth")).toBe("sub.name-1.eth");
});

test("a reverse record with markup or odd characters falls back to the address", () => {
  for (const bad of ["<script>alert(1)</script>.eth", 'a"b.eth', "x&y.eth", "a b.eth", "a/b.eth", "</title><script>.eth", "Pawel.eth", "🦄.eth", "under_score.eth", "noeth", "", null, undefined]) {
    expect(safeName(bad)).toBeNull();
  }
});

test("an absurdly long name is dropped", () => {
  expect(safeName("a".repeat(300) + ".eth")).toBeNull();
});

const addr = (i: number) => ("0x" + i.toString(16).padStart(40, "0")) as `0x${string}`;

test("reverse lookups run a few at a time, are capped per call, and a hostile record falls back to the address", async () => {
  let running = 0, peak = 0, calls = 0;
  _useReverse(async (a) => {
    calls++; running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    const i = parseInt(a.slice(-2), 16);
    return i === 1 ? "one.eth" : i === 2 ? "</title><script>x</script>.eth" : null;
  });
  const names = await ensNames(Array.from({ length: 100 }, (_, i) => addr(i + 1)));
  expect(peak).toBeLessThanOrEqual(6);
  expect(calls).toBe(40);
  expect(names.get(addr(1))).toBe("one.eth");
  expect(names.has(addr(2))).toBe(false);
  // A second call finds the first forty in the cache and looks up the next forty.
  await ensNames(Array.from({ length: 100 }, (_, i) => addr(i + 1)));
  expect(calls).toBe(80);
  _useReverse(null);
});

test("a failed lookup is not remembered as 'no name'; it is retried, and it never throws", async () => {
  let calls = 0;
  _useReverse(async () => { calls++; throw new Error("timeout"); });
  expect(await ensNames([addr(7)])).toEqual(new Map());
  expect(await ensNames([addr(7)])).toEqual(new Map());
  // Inside the failure window the address is not asked again (one call per window), and nothing threw.
  expect(calls).toBe(1);
  _useReverse(null);
});

test("two callers asking for the same address share one lookup", async () => {
  let calls = 0;
  _useReverse(async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return "shared.eth"; });
  const [a, b] = await Promise.all([ensNames([addr(9)]), ensNames([addr(9)])]);
  expect(calls).toBe(1);
  expect(a.get(addr(9))).toBe("shared.eth");
  expect(b.get(addr(9))).toBe("shared.eth");
  _useReverse(null);
});
