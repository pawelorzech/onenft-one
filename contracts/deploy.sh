#!/usr/bin/env bash
# Deploys OneCoin. Usage: contracts/deploy.sh sepolia|mainnet
#
# Reads ~/.config/onenft-one/config-<net>.json for the vault, USDC, VRF coordinator, key hash,
# subscription id and the renderer address. Deployer secret from Keychain (onenft-deployer),
# author address from ~/.config/onenft/author.json. Writes ~/.config/onenft-one/deploy-<net>.json.
#
# The renderer must already be on chain and its address must be in the config. Deploy it first
# with contracts/deploy-renderer.sh, then put the address in the config and run this.
#
# After this script the subscription still has to be told about the new consumer: add the token
# address to VRF subscription ONE_SUB_ID at vrf.chain.link, or nothing will ever reveal.
set -euo pipefail
NET="${1:?sepolia|mainnet}"
case "$NET" in
  sepolia) RPC=https://sepolia.base.org; CHAIN=84532;;
  mainnet) RPC=https://mainnet.base.org; CHAIN=8453;;
  *) echo "sepolia|mainnet"; exit 1;;
esac
cd "$(dirname "$0")"

CONF="$HOME/.config/onenft-one/config-$NET.json"
[ -f "$CONF" ] || { cat >&2 <<EOF
no config at $CONF

Write one first, for example:
{
  "name": "ONE",
  "symbol": "ONE",
  "usdc": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "vault": "0x… the ERC-4626 USDC vault on Base",
  "coordinator": "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
  "keyHash": "0x… the VRF v2.5 lane, from docs.chain.link",
  "subId": "… the VRF v2.5 subscription id, decimal",
  "renderer": "0x… the CoinRenderer already on chain",
  "vrfFeeWei": "50000000000000",
  "callbackGas": "800000"
}
vrfFeeWei is the least ETH a mint must send on to the VRF subscription, in decimal wei.
50000000000000 is 0.00005 ETH, the figure docs/DECISIONS.md records for Base.
callbackGas is the gas the VRF callback is given, between 800000 and 2500000. Chainlink holds
callbackGas times the lane's maximum gas price, plus its premium, against the subscription
before it will answer at all, so a generous limit on an expensive lane leaves coins sealed. Ask
for what a ten coin batch needs and not more. 800000 is the floor and it is the right answer on
both networks; the worst callback measured is 408324.
The mainnet coordinator above and the Sepolia one, 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE,
are what docs/CONTRACTS.md records. Check both against docs.chain.link before you deploy.
EOF
exit 1; }

need() { jq -er ".$1" "$CONF" 2>/dev/null || { echo "config $CONF has no .$1" >&2; exit 1; }; }
export ONE_NAME=$(jq -r '.name // "ONE"' "$CONF")
export ONE_SYMBOL=$(jq -r '.symbol // "ONE"' "$CONF")
export ONE_USDC=$(need usdc)
export ONE_VAULT=$(need vault)
export ONE_COORDINATOR=$(need coordinator)
export ONE_KEY_HASH=$(need keyHash)
export ONE_SUB_ID=$(need subId)
export ONE_RENDERER=$(need renderer)
export ONE_VRF_FEE_WEI=$(need vrfFeeWei)
export ONE_CALLBACK_GAS=$(need callbackGas)
export ONE_AUTHOR=$(jq -r .address "$HOME/.config/onenft/author.json")

PK=$(security find-generic-password -a onenft-deployer -s onenft-deployer -w)
DEPLOYER=$(cast wallet address --private-key "$PK")
BAL=$(cast balance "$DEPLOYER" --rpc-url "$RPC" --ether)

echo "network     $NET (chain $CHAIN)"
echo "deployer    $DEPLOYER  balance $BAL ETH"
echo "author      $ONE_AUTHOR"
echo "USDC        $ONE_USDC"
echo "vault       $ONE_VAULT"
echo "renderer    $ONE_RENDERER"
echo "coordinator $ONE_COORDINATOR"
echo "key hash    $ONE_KEY_HASH"
echo "sub id      $ONE_SUB_ID"
echo "vrf fee     $ONE_VRF_FEE_WEI wei"
echo "callback    $ONE_CALLBACK_GAS gas"

# The vault holds every coin's backing and the renderer is pinned per coin forever, so both
# have to be code and the vault's asset has to be the USDC above. The constructor checks the
# vault too, but failing here costs no gas.
for a in "$ONE_VAULT" "$ONE_RENDERER" "$ONE_USDC" "$ONE_COORDINATOR"; do
  [ "$(cast code "$a" --rpc-url "$RPC")" != "0x" ] || { echo "no code at $a" >&2; exit 1; }
done
ASSET=$(cast call "$ONE_VAULT" "asset()(address)" --rpc-url "$RPC")
[ "$(echo "$ASSET" | tr 'A-Z' 'a-z')" = "$(echo "$ONE_USDC" | tr 'A-Z' 'a-z')" ] \
  || { echo "vault asset is $ASSET, not $ONE_USDC" >&2; exit 1; }
MASTERS=$(cast call "$ONE_RENDERER" "masterCount()(uint256)" --rpc-url "$RPC")
[ "${MASTERS%% *}" = "50" ] || { echo "renderer knows $MASTERS masters, want 50" >&2; exit 1; }

if [ "$NET" = "mainnet" ]; then
  echo
  echo "This puts a contract on Base mainnet that will hold other people's USDC and cannot be"
  echo "upgraded, paused or stopped. Type mainnet to go on."
  read -r ANSWER
  [ "$ANSWER" = "mainnet" ] || { echo "stopped"; exit 1; }
fi

LOG="/tmp/onenft-one-deploy-$NET.log"
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$PK" 2>&1 | tee "$LOG" | grep -E "OneCoin|Error" || true
TOKEN=$(grep -E "^[[:space:]]*OneCoin " "$LOG" | head -1 | awk '{print $2}')
[ -n "$TOKEN" ] || { echo "token deploy failed, see $LOG" >&2; exit 1; }
echo "OneCoin $TOKEN"
unset PK

mkdir -p "$HOME/.config/onenft-one"
jq -n --arg net "$NET" --argjson chain "$CHAIN" --arg token "$TOKEN" --arg ren "$ONE_RENDERER" \
  --arg usdc "$ONE_USDC" --arg vault "$ONE_VAULT" --arg coord "$ONE_COORDINATOR" \
  --arg keyHash "$ONE_KEY_HASH" --arg subId "$ONE_SUB_ID" --arg fee "$ONE_VRF_FEE_WEI" --arg cbg "$ONE_CALLBACK_GAS" \
  --arg author "$ONE_AUTHOR" --arg deployer "$DEPLOYER" --arg at "$(date -u +%FT%TZ)" \
  '{network:$net,chainId:$chain,OneCoin:$token,CoinRenderer:$ren,usdc:$usdc,vault:$vault,
    vrfCoordinator:$coord,keyHash:$keyHash,subId:$subId,vrfFeeWei:$fee,callbackGas:$cbg,author:$author,deployer:$deployer,at:$at}' \
  > "$HOME/.config/onenft-one/deploy-$NET.json"
cat "$HOME/.config/onenft-one/deploy-$NET.json"

echo
echo "Next: add $TOKEN as a consumer of VRF subscription $ONE_SUB_ID at vrf.chain.link,"
echo "and fund that subscription with native ETH. Until then no coin can reveal."
