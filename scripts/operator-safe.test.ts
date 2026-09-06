import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, chmod, stat, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, logAddress, privateFile, writeJson } from "./operator-safe.ts";
const ADDRESS = "0x1234567890123456789012345678901234567890";
const helper = new URL("./operator-safe.sh", import.meta.url).pathname;

test("deployment log parser accepts exactly one address, rejects injected, truncated and ambiguous logs", () => {
  expect(logAddress(`noise\n  OneCoin ${ADDRESS}\n`, "OneCoin")).toBe(ADDRESS);
  expect(logAddress(`Deployed to: ${ADDRESS}\n`, "Deployed to:")).toBe(ADDRESS);
  for (const bad of ["", "0x123", "0x" + "0".repeat(40), `${ADDRESS}'; require('fs').writeFileSync('pwned','yes'); //`, `${ADDRESS}\nOneCoin ${ADDRESS}`, "$(touch pwned)"]) {
    expect(() => logAddress(`OneCoin ${bad}`, "OneCoin")).toThrow();
  }
  expect(() => address(ADDRESS + "\n")).toThrow();
});

test("signer files require private permissions and cannot be symlinks; JSON replacement is private and preserves literal data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "onenft-operator-test-"));
  try {
    const file = join(dir, "file'with-quotes.json");
    const payload = { value: "';process.exit(99);//", address: ADDRESS };
    await writeJson(file, payload);
    expect(await Bun.file(file).json()).toEqual(payload);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await privateFile(file);
    await chmod(file, 0o644);
    await expect(privateFile(file)).rejects.toThrow("mode 0600");
    await chmod(file, 0o600);
    await symlink(file, join(dir, "link"));
    await expect(privateFile(join(dir, "link"))).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("mock deployment uses keystore paths, private logs and exactly one attempt; failed or hostile output cannot succeed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "onenft-operator-mock-"));
  try {
    const bin = join(dir, "bin"); const keys = join(dir, "keys");
    await mkdir(bin); await mkdir(keys);
    await writeFile(join(keys, "onenft-deployer"), "not-a-real-keystore", { mode: 0o600 });
    await writeFile(join(dir, "password"), "FAKE_PASSWORD_NOT_A_SECRET", { mode: 0o600 });
    await writeFile(join(bin, "forge"), '#!/usr/bin/env bash\nprintf "%s\\n" "$@" >> "$MOCK_ARGS"\nprintf "attempt\\n" >> "$MOCK_ATTEMPTS"\nprintf "%s\\n" "$MOCK_OUTPUT"\nexit "$MOCK_EXIT"\n', { mode: 0o700 });
    const run = (output: string, code: number) => Bun.spawnSync(["bash", "-c", 'set -euo pipefail; source "$1"; operator_signer deployer; RPC=https://invalid.example; operator_create src/Example.sol:Example', "test", helper], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir, ONENFT_KEYSTORE_DIR: keys, ONENFT_SIGNER_ACCOUNT: "onenft-deployer", ONENFT_PASSWORD_FILE: join(dir, "password"), MOCK_ARGS: join(dir, "args"), MOCK_ATTEMPTS: join(dir, "attempts"), MOCK_OUTPUT: output, MOCK_EXIT: String(code) },
    });
    const good = run(`Deployed to: ${ADDRESS}`, 0);
    expect(good.exitCode).toBe(0);
    expect(good.stdout.toString().trim()).toBe(ADDRESS);
    const argv = await Bun.file(join(dir, "args")).text();
    expect(argv).toContain("--keystore\n"); expect(argv).toContain("--password-file\n");
    expect(argv).not.toContain("--private-key"); expect(argv).not.toContain("FAKE_PASSWORD"); expect(argv).not.toContain("not-a-real-keystore");
    const logDir = good.stderr.toString().match(/Private operator logs: (.+)/)![1]!;
    expect((await stat(logDir)).mode & 0o777).toBe(0o700);
    const files = Array.from(new Bun.Glob("create.*").scanSync(logDir));
    expect(files.length).toBe(1); expect((await stat(join(logDir, files[0]!))).mode & 0o777).toBe(0o600);
    expect(run(`Deployed to: ${ADDRESS}; touch pwned`, 0).exitCode).not.toBe(0);
    const failure = run(`Deployed to: ${ADDRESS}`, 1);
    expect(failure.exitCode).not.toBe(0);
    expect(failure.stderr.toString()).toContain("Check the wallet nonce");
    expect((await Bun.file(join(dir, "attempts")).text()).trim().split("\n").length).toBe(3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("every broadcast entrypoint uses the shared signer and never interpolates log data into code", async () => {
  const dir = new URL("../contracts/", import.meta.url).pathname;
  for (const file of new Bun.Glob("*.sh").scanSync(dir)) {
    const source = await Bun.file(join(dir, file)).text();
    expect(source).not.toContain("--private-key");
    expect(source).not.toContain("python3 -c");
    if (/--broadcast|cast send/.test(source)) {
      expect(source).toContain("scripts/operator-safe.sh");
      expect(source).toContain("operator_signer");
      expect(source).not.toContain("|| true");
    }
  }
});
