import { lstat, readFile, rename, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
export function address(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) throw new Error("Expected a nonzero 20-byte address");
  return value;
}
export function logAddress(text: string, label: string): string {
  if (!/^[A-Za-z][A-Za-z0-9 ]*:?$/.test(label)) throw new Error("Invalid log label");
  const candidates = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith(label + " ")).map(line => line.slice(label.length).trim());
  if (candidates.length !== 1) throw new Error("Expected exactly one deployment address for " + label);
  return address(candidates[0]);
}
export function deploymentAddresses(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("Invalid deployment record");
  for (const [key, item] of Object.entries(value)) {
    if (["OneNFT", "OneCoin", "KnotRenderer", "KnotRenderer_v4", "BlitRenderer", "RunnerRenderer", "FaceRenderer", "CoinRenderer", "originalsA", "originalsB", "siblings", "meta", "author", "deployer"].includes(key)) address(item);
    if (key === "stores") { if (!Array.isArray(item)) throw new Error("Invalid stores"); for (const store of item) address(store); }
  }
}
export async function privateFile(file: string): Promise<void> {
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || (process.getuid && st.uid !== process.getuid())) throw new Error("Signer files must be owned by the current user, regular, and mode 0600 or stricter");
}
export async function writeJson(file: string, value: unknown): Promise<void> {
  const temporary = join(dirname(file), ".operator-" + randomUUID() + ".tmp");
  const stream = await open(temporary, "wx", 0o600);
  try { await stream.writeFile(JSON.stringify(value, null, 2) + "\n"); await stream.sync(); } finally { await stream.close(); }
  await rename(temporary, file);
}
if (import.meta.main) {
  const [command, file, key, value] = process.argv.slice(2);
  try {
    if (command === "address") console.log(address(file));
    else if (command === "json-address") console.log(address(JSON.parse(await readFile(file!, "utf8"))[key!]));
    else if (command === "log-address") console.log(logAddress(file === "-" ? await Bun.stdin.text() : await readFile(file!, "utf8"), key!));
    else if (command === "deployment-addresses") deploymentAddresses(JSON.parse(await readFile(file!, "utf8")));
    else if (command === "private-file") await privateFile(file!);
    else if (command === "set-address") { const json = JSON.parse(await readFile(file!, "utf8")); json[key!] = address(value); await writeJson(file!, json); }
    else if (command === "write-json") await writeJson(file!, JSON.parse(await Bun.stdin.text()));
    else throw new Error("Unknown operator command");
  } catch (error) { console.error(error instanceof Error ? error.message : "Operator validation failed"); process.exit(1); }
}
