import { expect, test } from "bun:test";
import { createPublicClient } from "viem";
import { readTransport, rpcUrls } from "./rpc.ts";

test("BASE_RPC_URL leads, public endpoints follow, duplicates collapse", () => {
  expect(rpcUrls(8453, { BASE_RPC_URL: "https://mainnet.base.org" })).toEqual(["https://mainnet.base.org", "https://base-rpc.publicnode.com"]);
  expect(rpcUrls(84532, {})).toEqual(["https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org"]);
  expect(rpcUrls(8453, { BASE_RPC_URL: "http://a", BASE_RPC_FALLBACK_URLS: "" })).toEqual(["http://a"]);
  expect(rpcUrls(8453, { BASE_RPC_URL: "http://a", BASE_RPC_FALLBACK_URLS: "http://b, http://a,http://c" })).toEqual(["http://a", "http://b", "http://c"]);
  expect(rpcUrls(1, { BASE_RPC_URL: "http://a" })).toEqual(["http://a"]);
});

test("a rate limited endpoint hands the read to the next one, without a retry", async () => {
  let first = 0, second = 0;
  const a = Bun.serve({ port: 0, fetch: async (req) => { first++; const j = await req.json(); return Response.json({ jsonrpc: "2.0", id: j.id, error: { code: -32016, message: "over rate limit" } }, { status: 429 }); } });
  const b = Bun.serve({ port: 0, fetch: async (req) => { second++; const j = await req.json(); return Response.json({ jsonrpc: "2.0", id: j.id, result: "0x10" }); } });
  try {
    const client = createPublicClient({ transport: readTransport(8453, 2000, [`http://localhost:${a.port}`, `http://localhost:${b.port}`]) });
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(first).toBe(1);
    expect(second).toBe(1);
  } finally { a.stop(true); b.stop(true); }
});

test("every endpoint failing is still a failed read", async () => {
  const a = Bun.serve({ port: 0, fetch: () => new Response("unavailable", { status: 503 }) });
  try {
    const client = createPublicClient({ transport: readTransport(8453, 2000, [`http://localhost:${a.port}`, `http://localhost:${a.port}/b`]) });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow();
  } finally { a.stop(true); }
});
