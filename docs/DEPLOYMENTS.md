# Deployments

Last verified: 2026-09-06 | 2026-09-06

## Base mainnet (chain 8453), 2026-09-06

| Contract | Address |
|---|---|
| OneCoin (ERC-721) | `0xF597D7bD4467A501a7634dD53Be63E1c7261bcdB` |
| CoinRenderer | `0xa5EC64050248350A1116485DF73755B12722A558` |
| MasterRenderer | `0xF5584197FAbBd23C8858C379cC1eb61A7fa589fE` |
| CoinMetadata | `0x2D1b3D8686799973F677745651db69005B4AA0db` |

Backing vault: Spark USDC Vault on Morpho `0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A` (asset USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). Randomness: Chainlink VRF v2.5, coordinator `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`, 2 gwei lane, native payment, callback gas 800,000, minter fee 0.00005 ETH per transaction. Author and owner: `0x6e36Dc3ec2F9D4f3D8e616725fB6Fa184CD9aE20`. Site: https://one.onenft.click.

## Base Sepolia (chain 84532), 2026-09-06

Third and final test token `0x50879A220753D07b3212aFe56138A0F0fD20c9d0` with the same renderer chain (`0x551BE07f7be8Db7879032487BCdd63ad0557D1fe`), a MockUSDC (`0x7413Bc3C6bDcdefE4Ef6ADd04E89a4dEc4bDd829`, open `mint(address,uint256)`) and a MockVault (`0xBBa5032b9d563BD5778BfB9F39b58656DF711649`). Two earlier test tokens (`0xD82D789d…`, `0x4d972e58…`) predate the audit fixes and are retired. Site: https://one-test.onenft.click.
