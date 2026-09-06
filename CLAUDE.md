# one.onenft.click

ONE: coins backed by USDC on Base, one series of 10,000 at a time, 50 Master Coins per series. Fifth collection of onenft.click (hub repo `~/Programowanie/onenft-hub`), built 2026-09-06 in the skeleton of the sisters (`~/Programowanie/onenft-faces` is the closest). Not live yet. Operational identifiers go in `CLAUDE.local.md` (gitignored).

## What this is

- Every coin has two independent axes: **art** (a seed from Chainlink VRF, a slot from a lazy Fisher-Yates urn over the series, 50 slots are Master Coins) and **capital** (10, 25 or 50 USDC of backing held as ERC-4626 vault shares; burn redeems backing plus yield minus 10 percent of the yield). No pay-to-rarity: a 10 USDC coin can be a Master Coin.
- `src/coin.ts` draws a coin from the seed; `src/masters.ts` holds the fifty 1/1 recipes. **TypeScript is the source of truth**; `contracts/src/CoinRenderer.sol` must produce the same bytes (fixtures, Foundry test), as in the sisters. Integers only, no trigonometry: every radial thing is one motif copied with `rotate()`.
- The yield ring is the dynamic layer: `yieldBps` (lifetime yield over backing) sets a level, the level draws orbits, ticks and glow around the coin. It never shrinks; claims and transfers do not reset it.
- Decisions in `docs/DECISIONS.md`. Same copy rules as the sisters: English, plain words, active voice, no adverbs, no em dashes. Same anti-slop design rules.

## Site

- `src/server.ts` serves the site and reads the chain through `src/contract.ts`. **Env: `CONTRACT_ADDRESS`, `CHAIN_ID` (8453 or 84532), `BASE_RPC_URL`**; optional `DEPLOYER_KEY` (arms the keeper), `UMAMI_URL` + `UMAMI_WEBSITE_ID`, `PORT`, and the read tuning `CHAIN_TTL_MS`, `CHAIN_DEADLINE_MS`, `RPC_TIMEOUT_MS`, `STALE_AFTER_MS`, `COINS_TTL_MS`, `KEEPER_EVERY_MS`. With no `CONTRACT_ADDRESS` the site is a plain renderer: the empty state, no mint box, no wallet pages.
- The cache is the sisters' rule (`src/swr.ts`): a page never waits on the RPC when a last good state exists, a refresh runs behind it shared by every request, failures back off, and a read is all or nothing. Every refresh re-reads the newest 120 coins and every sealed coin; all coins once every ten minutes. RPC URLs are scrubbed from every error.
- Pages: `/`, `/coins`, `/coin/<id>`, `/masters`, `/traits`, `/yield`, `/how`, `/assets`, `/yours`, `/<address or name.eth>`. Images `/coin/<id>.svg|.png|-1024.png`, `/coin/<id>.svg?yield=<bps>`, `/master/<i>.svg`, `/preview/<hex seed>.svg`, `/newest.svg|.png`. JSON `/api/state`, `/api/coin/<id>`, `/api/holder/<who>`, `/spec.json`, plus `/health` and `/ready` (503 when a contract is configured and the chain never answered).
- The browser does the writing: the mint box on `/` connects, switches the wallet to the right chain, reads the USDC balance and allowance, approves the exact total when it must, sends `mint(class, count, wallet)`, reads the new ids from the `Minted` logs and polls `/api/coin/<id>` until each coin opens, keeping the transaction in `localStorage` per chain, contract and wallet so a refresh picks it up. The author's wallet also sees `mintFounder`. Claim and redeem sit on `/coin/<id>` and on a wallet's page, shown only to the wallet that owns the coin. Calldata is built from selectors in `src/contract.ts`; there is no ABI encoder in the page.
- `src/keeper.ts` runs when `DEPLOYER_KEY` is set: every five minutes it takes the sealed coins' request ids and calls `retry(requestId)` on any request past `RETRY_BLOCKS`. Nothing else is signed on the server.
- `src/abi.test.ts` checks the hand-written ABI against `contracts/out/OneCoin.sol/OneCoin.json`. **When the contract changes, that test is the first thing to look at**; it skips when the artifact is missing.
- Copy in `src/site.ts`; inner pages in `src/pages.ts`; PNG cards in `src/image.ts` with the fonts in `assets/fonts/`.
- The page wears the newest coin that has its art. A sealed coin is grey by design, so wearing it would drain the site of colour after every mint.

## Commands

- `bun test` (47 tests) · `PORT=3000 bun run src/server.ts` (add `CONTRACT_ADDRESS`, `CHAIN_ID`, `BASE_RPC_URL` to read a chain) · `bun run tsc -p tsconfig.json` · `bun run scripts/sim.ts [n]` simulates n mints with the urn and prints trait odds, proves every SVG distinct · `bun run scripts/sheet.ts coins|masters|yield|one` renders review sheets to `out/`.
- Never npm/npx, never Python for project code.

## Frontend Theme

Inherited from the sisters: Syne 700/800 for display and numbers, Newsreader 400 for text; no border radius, 1px hairlines; no motion. The site wears the colors of the newest coin.
