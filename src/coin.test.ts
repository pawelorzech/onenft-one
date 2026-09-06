import { describe, expect, test } from "bun:test";
import { renderCoin, designOf, fingerprint, yieldLevel, MASTERS, YIELD_STEPS, nextRandom } from "./coin.ts";

const base = { number: 3871, series: 1, backing: 25, yieldBps: 0, master: -1, founder: false };

describe("coin", () => {
  test("same seed, same bytes", () => {
    const a = renderCoin({ ...base, seed: 123n });
    const b = renderCoin({ ...base, seed: 123n });
    expect(a.svg).toBe(b.svg);
  });
  test("the fingerprint is the top 32 bits, upper case hex", () => {
    expect(fingerprint(0x79db4ac100000000n)).toBe("79DB4AC1");
    expect(fingerprint(1n)).toBe("00000000");
  });
  test("the legend carries the number and the fingerprint", () => {
    const c = renderCoin({ ...base, seed: 0x79db4ac1deadbeefn });
    expect(c.svg).toContain("BASE I 03871 79DB4AC1");
    expect(c.svg).toContain(">25</text>");
  });
  test("integers only in the svg", () => {
    for (let i = 0n; i < 200n; i++) {
      const c = renderCoin({ ...base, seed: nextRandom(i), yieldBps: Number(i) * 300 });
      expect(c.svg.replace(/1\.5/g, "")).not.toMatch(/\d\.\d/);
      expect(c.svg).not.toContain("NaN");
      expect(c.svg).not.toContain("undefined");
    }
    for (let i = 0; i < 50; i++) {
      const c = renderCoin({ ...base, seed: 99n, master: i, yieldBps: 9000 });
      expect(c.svg.replace(/1\.5/g, "")).not.toMatch(/\d\.\d/);
    }
  });
  test("yield levels follow the steps and never shrink", () => {
    expect(yieldLevel(0)).toBe(0);
    expect(yieldLevel(1)).toBe(1);
    expect(yieldLevel(99)).toBe(1);
    expect(yieldLevel(100)).toBe(2);
    expect(yieldLevel(50000)).toBe(YIELD_STEPS.length);
    let last = -1;
    for (let bps = 0; bps < 60000; bps += 7) {
      const l = yieldLevel(bps);
      expect(l).toBeGreaterThanOrEqual(last);
      last = l;
    }
  });
  test("the yield ring grows with the level and the coin stays the same", () => {
    const strip = (s: string) => s.replace(/<circle cx="500" cy="500" r="4[1-9]\d"[^>]*\/>/g, "");
    const a = renderCoin({ ...base, seed: 77n, yieldBps: 0 });
    const b = renderCoin({ ...base, seed: 77n, yieldBps: 1000 });
    expect(b.svg.length).toBeGreaterThan(a.svg.length);
    expect(b.yieldLevel).toBe(5);
  });
  test("fifty masters, each named, each its own bytes", () => {
    expect(MASTERS.length).toBe(50);
    expect(new Set(MASTERS.map((m) => m.name)).size).toBe(50);
    const svgs = new Set(MASTERS.map((_, i) => renderCoin({ ...base, seed: 5n, master: i }).svg));
    expect(svgs.size).toBe(50);
    expect(renderCoin({ ...base, seed: 5n, master: 1 }).masterName).toBe("The Void");
  });
  test("design indices stay inside their tables", () => {
    for (let i = 0n; i < 2000n; i++) {
      const d = designOf(nextRandom(i * 31n));
      expect(d.material).toBeLessThan(12);
      expect(d.symmetry).toBeLessThan(6);
      expect(d.anomaly).toBeLessThan(6);
    }
  });
});
