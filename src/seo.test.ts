import { test, expect } from "bun:test";
import { sitemapResponse, pageDescription } from "./seo.ts";
test("a sitemap escapes XML without losing a content-identifying query", async () => {
  const response = sitemapResponse(new URL("https://local/sitemap.xml"), "example.test", ["/coins?page=2&kind=master"]);
  expect(await response!.text()).toContain("https://example.test/coins?page=2&amp;kind=master");
});
test("large token sitemaps are split and every shard has a bounded number of entries", async () => {
  const tokens = Array.from({ length: 1001 }, (_, n) => "/coin/" + (n + 1));
  const read = (path: string) => sitemapResponse(new URL("https://local" + path), "example.test", ["/"], tokens)!;
  const index = await read("/sitemap.xml").text();
  expect(index).toContain("<sitemapindex");
  expect(index).toContain("/sitemap/static.xml");
  expect(index).toContain("/sitemap/tokens-2.xml");
  expect((await read("/sitemap/tokens-1.xml").text()).match(/<url>/g)).toHaveLength(1000);
  expect((await read("/sitemap/tokens-2.xml").text()).match(/<url>/g)).toHaveLength(1);
  expect(read("/sitemap/tokens-3.xml").status).toBe(404);
  expect(read("/sitemap/tokens-0.xml").status).toBe(404);
});
test("pagination descriptions preserve page identity and unrecognized content keeps its own description", () => {
  expect(pageDescription("example.test", "/coins?page=2", "fallback")).toContain("Page 2.");
  expect(pageDescription("example.test", "/coin/2", "Specific coin description")).toBe("Specific coin description");
});

