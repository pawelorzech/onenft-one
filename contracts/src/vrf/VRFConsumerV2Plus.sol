// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The consumer side of Chainlink VRF v2.5: the coordinator calls `rawFulfillRandomWords`,
/// nobody else may. Same shape as chainlink's VRFConsumerBaseV2Plus without its owner logic,
/// so the token stays without an admin over anything but the renderer.
abstract contract VRFConsumerV2Plus {
    /// @notice The coordinator this consumer answers to. Not immutable, because Chainlink's
    /// migration path retires a coordinator and moves its subscriptions to a new one. Only the
    /// current coordinator can hand the consumer over, so nobody else can point it anywhere.
    address public vrfCoordinator;

    event CoordinatorSet(address indexed vrfCoordinator);

    error OnlyCoordinatorCanFulfill(address have, address want);
    error OnlyCoordinatorCanSet(address have, address want);
    error ZeroCoordinator();

    constructor(address coordinator) {
        if (coordinator == address(0)) revert ZeroCoordinator();
        vrfCoordinator = coordinator;
        emit CoordinatorSet(coordinator);
    }

    /// @notice Hand this consumer to a new coordinator. Chainlink's migration calls it on the
    /// old coordinator's behalf. Without it a coordinator retirement would leave every sealed
    /// coin sealed for good.
    /// @dev The current coordinator and nobody else. Chainlink's own base also lets the owner
    /// call this; here that would hand the owner every master slot, because whoever names the
    /// coordinator names the address that gets to answer with random words of its choosing.
    /// A subscription the coordinator cannot migrate is the smaller problem, and SEALED_ESCAPE
    /// already answers it.
    function setCoordinator(address coordinator) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinatorCanSet(msg.sender, vrfCoordinator);
        if (coordinator == address(0)) revert ZeroCoordinator();
        vrfCoordinator = coordinator;
        emit CoordinatorSet(coordinator);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal virtual;

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinatorCanFulfill(msg.sender, vrfCoordinator);
        fulfillRandomWords(requestId, randomWords);
    }
}
