import { expect, test } from "bun:test";
import { rpcFixture, TOKEN } from "./test-fixtures/rpc.ts";

test("series URLs and form resolve to global token URLs through the running server", async () => {
  const { client, state } = rpcFixture(); state.last = 1;
  const rpc = Bun.serve({ port: 0, async fetch(req) {
    const body = await req.json();
    try { return Response.json({ jsonrpc: "2.0", id: body.id, result: await client.transport.request(body) }); }
    catch { return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "unsupported fixture request" } }); }
  } });
  const port = 41000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], { env: { ...process.env, PORT: String(port), CONTRACT_ADDRESS: TOKEN, CHAIN_ID: "8453", BASE_RPC_URL: `http://127.0.0.1:${rpc.port}`, DEPLOYER_KEY: "", CHAIN_DEADLINE_MS: "2500" }, stdout: "ignore", stderr: "ignore" });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/ready`)).ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 30));
    }
    expect(ready).toBe(true);
    for (const [path, location] of [["/series/1/coin/25000", "/coin/25000"], ["/series/2/coin/1", "/coin/25001"], ["/series-coin?series=3&number=1", "/coin/50001"]]) {
      const res = await fetch(base + path, { redirect: "manual" });
      expect(res.status).toBe(302); expect(res.headers.get("location")).toBe(location);
    }
    for (const path of ["/series/0/coin/1", "/series/2/coin/25001", "/series-coin?series=2&number=1e2"]) expect((await fetch(base + path)).status).toBe(400);
    const mints = await (await fetch(base + "/api/mints?after=0&limit=1")).json();
    expect(mints.items.map((c: { id: number }) => c.id)).toEqual([1]);
    expect(mints.namespace).toBe(`8453:${TOKEN}`);
  } finally { proc.kill(); await proc.exited; rpc.stop(true); }
});
