// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFV2PlusClient} from "./VRFV2PlusClient.sol";

/// @notice The two functions of the VRF v2.5 coordinator the token calls.
interface IVRFCoordinatorV2Plus {
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req) external returns (uint256 requestId);

    /// @notice Tops the subscription up with native ETH. The token forwards the minter's fee
    /// here in the same transaction as the request, so the randomness pays for itself.
    function fundSubscriptionWithNative(uint256 subId) external payable;
}
