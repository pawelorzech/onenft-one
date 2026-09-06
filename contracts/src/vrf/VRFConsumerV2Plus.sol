// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The consumer side of Chainlink VRF v2.5: the coordinator calls `rawFulfillRandomWords`,
/// nobody else may. Same shape as chainlink's VRFConsumerBaseV2Plus without its owner logic,
/// so the token stays without an admin over anything but the renderer.
abstract contract VRFConsumerV2Plus {
    address public immutable vrfCoordinator;

    error OnlyCoordinatorCanFulfill(address have, address want);

    constructor(address coordinator) {
        vrfCoordinator = coordinator;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal virtual;

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinatorCanFulfill(msg.sender, vrfCoordinator);
        fulfillRandomWords(requestId, randomWords);
    }
}
