// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICoinRenderer, CoinView} from "../../src/ICoinRenderer.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice A renderer that draws nothing and echoes everything. Every output is built from
/// `encode`, so a test can build the CoinView it expects, call `encode` on it, and compare.
/// That way the test checks what the token passes, not what a real renderer draws.
contract MockRenderer is ICoinRenderer {
    using Strings for uint256;

    /// @notice Every field of a CoinView as one line, in the order the struct declares them.
    function encode(CoinView calldata c) public pure returns (string memory) {
        return string.concat(
            "seed=",
            uint256(c.seed).toString(),
            ",number=",
            uint256(c.number).toString(),
            ",series=",
            uint256(c.series).toString(),
            ",backing=",
            uint256(c.backing).toString(),
            ",yieldBps=",
            uint256(c.yieldBps).toString(),
            ",master=",
            uint256(c.master).toString(),
            ",founder=",
            c.founder ? "1" : "0",
            ",sealed=",
            c.sealed_ ? "1" : "0",
            ",funded=",
            c.fundedUnits.toString(),
            ",lifetime=",
            c.lifetimeUnits.toString()
        );
    }

    function tokenURI(CoinView calldata c) external pure virtual returns (string memory) {
        return string.concat("uri:", encode(c));
    }

    function json(CoinView calldata c) external pure returns (string memory) {
        return string.concat("json:", encode(c));
    }

    function svg(CoinView calldata c) external pure returns (string memory) {
        return string.concat("svg:", encode(c));
    }

    function grid(CoinView calldata c) external pure returns (bytes memory) {
        return abi.encodePacked(c.seed, c.number, c.series, c.backing, c.master, c.sealed_);
    }

    function masterCount() external pure virtual returns (uint256) {
        return 50;
    }

    function masterName(uint8 i) external pure returns (string memory) {
        return string.concat("Master ", uint256(i).toString());
    }
}

/// @notice A second renderer, distinguishable from the first, for the pinning tests.
contract MockRendererV2 is MockRenderer {
    function tokenURI(CoinView calldata c) external pure override returns (string memory) {
        return string.concat("uri2:", encode(c));
    }
}

/// @notice A renderer that does not know fifty masters, so the token must refuse it.
contract BadMockRenderer is MockRenderer {
    function masterCount() external pure override returns (uint256) {
        return 49;
    }
}
