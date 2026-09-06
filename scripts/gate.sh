#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun install --frozen-lockfile
bun run scripts/check-shared.ts
(cd contracts && forge build)
bun run typecheck
bun test
bun test ./scripts/operator-safe.test.ts
for operator_script in contracts/*.sh scripts/operator-safe.sh; do bash -n "$operator_script"; done
bun run contracts/fixtures.ts
git diff --exit-code -- contracts/test/fixtures
(cd contracts && forge test -vv)
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
bun build src/server.ts --target=bun --outdir="$build_dir"
bun audit
git diff --check
