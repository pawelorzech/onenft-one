# Operator scripts: signing and deployment records

The application deployment and keeper environment do not change. No existing keystore or production secret was migrated by this repair. These scripts remain manual tools; running their broadcast or renderer-switch commands requires separate authorization for that on-chain action. They must not be used as part of the current site-only release.

## Signer setup

Deploy scripts now use an encrypted Foundry keystore named `onenft-deployer`. Knot's `set-renderer.sh` uses `onenft-author`. They no longer fetch a raw key from macOS Keychain/1Password or put a key in the process argument list. Existing operators must create the appropriate encrypted keystore before the next authorized manual use, using the hidden prompts:

`cast wallet import onenft-deployer --interactive`

Use the corresponding author account name for the author wallet. Do not supply the key with a command-line flag. This documentation does not authorize creating, moving or exposing production credentials.

Optional configuration:

- `ONENFT_SIGNER_ACCOUNT`: override the account filename; letters, digits, dots, underscores and hyphens only.
- `ONENFT_KEYSTORE_DIR`: override the default `~/.foundry/keystores` directory.
- `ONENFT_PASSWORD_FILE`: password file path for a noninteractive authorized run; otherwise Foundry prompts. Neither key nor password contents become command-line arguments.

Keystore and password files must be regular files owned by the current user with permissions 0600 or stricter. Symlinks and group/world access are rejected. Password files remain the operator's responsibility; the scripts do not create or copy them. Keystore contents are validated by Foundry when signing.

## Logs and records

Each signing session uses a private, unique temporary directory (0700) and log files (0600). Its path is printed for investigation; logs are retained after exit and can be removed by the operator after reconciliation. Read-only renderer checks use private temporary files and clean them up when they finish.

A deployment address must be one complete, nonzero 20-byte hex address. A missing, malformed or repeated log entry fails. Log values and file paths are passed as data, never interpolated into executable Python/JavaScript. Deployment JSON is written through a private, exclusive temporary file and atomically replaced after serialization.

A failed `forge create` is not automatically retried: a timeout can happen after broadcasting. Inspect the transaction receipt and wallet nonce before another attempt. A failing `forge script` now stops the shell instead of saving addresses from a failed run. Existing transaction state under Foundry's broadcast directory must also be reconciled before a manual retry.

## Validation

`bun test scripts/operator-safe.test.ts` exercises hostile and duplicate logs, file permissions, symlinks, literal JSON data and a fake Forge executable. The fake deployment verifies that argv contains keystore/password paths, no secret contents, and exactly one attempt per call. No actual keys, signing, network requests or transactions are used by these tests. Shell syntax is also checked with `bash -n`.
