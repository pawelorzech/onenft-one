# Mainnet constraints and remaining risks

Reviewed 2026-09-07 against the checked-in source and local tests. This is not an independent security audit or a guarantee about every mainnet execution. This release changes the application and tests, not deployed token or renderer contracts. The deployment record identifies ONE on Base at `0x7A7dea7489708cc9b50831C364aCf6e95aA13b41`.

## R2: links in metadata after series one

The renderer builds coin links from the number inside the series. That number restarts at one, while the application's canonical `/coin/<id>` route uses the global token id. The old `/coin/1` link alone does not identify which series its author intended. The application cannot change metadata produced by the deployed renderer or recover that missing information from the URL.

The site provides `/series/<series>/coin/<number>` and a series selector that resolve to the global id, and the JSON API includes a series URL. For a series size of 25,000, series two coin one resolves to `/coin/25001`. Existing marketplace metadata links remain ambiguous. Do not report this mitigation as an on-chain metadata fix.

## R7: renderer RPC cost

The earlier local audit measured a worst sampled `tokenURI` case around 31 million gas. That is an execution cost in the tested context, not the gas price of visiting the website and not a guaranteed maximum over every input. Providers impose different `eth_call` gas and response limits; a marketplace reading the contract can fail even when the website renders the image.

The application generates images locally with the TypeScript renderer and caches rendered coins and metadata using the complete rendering inputs. Regression tests check identical metadata and invalidation when coin inputs change. This improves repeated website requests; it does not reduce the deployed renderer's cost. Marketplace compatibility must still be tested with the provider that actually reads the contract.

## R9: callback order and retry semantics

Each request is bound to its minted batch. Within a batch, coins are processed in id order. Across independent batches, callbacks consume a shared series urn in arrival order. Therefore the same random words can assign different slots to particular coins when callback order changes.

`test_ReverseIndependentFulfilmentsChangeWhoReceivesTheMasterSlot` demonstrates this directly: two independent requests both drawing index zero assign slot zero to whichever callback lands first. Reversing the callbacks changes which owner receives the Master slot. Draw count and slot uniqueness still hold. This is a real dependence on ordering; the test does not establish that an ordinary holder controls Base transaction ordering or quantify exploitation probability.

`test_ReverseIndependentFulfilmentsAcrossABoundaryKeepBothUrnsConsistent` covers a batch crossing 25,000/25,001 followed by a second batch, fulfilled in reverse order. It checks independent urn counters, series numbering and duplicate-callback idempotence. Existing tests cover a full batch across that boundary, callback gas margin, late original responses after retry, original responses before retry responses, and rejection of repeated retry branches.

A retry leaves the original request valid. The first valid response to arrive reveals the batch; later responses do not overwrite the art or draw again. This prevents the tested attack of discarding a pending original answer by retrying, but creates multiple outstanding answers whose arrival order matters. It does not prove unbiased results under adversarial ordering. Chainlink's [VRF security guidance](https://docs.chain.link/vrf/v2-5/security) explicitly calls for analyzing fulfillment ordering and advises against re-requesting randomness.

The site cannot serialize immutable on-chain callbacks, remove public retry, or change urn allocation. Keep the subscription funded, monitor sealed requests and callback failures, and investigate delayed fulfillment before initiating more recovery attempts. Keep retries tied to the current request and the contract's block threshold. Never describe VRF use alone as proof that allocation is immune to ordering or that there is no remaining risk. This item remains a documented contract limitation requiring specialist review if stronger assurances are needed.

## Validation commands

- `bash scripts/gate.sh`: build artifacts, ABI checks, application tests, fixture parity, Foundry, bundle and dependency audit.
- `cd contracts && forge test --match-test 'test_ReverseIndependent' -vv`: the two callback-order characterization tests.
- `bun run scripts/benchmark-reader.ts`: 1,000/10,000/25,000 coin snapshots through viem over a local mock RPC, followed by a 120-coin refresh. This measures local encoding/decoding and request counts, not production network latency or RPC capacity.

### Local reader measurement (2026-09-07)

One run on Bun 1.3.13/macOS ARM64, in-memory RPC fixture, with other local checks running:

| Coins | Cold snapshot | Mock RPC calls | Refresh 120 coins | Mock RPC calls |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 335 ms | 78 | 40 ms | 12 |
| 10,000 | 3,393 ms | 752 | 37 ms | 12 |
| 25,000 | 8,449 ms | 1,878 | 37 ms | 12 |

All snapshots contained every expected coin. The full scan remains linear and its many provider calls can be costly at series scale. The mock excludes network delay, throttling and on-chain vault execution: these results do not establish that the production RPC can finish a cold 25,000-coin scan inside its configured deadline. Measure the chosen provider before reaching that scale; a durable index or a resumable full scan may be needed. Recent refresh cost remains bounded to the configured 120-coin window when there are no new or sealed coins.
