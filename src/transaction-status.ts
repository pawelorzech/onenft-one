import { createPublicClient, fallback, http, parseAbi, type Address, type Hex } from "viem";

/** Only fixed-chain receipts and ONE's two USDC reads; never a general RPC proxy. */
export function transactionApi(config: { address: string; chainId: number; tokenReads?: boolean; rpcUrls?: string[] }, injected?: { receipt(hash: Hex): Promise<unknown>; usdc(): Promise<string>; call(to: Address, data: Hex): Promise<unknown> }) {
  const urls = [...new Set(config.rpcUrls ?? [process.env.BASE_RPC_URL, config.chainId === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org", config.chainId === 8453 ? "https://base-rpc.publicnode.com" : "https://base-sepolia-rpc.publicnode.com"].filter((v): v is string => !!v))];
  const client = createPublicClient({ transport: fallback(urls.map(url => http(url, { timeout: 3000, retryCount: 0 })), { retryCount: 0 }) });
  const deps = injected ?? {
    async receipt(hash: Hex) {
      try { const r = await client.getTransactionReceipt({ hash }); return { status: r.status === "success" ? "0x1" : "0x0", blockNumber: "0x" + r.blockNumber.toString(16), logs: r.logs.map(l => ({ address: l.address, topics: l.topics, data: l.data })) }; }
      catch (e) { if ((e as Error).name === "TransactionReceiptNotFoundError") return null; throw e; }
    },
    async usdc() { return client.readContract({ address: config.address as Address, abi: parseAbi(["function USDC() view returns (address)"]), functionName: "USDC" }); },
    async call(to: Address, data: Hex) { return (await client.call({ to, data })).data; },
  };
  const reply = (body: object, status = 200) => Response.json({ chainId: config.chainId, contract: config.address, ...body }, { status, headers: { "cache-control": "no-store" } });
  return async (url: URL): Promise<Response | null> => {
    const receipt = url.pathname.match(/^\/api\/transaction\/(0x[0-9a-fA-F]{64})$/);
    const token = url.pathname === "/api/token-read" && config.tokenReads;
    if (!receipt && !token) return url.pathname.startsWith("/api/transaction/") ? reply({ error: "invalid transaction hash" }, 400) : null;
    if (!config.address || url.searchParams.get("contract")?.toLowerCase() !== config.address.toLowerCase() || url.searchParams.get("chainId") !== String(config.chainId)) return reply({ error: "collection changed; reload this page" }, 409);
    try {
      if (receipt) return reply({ receipt: await deps.receipt(receipt[1] as Hex) });
      const to = url.searchParams.get("to") ?? "", data = url.searchParams.get("data") ?? "";
      const balance = /^0x70a082310{24}[0-9a-fA-F]{40}$/.test(data);
      const allowance = /^0xdd62ed3e0{24}[0-9a-fA-F]{40}0{24}[0-9a-fA-F]{40}$/.test(data) && data.slice(-40).toLowerCase() === config.address.slice(2).toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/.test(to) || (!balance && !allowance)) return reply({ error: "unsupported token read" }, 400);
      if (to.toLowerCase() !== (await deps.usdc()).toLowerCase()) return reply({ error: "wrong token" }, 400);
      const value = await deps.call(to as Address, data as Hex);
      if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("invalid token result");
      return reply({ value });
    } catch (e) { console.error("transaction-read:", (e as Error).name, String((e as {shortMessage?: string}).shortMessage ?? "read failed").replace(/https?:\/\/\S+/g, "[rpc]").slice(0,180)); return reply({ error: "chain read unavailable; try again" }, 503); }
  };
}
