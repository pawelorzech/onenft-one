/** Embedded verbatim; every response belongs to the page's chain and contract. */
export async function readChain(path: string, chainHex: string, contract: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const url = path + (path.includes("?") ? "&" : "?") + "chainId=" + Number(BigInt(chainHex)) + "&contract=" + contract;
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("The chain read is unavailable. No new transaction was sent.");
    const value = await response.json();
    if (value.chainId !== Number(BigInt(chainHex)) || typeof value.contract !== "string" || value.contract.toLowerCase() !== contract.toLowerCase()) throw new Error("The collection changed. Reload the page before continuing.");
    return value;
  } finally { clearTimeout(timer); }
}
/** A timed-out send remains uncertain; this does not cancel a wallet request. */
export async function sendWithTimeout(provider: { request(args: unknown): Promise<unknown> }, tx: unknown): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([provider.request({ method: "eth_sendTransaction", params: [tx] }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Wallet request timed out; check wallet activity before retrying")), 60000); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
