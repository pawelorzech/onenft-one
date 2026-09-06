/**
 * The site's hand-written ABI against the compiled contract. Every function
 * and event the site calls must exist with the same argument and return types,
 * or a page reads garbage from a live chain and nobody finds out until then.
 * The test skips when the artifact is missing, so it needs no Foundry run to
 * pass; `cd contracts && forge build` puts it there.
 */
import { test, expect } from "bun:test";
import { ABI, SELECTORS, MINTED_TOPIC, REVERTS } from "./contract.ts";
import { encodeEventTopics, toFunctionSelector, type Abi, type AbiFunction, type AbiEvent } from "viem";

const ARTIFACT = new URL("../contracts/out/OneCoin.sol/OneCoin.json", import.meta.url).pathname;

const sig = (a: AbiFunction | AbiEvent) => `${a.name}(${a.inputs.map((i) => i.type).join(",")})`;
const rets = (a: AbiFunction) => a.outputs.map((o) => o.type).join(",");
const mut = (a: AbiFunction) => (a.stateMutability === "pure" ? "view" : a.stateMutability);
const tuple = (a: AbiFunction) => (((a.outputs[0] ?? {}) as { components?: { name?: string; type: string }[] }).components ?? []).map((c) => `${c.name}:${c.type}`).join(",");

test("the site's ABI matches the compiled OneCoin", async () => {
  const file = Bun.file(ARTIFACT);
  if (!(await file.exists())) return;
  const built = ((await file.json()) as { abi: Abi }).abi as (AbiFunction | AbiEvent)[];
  const byName = new Map(built.map((a) => [`${a.type}:${sig(a)}`, a]));
  let checked = 0;
  for (const item of ABI) {
    if (item.type !== "function" && item.type !== "event" && item.type !== "error") continue;
    const found = byName.get(`${item.type}:${sig(item as AbiFunction)}`);
    expect(`${item.type} ${sig(item as AbiFunction)} ${found ? "is in the contract" : "IS MISSING from the contract"}`).toBe(`${item.type} ${sig(item as AbiFunction)} is in the contract`);
    if (item.type === "function") {
      // A call that turned payable, or the other way round, changes what the browser must send.
      // `pure` and `view` are the same to a caller, so they count as one.
      expect(`${sig(item as AbiFunction)} ${mut(item as AbiFunction)}`).toBe(`${sig(item as AbiFunction)} ${mut(found as AbiFunction)}`);
      expect(rets(item as AbiFunction)).toBe(rets(found as AbiFunction));
      if (rets(item as AbiFunction) === "tuple") expect(tuple(item as AbiFunction)).toBe(tuple(found as AbiFunction));
    } else if (item.type === "event") {
      expect((item as AbiEvent).inputs.map((i) => Boolean(i.indexed))).toEqual((found as AbiEvent).inputs.map((i) => Boolean(i.indexed)));
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(30);
});

test("every revert the page explains is a revert the contract can throw", async () => {
  const file = Bun.file(ARTIFACT);
  if (!(await file.exists())) return;
  const built = ((await file.json()) as { abi: Abi }).abi;
  const selectors = new Set(built.filter((a) => a.type === "error").map((a) => toFunctionSelector(sig(a as unknown as AbiFunction)) as string));
  for (const [selector, said] of REVERTS) {
    expect(`${said} [${selectors.has(selector) ? "the contract throws it" : "NO SUCH ERROR in the contract"}]`).toBe(`${said} [the contract throws it]`);
  }
  expect(REVERTS.length).toBeGreaterThan(6);
});

test("the selectors and the Minted topic the browser uses come from the same ABI", () => {
  expect(MINTED_TOPIC).toBe(encodeEventTopics({ abi: ABI, eventName: "Minted" })[0]!);
  expect(SELECTORS.mint).toBe(toFunctionSelector("mint(uint8,uint8,address)"));
  expect(SELECTORS.mintFounder).toBe(toFunctionSelector("mintFounder(uint8,address)"));
  expect(SELECTORS.claim).toBe(toFunctionSelector("claim(uint256)"));
  expect(SELECTORS.redeem).toBe(toFunctionSelector("redeem(uint256)"));
  expect(SELECTORS.approve).toBe("0x095ea7b3");
  expect(SELECTORS.allowance).toBe("0xdd62ed3e");
  expect(SELECTORS.balanceOf).toBe("0x70a08231");
});
