// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VRFV2PlusClient} from "./VRFV2PlusClient.sol";

/// @notice The one function of the VRF v2.5 coordinator the token calls.
interface IVRFCoordinatorV2Plus {
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req) external returns (uint256 requestId);
}
