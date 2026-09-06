/** Run after starting the local server without wallet/keeper credentials.
 * Usage: bun scripts/browser-responsive-smoke.ts http://localhost:3412
 * Uses the Playwright CLI; performs no wallet connection or transaction.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = new URL(process.argv[2] ?? "http://localhost:3412");
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Use a local QA server");
const artifacts = mkdtempSync(join(tmpdir(), "one-responsive-"));
console.log(`Browser artifacts: ${artifacts}`);
const session = `one-responsive-${process.pid}`;
function cli(...args: string[]) {
  const result = spawnSync("bunx", ["@playwright/cli", `-s=${session}`, ...args], { encoding: "utf8", cwd: artifacts });
  if (result.status !== 0 || result.stdout.includes("### Error")) throw new Error(result.stdout + result.stderr);
  return result.stdout;
}
try {
  cli("open", base.href);
  console.log(cli("run-code", `async (page) => {
    const results = [];
    for (const route of ["/", "/yours", "/how"]) {
      await page.goto(${JSON.stringify(base.origin)} + route);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 900, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const actual = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        if (actual.scroll > actual.width) throw new Error(route + " horizontal overflow: " + JSON.stringify(actual));
        results.push({ route, ...actual });
      }
    }
    return results;
  }`));
} finally { cli("close"); }
