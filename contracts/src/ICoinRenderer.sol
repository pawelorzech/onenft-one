// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct CoinView {
    uint64 seed;          // 0 while sealed
    uint16 number;        // 1..25000 inside the series
    uint16 series;        // 1..
    uint8 backing;        // 5, 10, 25 or 50
    uint32 yieldBps;      // lifetime yield over backing, basis points, capped at 100000
    uint8 master;         // 0..49, or 255 for none
    bool founder;
    bool sealed_;         // `sealed` is reserved in Solidity; name the field sealed_
    uint256 fundedUnits;  // USDC units (6 decimals) of backing paid or funded so far
    uint256 lifetimeUnits;// USDC units of gross yield the coin earned so far
}

interface ICoinRenderer {
    function tokenURI(CoinView calldata c) external view returns (string memory);
    function json(CoinView calldata c) external view returns (string memory);
    function svg(CoinView calldata c) external view returns (string memory);
    function grid(CoinView calldata c) external view returns (bytes memory);
    function masterCount() external view returns (uint256);
    function masterName(uint8 i) external view returns (string memory);
}
