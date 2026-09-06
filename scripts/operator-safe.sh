#!/usr/bin/env bash
# Source only. No key material is fetched or placed in process arguments.
set +x
umask 077
OPERATOR_TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/operator-safe.ts"
operator_address() { bun "$OPERATOR_TOOL" address "$1"; }
operator_json_address() { bun "$OPERATOR_TOOL" json-address "$1" "$2"; }
operator_log_address() { bun "$OPERATOR_TOOL" log-address "$1" "$2"; }
operator_write_json() { bun "$OPERATOR_TOOL" write-json "$1"; }
operator_signer() {
  local account="${ONENFT_SIGNER_ACCOUNT:-onenft-${1:-deployer}}"
  [[ "$account" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$ ]] || { echo 'Invalid keystore account name' >&2; return 1; }
  local keystore="${ONENFT_KEYSTORE_DIR:-$HOME/.foundry/keystores}/$account"
  bun "$OPERATOR_TOOL" private-file "$keystore" || { echo "Create an encrypted keystore with: cast wallet import $account --interactive" >&2; return 1; }
  SIGNER_ARGS=(--keystore "$keystore")
  if [ -n "${ONENFT_PASSWORD_FILE:-}" ]; then
    bun "$OPERATOR_TOOL" private-file "$ONENFT_PASSWORD_FILE" || return 1
    SIGNER_ARGS+=(--password-file "$ONENFT_PASSWORD_FILE")
  fi
  OPERATOR_TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/onenft-operator.XXXXXXXX")
  echo "Private operator logs: $OPERATOR_TMP_DIR" >&2
}
operator_create() {
  local log
  log=$(mktemp "$OPERATOR_TMP_DIR/create.XXXXXXXX")
  # A timeout may follow a broadcast. Never retry automatically without reconciling the nonce/receipt.
  if ! forge create "$@" --rpc-url "$RPC" "${SIGNER_ARGS[@]}" --broadcast > "$log" 2>&1; then
    echo "Deployment not confirmed. Check the wallet nonce and transaction receipt before trying again. Log: $log" >&2
    return 1
  fi
  operator_log_address "$log" 'Deployed to:'
}
