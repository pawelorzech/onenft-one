import { expect, test } from "bun:test";
import { custom, encodeErrorResult, encodeAbiParameters, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";
import { createEnsClient } from "./ens.ts";

const address = "0x0000000000000000000000000000000000000001" as Address;
const offchainAbi = parseAbi(["error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)"]);

test("forward and reverse ENS never follow a resolver-controlled HTTP gateway", async () => {
  let gatewayCalls = 0, rpcCalls = 0;
  const gateway = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() { gatewayCalls++; return Response.json({ data: "0x" }); } });
  const client = createEnsClient(custom({ request: async () => {
    rpcCalls++;
    throw { code: 3, message: "execution reverted", data: encodeErrorResult({
      abi: offchainAbi, errorName: "OffchainLookup",
      args: [mainnet.contracts.ensUniversalResolver.address, [`http://127.0.0.1:${gateway.port}/{sender}/{data}`], "0x1234", "0x12345678", "0x"],
    }) };
  } }, { retryCount: 0 }));
  try {
    await expect(client.getEnsAddress({ name: "attacker.eth", strict: true })).rejects.toThrow();
    await expect(client.getEnsName({ address, strict: true })).rejects.toThrow();
    expect(rpcCalls).toBe(2);
    expect(gatewayCalls).toBe(0);
  } finally { await gateway.stop(true); }
});

test("onchain ENS records still resolve with CCIP disabled", async () => {
  const client = createEnsClient(custom({ request: async () => encodeAbiParameters(
    [{ type: "bytes" }, { type: "address" }],
    [encodeAbiParameters([{ type: "address" }], [address]), address],
  ) }, { retryCount: 0 }));
  expect(await client.getEnsAddress({ name: "onchain.eth" })).toBe(address);
});

test("onchain reverse ENS records still resolve with CCIP disabled", async () => {
  const client = createEnsClient(custom({ request: async () => encodeAbiParameters(
    [{ type: "string" }, { type: "address" }, { type: "address" }],
    ["onchain.eth", address, address],
  ) }, { retryCount: 0 }));
  expect(await client.getEnsName({ address })).toBe("onchain.eth");
});
