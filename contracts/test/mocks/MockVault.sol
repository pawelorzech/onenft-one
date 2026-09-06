// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice An ERC-4626 vault over MockUSDC whose share price the test moves by hand.
/// `gain` mints underlying into the vault without minting shares, so every share is worth
/// more; `lose` burns underlying out of it, so every share is worth less.
contract MockVault is ERC4626 {
    constructor(MockUSDC asset_) ERC20("Vault USDC", "vUSDC") ERC4626(IERC20(address(asset_))) {}

    /// @notice Raise the share price by `assets` USDC of profit.
    function gain(uint256 assets) external {
        MockUSDC(asset()).mint(address(this), assets);
    }

    /// @notice Lower the share price by `assets` USDC of loss.
    function lose(uint256 assets) external {
        MockUSDC(asset()).burn(address(this), assets);
    }

    /// @notice When true a deposit takes the USDC and mints no shares at all, the way a vault
    /// whose share price has run past the deposit's granularity would.
    bool public swallow;

    function setSwallow(bool v) external {
        swallow = v;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (!swallow) return super.deposit(assets, receiver);
        SafeERC20.safeTransferFrom(IERC20(asset()), msg.sender, address(this), assets);
        return 0;
    }
}
