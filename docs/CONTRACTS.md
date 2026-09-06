# Contracts

Last verified: spec | 2026-09-06

The contract spec for ONE. Two contracts plus a vendored VRF interface, all in `contracts/`. Solidity 0.8.28, OpenZeppelin 5.x, Foundry with `via_ir`. **TypeScript is the source of truth for the art and the metadata**: `contracts/test/fixtures/coin_cases.json` (from `bun run contracts/fixtures.ts`) holds 149 cases the renderer must reproduce byte for byte.

## 1. CoinRenderer

Port of `src/coin.ts`, `src/masters.ts`, `src/tables.ts` and `src/metadata.ts`. Pure, no storage, no owner. May be split into several contracts (24 KB limit): a `Pixels` library (splitmix64, `Draws`, `hash32`, `isqrt`, `pixel()` fold and pseudo angle, the 3 by 5 font, `stamp`, the SVG encoder), `CoinRenderer` (tables, `designOf`, procedural pixels, sealed coin, legend, metadata) and `MasterRenderer` (the 25 modes, the 50 recipes). The token pins the renderer address per coin at mint.

```solidity
struct CoinView {
    uint64 seed;          // 0 while sealed
    uint16 number;        // 1..10000 inside the series
    uint16 series;        // 1..
    uint8 backing;        // 10, 25 or 50
    uint32 yieldBps;      // lifetime yield over backing, basis points, capped by the token at 100000
    uint8 master;         // 0..49, or 255 for none
    bool founder;
    bool sealed;
    uint256 fundedUnits;  // USDC units (6 decimals) of backing paid or funded so far
    uint256 lifetimeUnits;// USDC units of gross yield the coin earned so far
}
interface ICoinRenderer {
    function tokenURI(CoinView calldata c) external pure returns (string memory); // "data:application/json;base64," + base64(json(c))
    function json(CoinView calldata c) external pure returns (string memory);     // fixture `json`
    function svg(CoinView calldata c) external pure returns (string memory);      // fixture `svg`
    function grid(CoinView calldata c) external pure returns (bytes memory);      // fixture `grid`, 4096 bytes of colour slots
    function masterCount() external pure returns (uint256);                        // 50
    function masterName(uint8 i) external pure returns (string memory);
}
```

Rules that must hold, all covered by the fixtures:
- Integer arithmetic only, the same operations in the same order as the TS (`Math.floor` of a non-negative division is `/`; `Math.imul` and `>>> 0` are `uint32` wrapping; `hash32` uses `uint32` multiplication mod 2^32). `pixel()`: `dx = 2x - 63`, `r = isqrt(dx*dx + dy*dy) >> 1`, folds per symmetry, pseudo angle from octant and `slope = small * 32 / big`.
- `designOf(seed)`: the `Draws` stream (counter, splitmix64, top bits), the same draw order: material, ground, rim, field, symmetry, core, glyph, surface, halo, accent, anomaly, then density `range(0,3)`, glyphBits `bits(16)`, fieldA `range(0,15)`, fieldB `range(0,15)`, salt `bits(16)`. `pick` takes `bits(16) % total`.
- `TICKS`: the 32 rim pixels, computed as in TS (nearest ring pixel to pseudo angle `i * 8`, ties to the smaller y then x), may be a constant table in Solidity as long as the fixtures pass.
- SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" fill="…"/>` then one `<path fill="…" d="…"/>` per colour slot 1.. in slot order, `M{x} {y}h{w}v1h-{w}z` per run, only for slots that have runs. Colours lower case hex as in the tables.
- Metadata: exactly `src/metadata.ts`: key order name, description, image, external_url, attributes; `units()` with six decimals; the base64 of the SVG inside `image`.
- A sealed coin ignores `seed` and `master`.
- Gas: `tokenURI` must run inside one `eth_call` of 50M gas on a public Base RPC for every fixture. Keep the per-pixel loop tight (no memory allocation per pixel, `unchecked` where safe, the grid as one `bytes` of 4096).

## 2. OneCoin (ERC-721)

`OneCoin is ERC721, Ownable(author), VRFConsumerV2Plus`. Immutable: `USDC`, `VAULT` (ERC-4626 whose `asset()` is USDC, checked in the constructor), `vrfCoordinator`, `keyHash`, `subId`, `author`. Owner (the author) may only `setRenderer`, `lockRenderer`, `withdrawTreasury`. **No pause, no upgrade, no function that moves a holder's shares anywhere but to that holder.**

Constants: `SERIES_SIZE = 10000`, `MASTERS = 50`, `FOUNDERS_PER_SERIES = 50`, `MAX_BATCH = 10`, `FEE_BPS = 1000` (10% of yield), backings `10e6, 25e6, 50e6`, `CALLBACK_GAS = 2_000_000`, `REQUEST_CONFIRMATIONS = 3`, `RETRY_BLOCKS = 7200`, `nativePayment = true`.

Token ids are global and sequential from 1. `series = (id - 1) / SERIES_SIZE + 1`, `number = (id - 1) % SERIES_SIZE + 1`.

Per token storage (pack it):
```
uint64 seed; uint16 slot (0..9999, < MASTERS is a master; 0xFFFF while sealed); uint8 backingClass (0,1,2);
bool founder; address renderer; uint256 shares; uint256 principal (USDC units paid or funded so far);
uint256 claimed (gross yield already paid out, units); uint256 requestId (while sealed)
```

