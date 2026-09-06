import { describe, expect, test } from "bun:test";
import { handle } from "./server.ts";
import { PREVIEW_SUPPLY } from "./preview.ts";

const get = (p: string) => handle(new Request(`http://localhost${p}`));

describe("server", () => {
  test("pages answer", async () => {
    for (const p of ["/", "/coins", "/coins?page=2", "/masters", "/traits", "/yield", "/how", `/coin/${PREVIEW_SUPPLY}`, "/coin/1"]) {
      const r = await get(p);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      const body = await r.text();
      expect(body).toContain("<!doctype html>");
      expect(body).not.toContain("undefined");
      expect(body).not.toContain("NaN");
      expect(body).not.toContain("—");
    }
  });
  test("images and json", async () => {
    expect((await get("/newest.svg")).headers.get("content-type")).toContain("image/svg+xml");
    expect((await get("/coin/1.svg")).status).toBe(200);
    expect((await get("/coin/1.svg?yield=5000")).status).toBe(200);
    expect((await get("/master/0.svg")).status).toBe(200);
    expect((await get("/preview/79db4ac1deadbeef.svg")).status).toBe(200);
    const j = await (await get("/api/coin/1")).json();
    expect(j.id).toBe(1);
    expect(j.image).toContain("/coin/1.svg");
    const s = await (await get("/api/state")).json();
    expect(s.totalSupply).toBe(PREVIEW_SUPPLY);
    expect(s.recent.length).toBe(Math.min(40, PREVIEW_SUPPLY));
    expect((await get("/spec.json")).status).toBe(200);
  });
  test("png cards render", async () => {
    const r = await get("/coin/1.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect((await get("/coin/1-1024.png")).status).toBe(200);
  });
  test("unknown coins and pages say 404", async () => {
    expect((await get(`/coin/${PREVIEW_SUPPLY + 1}`)).status).toBe(404);
    expect((await get("/coin/0")).status).toBe(404);
    expect((await get("/api/coin/99999")).status).toBe(404);
    expect((await get("/api/nothing")).status).toBe(404);
    expect((await get("/nothing")).status).toBe(404);
    expect((await get("/master/99.svg")).status).toBe(404);
  });
  test("security headers", async () => {
    const r = await get("/");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
