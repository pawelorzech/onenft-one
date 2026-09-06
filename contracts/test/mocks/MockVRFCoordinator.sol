// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVRFCoordinatorV2Plus} from "../../src/vrf/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "../../src/vrf/VRFV2PlusClient.sol";
import {VRFConsumerV2Plus} from "../../src/vrf/VRFConsumerV2Plus.sol";

/// @notice A VRF v2.5 coordinator for tests. It records every request and answers only when
/// the test tells it to, so a test can leave a request open, answer it twice, or answer one
/// that `retry` has already replaced.
contract MockVRFCoordinator is IVRFCoordinatorV2Plus {
    struct Recorded {
        address consumer;
        bytes32 keyHash;
        uint256 subId;
        uint16 confirmations;
        uint32 callbackGas;
        uint32 numWords;
        bytes extraArgs;
        bool fulfilled;
    }

    uint256 public lastRequestId;
    /// @notice Native ETH the token has forwarded to each subscription.
    mapping(uint256 subId => uint256 wei_) public nativeFunded;
    uint256 public totalNativeFunded;
    /// @notice Set true to make every new request revert, the way a broken subscription would.
    bool public fail;
    mapping(uint256 requestId => Recorded) public requests;
    uint256[] public requestIds;

    error CoordinatorDown();

    function setFail(bool v) external {
        fail = v;
    }

    function fundSubscriptionWithNative(uint256 subId) external payable override {
        nativeFunded[subId] += msg.value;
        totalNativeFunded += msg.value;
    }

    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req)
        external
        override
        returns (uint256 requestId)
    {
        if (fail) revert CoordinatorDown();
        requestId = ++lastRequestId;
        requests[requestId] = Recorded({
            consumer: msg.sender,
            keyHash: req.keyHash,
            subId: req.subId,
            confirmations: req.requestConfirmations,
            callbackGas: req.callbackGasLimit,
            numWords: req.numWords,
            extraArgs: req.extraArgs,
            fulfilled: false
        });
        requestIds.push(requestId);
    }

    function requestCount() external view returns (uint256) {
        return requestIds.length;
    }

    function numWordsOf(uint256 requestId) external view returns (uint32) {
        return requests[requestId].numWords;
    }

    function consumerOf(uint256 requestId) external view returns (address) {
        return requests[requestId].consumer;
    }

    function callbackGasOf(uint256 requestId) external view returns (uint32) {
        return requests[requestId].callbackGas;
    }

    /// @notice Answer a request with words the test chose.
    function fulfill(uint256 requestId, uint256[] memory words) public {
        Recorded storage r = requests[requestId];
        r.fulfilled = true;
        VRFConsumerV2Plus(r.consumer).rawFulfillRandomWords(requestId, words);
    }

    /// @notice Answer a request with `numWords` words derived from `entropy`, so a test that
    /// does not care about the exact values does not have to build the array.
    function fulfillWithSeed(uint256 requestId, uint256 entropy) external {
        uint32 n = requests[requestId].numWords;
        uint256[] memory words = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(entropy, requestId, i)));
        }
        fulfill(requestId, words);
    }

    /// @notice Answer with fewer words than the request asked for.
    function fulfillShort(uint256 requestId, uint256 count, uint256 entropy) external {
        uint256[] memory words = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(entropy, requestId, i)));
        }
        fulfill(requestId, words);
    }
}