### Mint
- `mint(uint8 backingClass, uint8 count, address to)`: `1 <= count <= MAX_BATCH`. Pulls `count * backing` USDC with `transferFrom`, approves and `VAULT.deposit(total, address(this))`, splits the shares evenly, the remainder to the last coin. Mints `count` tokens to `to`, each `principal = backing`, sealed. One VRF request for `count` words; `requests[requestId] = firstId, count`. Emits `Minted(id, to, backingClass, requestId)`.
- `mintFounder(uint8 count, address to)` onlyOwner: like `mint` with no USDC and `principal = 0`, `founder = true`, class 50, at most `FOUNDERS_PER_SERIES` per series (counted per series of the ids it creates; a batch must not cross a series boundary, revert instead). Also sealed, also VRF.
- `fulfillRandomWords(requestId, words)`: for each token `i` of the request in order: `seed = uint64(words[i])`, `slot = urn(series).draw(words[i] >> 64)`, clear `requestId`. Emits `Revealed(id, seed, slot)`. Never reverts on a bad request id; ignores an already fulfilled one.
- `retry(requestId)`: anyone, once `block.number > requestBlock + RETRY_BLOCKS` and the request is still open: issues a new VRF request for the same tokens and forgets the old id (a late answer to the old id is ignored).

### Urn (lazy Fisher-Yates per series)
`struct Urn { uint16 left; mapping(uint16 => uint16) swaps; }` per series, `left` starts at `SERIES_SIZE` on first use. `draw(rand)`: `pick = rand % left`, `slot = at(pick)`, `swaps[pick] = at(left - 1)`, `left--`. `at(k) = swaps[k] == 0 && !set ? k : swaps[k]` (store `swaps[k] + 1` to tell unset from 0). After 10,000 draws every slot 0..9999 came out once.

### Money
- `nav(id) = VAULT.convertToAssets(shares)`. `profit(id) = nav > principal ? nav - principal : 0`. `lifetime(id) = claimed + profit`. `yieldBps(id) = principal == 0 ? 0 : min(100000, lifetime * 10000 / principal)`.
- `claim(id)`: owner or approved. Withdraws `profit`: `feeShares = shares * fee / nav` moved to `treasuryShares` where `fee = profit * FEE_BPS / 10000`; `VAULT.redeem(sharesFor(profit - fee), ownerOf(id), address(this))`; `shares -= both`; `claimed += profit`. Then `_fundFounders(1)`. Reverts when profit is 0.
- `redeem(id)`: owner or approved. `fee` as above; `feeShares` to treasury; `VAULT.redeem(shares - feeShares, ownerOf(id), address(this))`; burn. Emits `Redeemed(id, to, assets, fee)`. When `nav < principal` (the vault lost money) there is no fee and the holder gets `nav`.
- Treasury: `treasuryShares` in the vault. `_fundFounders(max)`: for up to `max` unfunded founder coins in id order (a pointer `nextFounderToFund`): `need = 50e6 - principal`, `have = convertToAssets(treasuryShares)`, `assets = min(need, have)`, `sharesMoved = treasuryShares * assets / have`; move the shares to the coin, `principal += assets`. Public `fundFounders(uint8 max)` for anyone. `withdrawTreasury(to)` onlyOwner: only when no founder coin is left unfunded; redeems all treasury shares to `to`.
- Views: `coinOf(id)` returns the struct plus `nav`, `profit`, `lifetime`, `yieldBps`; `tokenURI(id)` builds `CoinView` and calls the pinned renderer; `urnLeft(series)`, `mastersLeft(series)`, `founderMinted(series)`, `treasuryAssets()`.

### Tests (Foundry)
Mocks: `MockUSDC` (6 decimals), `MockVault` (ERC-4626 over MockUSDC with a `gain(assets)`/`lose(assets)` to move the share price), `MockVRFCoordinator` (records requests, `fulfill(requestId, words)` calls back, can `fail`). Cover: mint pulls exact USDC and splits shares; sealed tokenURI before fulfil; fulfil sets seed and slot; urn gives every slot once over 10,000 draws and exactly 50 masters; two series; batch at a series boundary for founders reverts; `retry` after the window and not before; claim math with fee, treasury shares, founder funding order; redeem after gain, after loss, and burn; `withdrawTreasury` blocked while a founder coin is unfunded; only the coordinator can fulfil; only owner or approved can claim or redeem; renderer pinned per token, `setRenderer` after mint changes nothing for old coins; `lockRenderer` is one way; nothing in the contract can move a holder's shares except to the holder.

## 3. Deploy

`contracts/deploy.sh sepolia|mainnet` in the shape of the sisters: renderer contracts, then the token with the addresses below, writes `~/.config/onenft-one/deploy-<net>.json`. VRF v2.5 on Base (verify against docs.chain.link before deploying): mainnet coordinator `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`, Sepolia coordinator `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE`; key hashes and the subscription id go in `deploy-<net>.json`. USDC on Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; the ERC-4626 vault is chosen at deploy (a Morpho or Spark USDC vault on Base, or a mock on Sepolia).
