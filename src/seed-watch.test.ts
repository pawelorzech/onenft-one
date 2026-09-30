import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { sealedWatch } from "./site.ts";

function watch(json: (signal: AbortSignal) => Promise<unknown>, busy = false) {
  const timers: { callback: () => Promise<void> | void; ms: number }[] = [];
  const message = { textContent: "" };
  let reloads = 0;
  runInNewContext(sealedWatch(3).replace(/^<script>\s*|\s*<\/script>$/g, ""), {
    fetch: async (_: string, { signal }: { signal: AbortSignal } = {} as any) => ({ ok: true, json: () => json(signal) }),
    AbortController, setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout() {},
    document: { getElementById: () => message, querySelector: () => busy ? {} : null }, location: { reload: () => reloads++ },
  });
  return { timers, message, reloads: () => reloads };
}
test("a stalled seed-status body is aborted and polling recovers with a visible reason", async () => {
  const state = watch(signal => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))));
  const pending = state.timers.shift()!.callback();
  await Bun.sleep(1);
  expect(state.timers).toHaveLength(1);
  state.timers.shift()!.callback();
  await pending;
  expect(state.message.textContent).toContain("could not be checked");
  expect(state.timers).toHaveLength(1);
});
test("a revealed seed does not reload a page while a wallet action is pending", async () => {
  const state = watch(async () => ({ sealed: false }), true);
  await state.timers.shift()!.callback();
  expect(state.reloads()).toBe(0);
  expect(state.message.textContent).toContain("wallet operation");
});
test("a revealed seed reloads the coin when no wallet action is pending", async () => {
  const state = watch(async () => ({ sealed: false }));
  await state.timers.shift()!.callback();
  expect(state.reloads()).toBe(1);
});
