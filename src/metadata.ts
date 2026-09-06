/**
 * The token metadata, byte for byte what `tokenURI` returns before base64.
 * Source of truth for the Solidity `CoinRenderer.metadata`. Keep the key
 * order, the spacing and the number formats exactly as here.
 */
import { renderCoin, fingerprint, roman, type CoinInput, type Coin } from "./coin.ts";

export const SITE_URL = "https://one.onenft.click";

const KEYS = ["material", "ground", "rim", "field", "symmetry", "core", "glyph", "surface", "halo", "accent", "anomaly"] as const;
const LABELS = ["Material", "Ground", "Rim", "Field", "Symmetry", "Core", "Glyph", "Surface", "Halo", "Accent", "Anomaly"] as const;

export type MetaInput = CoinInput & {
  /** Backing funded so far, in USDC units (6 decimals). Equals backing * 1e6 for a public coin. */
  fundedUnits: bigint;
  /** Lifetime yield earned, in USDC units. */
  lifetimeUnits: bigint;
};

/** Pads to five digits, as on the coin. */
export const pad5 = (n: number) => String(n).padStart(5, "0");

/** JSON string escape for the few characters a name or a trait can carry. */
function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** USDC units as a decimal string with six places, no float: 27180000n gives "27.180000". */
export function units(u: bigint): string {
  const whole = u / 1000000n, frac = (u % 1000000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

export function attributes(coin: Coin, input: MetaInput): { trait_type: string; value: string | number; display_type?: string }[] {
  const out: { trait_type: string; value: string | number; display_type?: string }[] = [];
  if (input.sealed) out.push({ trait_type: "Sealed", value: "Waiting for the seed" });
  else if (coin.masterName) out.push({ trait_type: "Master Coin", value: coin.masterName });
  if (!input.sealed) KEYS.forEach((k, i) => {
    if (coin.masterName && k !== "material") return;
    out.push({ trait_type: LABELS[i], value: String(coin.traits[k]) });
  });
  out.push({ trait_type: "Series", value: roman(input.series) });
  out.push({ trait_type: "Backing", value: `${input.backing} USDC` });
  out.push({ trait_type: "Origin", value: input.founder ? "Founder" : "Public" });
  out.push({ trait_type: "Yield level", value: coin.yieldLevel, display_type: "number" });
  if (!input.sealed) out.push({ trait_type: "Fingerprint", value: fingerprint(input.seed) });
  return out;
}

/** The JSON of a token, minified, keys in this order. */
export function metadataOf(input: MetaInput, coin: Coin = renderCoin(input)): { json: string; coin: Coin } {
  const name = coin.masterName ? `ONE #${pad5(input.number)} ${coin.masterName}` : `ONE #${pad5(input.number)}`;
  const desc = `Coin ${pad5(input.number)} of series ${roman(input.series)}. Backing ${input.backing} USDC, funded ${units(input.fundedUnits)} USDC, lifetime yield ${units(input.lifetimeUnits)} USDC. ${input.sealed ? "Sealed: the seed from Chainlink VRF has not arrived yet." : `Drawn on chain from seed ${fingerprint(input.seed)}.`} Burn to redeem. ${SITE_URL}/coin/${input.number}`;
  const attrs = attributes(coin, input).map((a) => `{"trait_type":${q(a.trait_type)},${a.display_type ? `"display_type":${q(a.display_type)},` : ""}"value":${typeof a.value === "number" ? a.value : q(a.value)}}`);
  const image = `data:image/svg+xml;base64,${Buffer.from(coin.svg, "utf8").toString("base64")}`;
  const json = `{"name":${q(name)},"description":${q(desc)},"image":${q(image)},"external_url":${q(`${SITE_URL}/coin/${input.number}`)},"attributes":[${attrs.join(",")}]}`;
  return { json, coin };
}
