# Decisions

Last verified: 2026-09-06 | 2026-09-06

Decisions by Paweł, dated. Later entries win.

- 2026-09-06 **ONE is the fifth collection of onenft.click**: 10,000 coins per series, series without end, 50 Master Coins (1/1) per series, each other coin procedural. Art and money are two independent axes: a Master Coin can carry 10, 25 or 50 USDC and a plain coin can carry 50.
- 2026-09-06 **Model A**: each coin holds shares of an ERC-4626 USDC vault on Base. Burn returns backing plus earned yield minus a 10 percent fee on the yield. The contract has no admin over the pool: no pause on redeem, no upgrade, no key to the funds. Paweł chose to proceed knowing the MiCA and tax questions; there was no lawyer.
- 2026-09-06 **Price equals backing**: 10, 25 or 50 USDC, nothing on top. The author's revenue is the 10 percent of yield and the founder coins.
- 2026-09-06 **Randomness is Chainlink VRF v2.5** on Base. The art slot comes from a lazy Fisher-Yates over the series' 10,000 slots, so exactly 50 masters per series and nobody, the author included, can steer them.
- 2026-09-06 **Founder coins**: 50 reserved slots per series. The author mints them one at a time, paying the backing from the author wallet or from the fees the contract has collected. Their art comes from the same urn. Trait `Origin: Founder`.
- 2026-09-06 **Yield ring**: the dynamic layer reads lifetime yield over backing (basis points). Claims do not reset it; transfers do not reset it. Levels at 0.01, 1, 2.5, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300 and 500 percent.
- 2026-09-06 **Renderer rules**: integers only, no trigonometry, symmetry through `rotate()`; the seed's top 32 bits are engraved as hex, the low 32 bits as ticks on the rim. Backing class is a small number on the rim, never a material.
- 2026-09-06 **Pixel art, like every other collection of onenft.click** (Paweł, after seeing a vector draft). 64 by 64 grid, coin radius 23, one path per colour in the SVG (about 12 KB a coin). The vector renderer was thrown away the same day.
- 2026-09-06 **Master Coins are 25 compositions in two palettes each**, not fourteen in three or four: Paweł asked for more variety between recipes. Names kept from the first list where they fit.
- 2026-09-06 **Site before contracts.** The site runs in preview mode from a simulated series (`src/preview.ts`, same urn as the contract will use) until the contract exists; every page says so.
