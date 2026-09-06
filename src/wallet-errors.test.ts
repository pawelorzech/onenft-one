import { test, expect } from "bun:test";
import { runInNewContext } from "node:vm";
import { walletErrorScript } from "./wallet-errors.ts";
const message = runInNewContext(walletErrorScript + ";walletErrorMessage");
test("executed browser messages explain cause, transaction status and recovery", () => {
  expect(message({ code: 4001 })).toContain("No new transaction was sent");
  expect(message({ code: -32002 })).toContain("Do not start another one");
  expect(message({ message: "insufficient funds for gas" })).toContain("ETH on Base for network gas and the randomness fee");
  expect(message({ message: "insufficient USDC balance" })).toContain("choose fewer coins");
  expect(message({ message: "insufficient allowance" })).toContain("pending approvals");
  expect(message({ message: "Switch back to Base" })).toContain("Continue on Base");
  expect(message({ message: "wallet account changed" })).toContain("original account");
  expect(message({ code: 4900 })).toContain("Reconnect your wallet");
  expect(message({ message: "RPC timeout" })).toContain("Wait a moment");
  expect(message({}, { contractMessage: "The series is full." })).toContain("The series is full.");
});
test("unknown send and known hash never claim nothing was sent", () => {
  for (const error of [{ message: "timeout" }, { code: 4900 }, { message: "provider exploded" }]) {
    const unknown = message(error, { phase: "sending" });
    expect(unknown).toContain("will not resend it automatically");
    expect(unknown).not.toContain("No new transaction was sent");
    const sent = message(error, { hash: "0x123" });
    expect(sent).toContain("A transaction was sent");
    expect(sent).toContain("Do not send another transaction");
  }
});
