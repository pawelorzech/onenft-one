import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { mintScript } from "./site.ts";
import type { ChainState } from "./contract.ts";

const A = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

async function resumeApproval(network: string, changeAfterReceipt = false, continueMode?: "ok" | "reject" | "account", sendFailure?: string) {
  const calls: string[] = [];
  const msg = { textContent: "", insertAdjacentHTML() {} };
  let selected = A;
  let saved: string | null = JSON.stringify({ stage: "approve", hash: "0x" + "a".repeat(64), need: "5000000", count: 1, klass: 0 });
  let click: (() => Promise<void>) | undefined;
  const networkButton = { hidden: true, disabled: false, addEventListener(_event: string, f: () => Promise<void>) { click = f; } };
  const state = { address: C, chainId: 8453, usdc: C, author: C, maxBatch: 40, vrfFeeWei: 1n } as unknown as ChainState;
  const source = mintScript(state).replace(/^<script>\s*/, "").replace(/<\/script>$/, "");
  runInNewContext(source, {
    document: { getElementById: (id: string) => id === "msg" ? msg : id === "mint-network" ? networkButton : null, querySelectorAll: () => [] },
    localStorage: { getItem: () => saved, setItem(_key: string, value: string) { saved = value; }, removeItem() { saved = null; } },
    window: { ethereum: { on() {}, request: async ({ method }: { method: string }) => {
      calls.push(method);
      if (method === "eth_accounts") return [selected];
      if (method === "eth_chainId") return network;
      if (method === "wallet_switchEthereumChain") {
        await Bun.sleep(5);
        if (continueMode === "reject") throw Object.assign(new Error("cancelled"), { code: 4001 });
        network = "0x2105";
        if (continueMode === "account") selected = C;
        return null;
      }
      if (method === "eth_sendTransaction") { if(sendFailure) throw new Error(sendFailure); return "0x" + "b".repeat(64); }
      throw new Error(`unexpected request ${method}`);
    } } },
    fetch:async()=>{if(changeAfterReceipt)selected=C;return {ok:true,json:async()=>({chainId:8453,contract:C,receipt:{status:'0x1',logs:[]}})}},AbortController,
    setTimeout, clearTimeout,
  });
  await Bun.sleep(30);
  const offered = !networkButton.hidden;
  if (continueMode) {
    await Promise.all([click!(), click!()]);
    if (continueMode === "ok") await click!();
  }
  return { calls, message: msg.textContent, saved, offered };
}

test("a saved approval cannot resume minting on a different network", async () => {
  const result = await resumeApproval("0x1");
  expect(result.calls).not.toContain("eth_sendTransaction");
  expect(result.message).toContain("Continue on Base");
});

test("changing accounts while an approval settles prevents the next transaction", async () => {
  const result = await resumeApproval("0x2105", true);
  expect(result.calls).not.toContain("eth_sendTransaction");
  expect(result.message).toContain("wallet account changed");
});

test("a saved approval still resumes on the correct network and account", async () => {
  const result = await resumeApproval("0x2105");
  expect(result.calls.filter((m) => m === "eth_sendTransaction")).toHaveLength(1);
});

test("Continue on Base resumes the saved approval once, even after two clicks", async () => {
  const result = await resumeApproval("0x1", false, "ok");
  expect(result.offered).toBe(true);
  expect(result.calls.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
  expect(result.saved).toBeNull();
});
test("rejecting Continue on Base preserves the approval and sends nothing", async () => {
  const result = await resumeApproval("0x1", false, "reject");
  expect(result.calls).not.toContain("eth_sendTransaction");
  expect(JSON.parse(result.saved!).stage).toBe("approve");
  expect(result.message).toContain("Cancelled in the wallet");
});
test("Continue on Base cannot resume with a different account after switching", async () => {
  const result = await resumeApproval("0x1", false, "account");
  expect(result.calls).not.toContain("eth_sendTransaction");
  expect(JSON.parse(result.saved!).stage).toBe("approve");
  expect(result.message).toContain("wallet account changed");
});

test("an unknown send timeout is kept across retries and never automatically resends", async () => {
  const result = await resumeApproval("0x1", false, "ok", "request timed out");
  expect(result.calls.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
  expect(JSON.parse(result.saved!).stage).toBe("uncertain");
  expect(result.message).toContain("will not resend it automatically");
});
