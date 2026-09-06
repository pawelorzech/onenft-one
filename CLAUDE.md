# one.onenft.click

ONE: coins backed by USDC on Base, one series of 10,000 at a time, 50 Master Coins per series. Fifth collection of onenft.click (hub repo `~/Programowanie/onenft-hub`), built 2026-09-06 in the skeleton of the sisters (`~/Programowanie/onenft-faces` is the closest). Not live yet. Operational identifiers go in `CLAUDE.local.md` (gitignored).

## What this is

- Every coin has two independent axes: **art** (a seed from Chainlink VRF, a slot from a lazy Fisher-Yates urn over the series, 50 slots are Master Coins) and **capital** (10, 25 or 50 USDC of backing held as ERC-4626 vault shares; burn redeems backing plus yield minus 10 percent of the yield). No pay-to-rarity: a 10 USDC coin can be a Master Coin.
- `src/coin.ts` draws a coin from the seed; `src/masters.ts` holds the fifty 1/1 recipes. **TypeScript is the source of truth**; `contracts/src/CoinRenderer.sol` must produce the same bytes (fixtures, Foundry test), as in the sisters. Integers only, no trigonometry: every radial thing is one motif copied with `rotate()`.
- The yield ring is the dynamic layer: `yieldBps` (lifetime yield over backing) sets a level, the level draws orbits, ticks and glow around the coin. It never shrinks; claims and transfers do not reset it.
- Decisions in `docs/DECISIONS.md`. Same copy rules as the sisters: English, plain words, active voice, no adverbs, no em dashes. Same anti-slop design rules.

## Commands

- `bun test` · `bun run scripts/sim.ts [n]` simulates n mints with the urn and prints trait odds, proves every SVG distinct · `bun run scripts/sheet.ts coins|masters|yield|one` renders review sheets to `out/`.
- Never npm/npx, never Python for project code.

## Frontend Theme

Inherited from the sisters: Syne 700/800 for display and numbers, Newsreader 400 for text; no border radius, 1px hairlines; no motion. The site wears the colors of the newest coin.
