#!/usr/bin/env bash
# Deploys the renderer chain. Usage: contracts/deploy-renderer.sh sepolia|mainnet
#
# Three contracts, in this order: MasterRenderer and CoinMetadata take no arguments,
# CoinRenderer takes both of their addresses. Pixels is a library of internal functions only,
# so it inlines and needs no --libraries flag.
#
# Prints the CoinRenderer address and writes it into ~/.config/onenft-one/config-<net>.json
# under .renderer, which is where contracts/deploy.sh reads it from. Deploying a renderer is
# safe on its own: nothing points at it until deploy.sh or setRenderer says so.
set -euo pipefail
source "$(dirname "$0")/../scripts/operator-safe.sh"
NET="${1:?sepolia|mainnet}"
case "$NET" in
  sepolia) RPC=https://sepolia.base.org;;
  mainnet) RPC=https://mainnet.base.org;;
  *) echo "sepolia|mainnet"; exit 1;;
esac
cd "$(dirname "$0")"

operator_signer deployer
DEPLOYER=$(operator_address "$(cast wallet address "${SIGNER_ARGS[@]}")")
echo "network $NET  deployer $DEPLOYER  balance $(cast balance "$DEPLOYER" --rpc-url "$RPC" --ether) ETH"

LOG="$OPERATOR_TMP_DIR/onenft-one-renderer-$NET.log"
: > "$LOG"

create() { operator_create "$@"; }

MASTER=$(create src/MasterRenderer.sol:MasterRenderer)
echo "MasterRenderer $MASTER"
META=$(create src/CoinMetadata.sol:CoinMetadata)
echo "CoinMetadata   $META"
# The renderer's constructor reads nothing, but the RPC can lag behind its own receipts.
for a in "$MASTER" "$META"; do
  for i in $(seq 1 30); do [ "$(cast code "$a" --rpc-url "$RPC")" != "0x" ] && break; sleep 2; done
done
REN=$(create src/CoinRenderer.sol:CoinRenderer --constructor-args "$MASTER" "$META")
echo "CoinRenderer   $REN"

MASTERS=$(cast call "$REN" "masterCount()(uint256)" --rpc-url "$RPC")
[ "${MASTERS%% *}" = "50" ] || { echo "renderer says $MASTERS masters, want 50" >&2; exit 1; }

mkdir -p "$HOME/.config/onenft-one"
CONF="$HOME/.config/onenft-one/config-$NET.json"
[ -f "$CONF" ] || echo '{}' > "$CONF"
jq --arg r "$REN" --arg m "$MASTER" --arg meta "$META" \
  '.renderer=$r | .masterRenderer=$m | .coinMetadata=$meta' "$CONF" | operator_write_json "$CONF"
echo
echo "wrote .renderer into $CONF"
echo "next: contracts/deploy.sh $NET"
