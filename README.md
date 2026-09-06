# one.onenft.click

ONE: pixel coins backed by USDC on Base. 10,000 a series, series without end, 50 Master Coins a series drawn from an urn nobody can steer. Every coin holds 10, 25 or 50 USDC in a vault that earns; burn the coin and the backing plus its yield comes back. Art and money never correlate. CC0.

- The coin is a 64 by 64 pixel grid drawn on chain from a Chainlink VRF seed, and a yield ring around it that grows with the coin's lifetime yield and never resets.
- The site reads the contract on Base: the newest coins, what each one holds, and a mint box that walks the whole way from approve to the seed landing.

`bun test` · `CONTRACT_ADDRESS=… CHAIN_ID=8453 BASE_RPC_URL=… PORT=3000 bun run src/server.ts` · `bun run scripts/sim.ts`

Part of [onenft.click](https://onenft.click).
