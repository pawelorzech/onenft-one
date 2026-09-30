import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { downloadScript } from "./wallet.ts";

test("download timeout covers the body and restores the control after a stalled stream", async () => {
  let handler: (event: { preventDefault(): void }) => Promise<void>;
  let requests = 0;
  const output = { textContent: "" };
  const attrs = new Map<string, string>([["data-dl", "png"], ["data-id", "1"], ["data-src", "/image.svg"]]);
  const control = { textContent: "PNG", addEventListener: (_: string, fn: typeof handler) => { handler = fn; }, getAttribute: (key: string) => attrs.get(key) ?? null, hasAttribute: (key: string) => attrs.has(key), setAttribute: (key: string, value: string) => attrs.set(key, value), removeAttribute: (key: string) => attrs.delete(key) };
  const document = { getElementById: () => output, querySelectorAll: (query: string) => query === "[data-dl]" ? [control] : [] };
  runInNewContext(downloadScript().replace(/^<script>\s*|\s*<\/script>$/g, ""), {
    document, localStorage: { getItem: () => null }, AbortController,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, Math.min(ms, 20)), clearTimeout,
    fetch: async (_: string, { signal }: { signal: AbortSignal }) => {
      requests++;
      return { ok: true, text: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "AbortError" })))) };
    },
  });
  const event = { preventDefault() {} };
  const result = await Promise.race([Promise.all([handler!(event), handler!(event)]).then(() => "finished"), Bun.sleep(150).then(() => "stuck")]);
  expect(result).toBe("finished");
  expect(requests).toBe(1);
  expect(output.textContent).toContain("Download failed:");
  expect(output.textContent).toContain("took too long");
  expect(control.textContent).toBe("PNG");
  expect(attrs.has("aria-busy")).toBe(false);
});

