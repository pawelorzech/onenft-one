import { expect, test } from "bun:test";
import { Swr } from "./swr.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test("twenty concurrent readers with no value share one load", async () => {
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const s = new Swr<number>({ load: async () => { loads++; await gate; return 42; }, ttlMs: 100, staleAfterMs: 1000, deadlineMs: 5000 });
  const all = Promise.all(Array.from({ length: 20 }, () => s.get()));
  await tick();
  expect(loads).toBe(1);
  release();
  expect(await all).toEqual(Array(20).fill(42));
});

test("a stale value is served at once and one refresh runs behind it", async () => {
  const c = clock();
  let loads = 0;
  let slow = false;
  const s = new Swr<number>({ load: async () => { loads++; if (slow) await new Promise((r) => setTimeout(r, 30)); return loads; }, ttlMs: 100, staleAfterMs: 1000, deadlineMs: 5000, now: c.now });
  expect(await s.get()).toBe(1);
  c.advance(200);
  slow = true;
  const t0 = Date.now();
  const got = await Promise.all(Array.from({ length: 20 }, () => s.get()));
  expect(Date.now() - t0).toBeLessThan(25);
  expect(got.every((v) => v === 1)).toBe(true);
  expect(loads).toBe(2);
  await new Promise((r) => setTimeout(r, 40));
  expect(s.peek()).toBe(2);
});

test("with no value the caller waits only up to the deadline; the load finishes later and is kept", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const s = new Swr<number>({ load: async () => { await gate; return 7; }, ttlMs: 100, staleAfterMs: 1000, deadlineMs: 20 });
  const t0 = Date.now();
  expect(await s.get()).toBeNull();
  expect(Date.now() - t0).toBeLessThan(200);
  expect(s.status().known).toBe(false);
  release();
  await tick();
  await tick();
  expect(s.peek()).toBe(7);
  expect(s.status().known).toBe(true);
});

test("a failure keeps the old value, records the error, does not reset the age, and backs off", async () => {
  const c = clock();
  let fail = false;
  let loads = 0;
  const s = new Swr<number>({ load: async () => { loads++; if (fail) throw new Error("boom http://user:key@rpc.example/x"); return 1; }, ttlMs: 100, staleAfterMs: 500, deadlineMs: 50, backoffMinMs: 1000, backoffMaxMs: 4000, now: c.now, describe: (e) => String((e as Error).message).replace(/https?:\/\/\S+/g, "[rpc]") });
  expect(await s.get()).toBe(1);
  const readAt = s.status().readAt;
  fail = true;
  c.advance(200);
  expect(await s.get()).toBe(1);
  await tick();
  await tick();
  const st = s.status();
  expect(st.error).toBe("boom [rpc]");
  expect(st.readAt).toBe(readAt);
  expect(st.failures).toBe(1);
  expect(st.stale).toBe(false);
  // Inside the backoff window no new load starts.
  c.advance(300);
  expect(await s.get()).toBe(1);
  await tick();
  expect(loads).toBe(2);
  // Past the window it retries, and past staleAfterMs the value reads as stale.
  c.advance(800);
  expect(await s.get()).toBe(1);
  await tick();
  await tick();
  expect(loads).toBe(3);
  expect(s.status().stale).toBe(true);
  expect(s.status().failures).toBe(2);
});

test("with no value and a failing load, callers inside the backoff window get null without waiting", async () => {
  const c = clock();
  const s = new Swr<number>({ load: async () => { throw new Error("down"); }, ttlMs: 100, staleAfterMs: 500, deadlineMs: 50, backoffMinMs: 1000, now: c.now });
  expect(await s.get()).toBeNull();
  const t0 = Date.now();
  expect(await s.get()).toBeNull();
  expect(Date.now() - t0).toBeLessThan(10);
  expect(s.status().error).toBe("down");
});
