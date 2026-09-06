import { describe, expect, test } from "bun:test";
import { renderCoin, designOf, fingerprint, yieldLevel, MASTERS, YIELD_STEPS, nextRandom, N, TICKS, pixel, roman } from "./coin.ts";

const base = { number: 3871, series: 1, backing: 25, yieldBps: 0, master: -1, founder: false };

describe("coin", () => {
  test("same seed, same bytes", () => {
    expect(renderCoin({ ...base, seed: 123n }).svg).toBe(renderCoin({ ...base, seed: 123n }).svg);
  });
  test("the fingerprint is the top 32 bits, upper case hex", () => {
    expect(fingerprint(0x79db4ac100000000n)).toBe("79DB4AC1");
    expect(fingerprint(1n)).toBe("00000000");
  });
  test("roman series", () => {
    expect([1, 2, 4, 5, 9, 10, 14].map(roman)).toEqual(["I", "II", "IV", "V", "IX", "X", "XIV"]);
  });
  test("the svg is 64 by 64 pixel rows with crisp edges and only palette colours", () => {
    const c = renderCoin({ ...base, seed: 0x79db4ac1deadbeefn });
    expect(c.svg).toContain('viewBox="0 0 64 64"');
    expect(c.svg).toContain('shape-rendering="crispEdges"');
    expect(c.svg).not.toMatch(/\d\.\d/);
    const fills = new Set([...c.svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    for (const f of fills) expect(c.colors).toContain(f);
  });
  test("the low 32 bits of the seed show as ticks on the rim", () => {
    const a = renderCoin({ ...base, seed: 0xffffffff00000000n });
    const b = renderCoin({ ...base, seed: 0xffffffff00000001n });
    const [x, y] = TICKS[0];
    expect(a.grid.get(x, y)).not.toBe(b.grid.get(x, y));
    expect(TICKS.length).toBe(32);
    expect(new Set(TICKS.map(([x, y]) => `${x},${y}`)).size).toBe(32);
  });
  test("yield levels follow the steps and never shrink", () => {
    expect(yieldLevel(0)).toBe(0);
    expect(yieldLevel(1)).toBe(1);
    expect(yieldLevel(99)).toBe(1);
    expect(yieldLevel(100)).toBe(2);
    expect(yieldLevel(50000)).toBe(YIELD_STEPS.length);
    let last = -1;
    for (let bps = 0; bps < 60000; bps += 7) { const l = yieldLevel(bps); expect(l).toBeGreaterThanOrEqual(last); last = l; }
  });
  test("the yield ring changes only pixels outside the coin", () => {
    const a = renderCoin({ ...base, seed: 77n, yieldBps: 0 });
    const b = renderCoin({ ...base, seed: 77n, yieldBps: 30000 });
    expect(b.svg).not.toBe(a.svg);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (pixel(x, y, "Quad").r <= 23) expect(b.grid.get(x, y)).toBe(a.grid.get(x, y));
    }
  });
  test("fifty masters, each named, each its own bytes, each in a different mode pair", () => {
    expect(MASTERS.length).toBe(50);
    expect(new Set(MASTERS.map((m) => m.name)).size).toBe(50);
    expect(new Set(MASTERS.map((m) => m.mode)).size).toBe(25);
    const svgs = new Set(MASTERS.map((_, i) => renderCoin({ ...base, seed: 5n, master: i }).svg));
    expect(svgs.size).toBe(50);
    expect(renderCoin({ ...base, seed: 5n, master: 1 }).masterName).toBe("The Void");
  });
  test("design indices stay inside their tables", () => {
    for (let i = 0n; i < 2000n; i++) {
      const d = designOf(nextRandom(i * 31n));
      expect(d.material).toBeLessThan(12);
      expect(d.symmetry).toBeLessThan(4);
      expect(d.anomaly).toBeLessThan(6);
      expect(d.glyphBits).toBeLessThan(65536);
    }
  });
  test("legends read on every ground", () => {
    for (let i = 0n; i < 300n; i++) {
      const c = renderCoin({ ...base, seed: nextRandom(i) });
      const textSlot = c.grid.get(31, 3) || c.grid.get(30, 3) || c.grid.get(32, 3);
      expect(textSlot).not.toBe(0);
      expect(c.colors[textSlot]).not.toBe(c.colors[0]);
    }
  });
});
