import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const manifest = await Bun.file(new URL("shared-code.json", root)).json() as Record<string, string>;
for (const [file, expected] of Object.entries(manifest)) {
  const bytes = await Bun.file(new URL(file, root)).arrayBuffer();
  if (createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !== expected) {
    throw new Error(file + " differs from shared-code.json; port the change and its tests to all five collections, then update their manifests together");
  }
}
console.log("Shared code matches the reviewed manifest");
