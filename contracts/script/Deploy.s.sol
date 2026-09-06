// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {OneCoin} from "../src/OneCoin.sol";

/// Deploys OneCoin against an already deployed renderer.
///
/// Everything it needs comes in as environment variables, which `contracts/deploy.sh` fills
/// from the JSON config at ~/.config/onenft-one/config-<net>.json. Keeping the reads in the
/// shell and out of the script means foundry.toml does not have to grant this script read
/// access to the home directory.
///
/// The renderer is deployed first, by deploy.sh with `forge create`, exactly the way the
/// sister collection deploys FaceRenderer before OneNFT.
contract Deploy is Script {
    function run() external returns (OneCoin token) {
        string memory name_ = vm.envString("ONE_NAME");
        string memory symbol_ = vm.envString("ONE_SYMBOL");
        address author = vm.envAddress("ONE_AUTHOR");
        address usdc = vm.envAddress("ONE_USDC");
        address vault = vm.envAddress("ONE_VAULT");
        address renderer = vm.envAddress("ONE_RENDERER");
        address coordinator = vm.envAddress("ONE_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("ONE_KEY_HASH");
        uint256 subId = vm.envUint("ONE_SUB_ID");
        uint256 vrfFeeWei = vm.envUint("ONE_VRF_FEE_WEI");
        uint32 callbackGas = uint32(vm.envUint("ONE_CALLBACK_GAS"));

        vm.startBroadcast();
        token = new OneCoin(
            name_, symbol_, author, usdc, vault, renderer, coordinator, keyHash, subId, vrfFeeWei, callbackGas
        );
        vm.stopBroadcast();

        console.log("OneCoin", address(token));
    }
}
