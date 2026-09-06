/**
 * The server as a process, against an RPC that is dead, one that hangs, and
 * none at all. What must hold: the process starts, liveness and the images
 * that need no chain answer at once, counts read as unknown and never as
 * zeros, coin and holder pages say 503 rather than "no such coin", a hung RPC
 * costs a page at most the deadline, and no answer ever quotes the RPC URL.
 */
import { expect, test, afterAll } from "bun:test";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const procs: ReturnType<typeof Bun.spawn>[] = [];

async function boot(env: Record<string, string>): Promise<string> {
  const p = "0";
  let actualPort = 0;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], { env: { ...process.env, PORT: p, CHAIN_DEADLINE_MS: "400", ...env }, stdout: "pipe", stderr: "pipe", ipc(message: unknown) { if (message && typeof message === "object" && "port" in message) actualPort = Number(message.port); } });
  procs.push(proc);
  for (let i = 0; i < 100; i++) {
    const base = `http://127.0.0.1:${actualPort}`;
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server did not start");
}
afterAll(() => { for (const p of procs) p.kill(); });

/** An RPC that accepts the connection and never answers. */
function hungRpc(): { url: string; stop: () => void; hits: () => number } {
  let n = 0;
  const srv = Bun.serve({ port: 0, fetch: () => { n++; return new Promise<Response>(() => {}); } });
  return { url: `http://127.0.0.1:${srv.port}`, stop: () => srv.stop(true), hits: () => n };
}

test("dead RPC: the process boots, the images answer, counts are unknown, coin and holder pages say 503", async () => {
  const base = await boot({ CONTRACT_ADDRESS: CONTRACT, CHAIN_ID: "84532", BASE_RPC_URL: "http://127.0.0.1:9" });
  const t0 = Date.now();
  const health = await fetch(`${base}/health`);
  expect(health.status).toBe(200);
  expect(await health.text()).toStartWith("ok, up");
  expect((await fetch(`${base}/newest.svg`)).headers.get("content-type")).toContain("image/svg+xml");
  expect((await fetch(`${base}/master/0.svg`)).status).toBe(200);
  expect((await fetch(`${base}/preview/79db4ac1deadbeef.svg`)).status).toBe(200);
  expect((await fetch(`${base}/spec.json`)).status).toBe(200);
  expect(Date.now() - t0).toBeLessThan(2500);

  const ready = await fetch(`${base}/ready`);
  expect(ready.status).toBe(503);
  const rj = await ready.json();
  expect(rj.ok).toBe(false);
  expect(rj.chain.configured).toBe(true);
  expect(rj.chain.known).toBe(false);
  expect(rj.keeper.armed).toBe(false);
  expect(JSON.stringify(rj)).not.toContain("127.0.0.1:9");

  const home = await (await fetch(`${base}/`)).text();
  expect(home).toContain("The chain did not answer");
  expect(home).toContain('<span class="fig syne">?</span>');
  expect(home).not.toContain('id="mint-btn"');
  expect(home).not.toContain("No contract is configured");

  const st = await (await fetch(`${base}/api/state`)).json();
  expect(st.totalSupply).toBeNull();
  expect(st.pending).toBeNull();
  expect(st.poolLeft).toBeNull();
  expect(st.chain.known).toBe(false);
  expect(JSON.stringify(st)).not.toContain("127.0.0.1:9");

  // A coin that cannot be read is 503, not "no such coin".
  expect((await fetch(`${base}/coin/1`)).status).toBe(503);
  expect((await fetch(`${base}/coin/1.svg`)).status).toBe(503);
  const coinJ = await fetch(`${base}/api/coin/1`);
  expect(coinJ.status).toBe(503);
  expect(coinJ.headers.get("content-type")).toContain("application/json");

  const holder = await fetch(`${base}/0x2222222222222222222222222222222222222222`);
  expect(holder.status).toBe(503);
  expect(await holder.text()).toContain("The chain did not answer");
  const hj = await fetch(`${base}/api/holder/0x2222222222222222222222222222222222222222`);
  expect(hj.status).toBe(503);
  expect((await hj.json()).error).toBe("the chain did not answer");

  // Ids restart with a new contract, so every image URL the pages emit names this one.
  expect(home).toContain("/newest.svg?c=11111111");
  expect(home).toContain("/newest.png?c=11111111");
  expect(await (await fetch(`${base}/how`)).text()).toContain("?c=11111111");
  // The tag is for caches, not for the router: the path still resolves with it and without it.
  expect((await fetch(`${base}/master/0.svg?c=11111111`)).status).toBe(200);
  expect((await fetch(`${base}/newest.svg?c=deadbeef`)).status).toBe(200);

  expect((await fetch(`${base}/nope`)).status).toBe(404);
  const apiNope = await fetch(`${base}/api/nope`);
  expect(apiNope.status).toBe(404);
  expect(apiNope.headers.get("content-type")).toContain("application/json");
  const go = await fetch(`${base}/go?who=junk`, { redirect: "manual" });
  expect(go.status).toBe(302);
  expect(go.headers.get("location")).toBe("/yours?bad=junk");
});

test("hung RPC: a page costs at most the deadline, twenty at once share one read, static paths do not wait", async () => {
  const rpc = hungRpc();
  try {
    const base = await boot({ CONTRACT_ADDRESS: CONTRACT, CHAIN_ID: "84532", BASE_RPC_URL: rpc.url, CHAIN_DEADLINE_MS: "300", RPC_TIMEOUT_MS: "60000" });
    let t0 = Date.now();
    expect((await fetch(`${base}/master/0.svg`)).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(300);
    t0 = Date.now();
    const pages = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/`)));
    expect(pages.every((r) => r.status === 200)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
    // One read in flight for the whole burst: the boot read plus at most one more, never twenty.
    expect(rpc.hits()).toBeLessThanOrEqual(2);
    expect(await pages[0].text()).toContain("The chain did not answer");
  } finally {
    rpc.stop();
  }
});

test("no contract: a plain renderer, ready, every page says minting opens with the contract", async () => {
  const base = await boot({});
  expect((await fetch(`${base}/ready`)).status).toBe(200);
  for (const p of ["/", "/coins", "/masters", "/traits", "/yield", "/how", "/assets", "/yours", "/yours?bad=nope"]) {
    const r = await fetch(`${base}${p}`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain("<!doctype html>");
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("—");
  }
  const home = await (await fetch(`${base}/`)).text();
  expect(home).toContain("Minting opens with the contract");
  // With no contract there is nothing to tag, so the URLs stay bare.
  expect(home).toContain('href="/newest.svg"');
  expect(home).not.toContain("?c=");
  expect(home).not.toContain("The chain did not answer");
  expect((await fetch(`${base}/coin/1`)).status).toBe(404);
  expect((await fetch(`${base}/api/coin/1`)).status).toBe(404);
  expect((await fetch(`${base}/0x2222222222222222222222222222222222222222`)).status).toBe(404);
  const st = await (await fetch(`${base}/api/state`)).json();
  expect(st.contract).toBeNull();
  expect(st.chain.configured).toBe(false);
  expect(st.recent).toEqual([]);
  expect((await fetch(`${base}/newest.png`)).headers.get("content-type")).toBe("image/png");
  const r = await fetch(`${base}/`);
  // A page is never cached: it carries counts that move with every mint.
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
});
