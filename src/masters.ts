/**
 * The fifty Master Coins. Each is a recipe: a mode (one composition
 * algorithm), a palette and two integer settings. A mode is shared by three
 * or four recipes; the palette and the settings make each one its own coin.
 * Everything here is integer and rotate-only, like coin.ts.
 */
import type { CoinInput, Design } from "./coin.ts";
import { yieldOrbits } from "./coin.ts";

export type MasterMode =
  | "void" | "eclipse" | "singularity" | "mobius" | "prism" | "supernova"
  | "blacksun" | "mirror" | "zero" | "fracture" | "genesis" | "infinite"
  | "lattice" | "spiral";

export type Master = {
  name: string;
  mode: MasterMode;
  material: string;
  bg: string;
  body: string;
  light: string;
  dark: string;
  ink: string;
  accent: string;
  a: number;
  b: number;
};

const M = (name: string, mode: MasterMode, material: string, bg: string, body: string, light: string, dark: string, ink: string, accent: string, a: number, b: number): Master =>
  ({ name, mode, material, bg, body, light, dark, ink, accent, a, b });

export const MASTERS: readonly Master[] = [
  M("Genesis",      "genesis",     "Gold",      "#0d0d10", "#d0a640", "#f5dc8a", "#6e5316", "#4a370c", "#ffffff", 12, 3),
  M("The Void",     "void",        "Obsidian",  "#0d0d10", "#131216", "#3a3742", "#050507", "#8a8494", "#ffffff", 1, 0),
  M("Eclipse",      "eclipse",     "Gold",      "#0d0d10", "#f0c860", "#fff0b0", "#6e5316", "#2a2010", "#ffffff", 70, 0),
  M("Singularity",  "singularity", "Iron",      "#0d0d10", "#6f7276", "#c8cbcf", "#2f3134", "#1c1d1f", "#ffffff", 9, 0),
  M("Möbius",       "mobius",      "Silver",    "#0d0d10", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#2f7fd6", 6, 0),
  M("Prism",        "prism",       "Ivory",     "#ece8df", "#f6f2e8", "#ffffff", "#9a8b6a", "#5b5040", "#c8323c", 6, 0),
  M("Supernova",    "supernova",   "Amber",     "#0d0d10", "#d98a2b", "#f7c67a", "#6e4210", "#4a2c0a", "#ffffff", 48, 0),
  M("Black Sun",    "blacksun",    "Obsidian",  "#ece8df", "#1e1c22", "#4e4a56", "#0a090c", "#8a8494", "#f0b429", 24, 0),
  M("The Mirror",   "mirror",      "Silver",    "#0d0d10", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#ffffff", 0, 0),
  M("Zero",         "zero",        "Ivory",     "#0d0d10", "#e9e0cc", "#fbf7ee", "#9a8b6a", "#5b5040", "#c8323c", 0, 0),
  M("Infinite",     "infinite",    "Cobalt",    "#0d0d10", "#3956a3", "#8ea4dd", "#1c2b58", "#101a38", "#ffffff", 3, 0),
  M("Fracture",     "fracture",    "Jade",      "#0d0d10", "#5f9d7c", "#a8d6bd", "#2d5240", "#1a3328", "#ffffff", 5, 0),
  M("Lattice",      "lattice",     "Copper",    "#0d0d10", "#b8734a", "#e8b58e", "#5f3620", "#3b2114", "#ffffff", 12, 0),
  M("Spiral",       "spiral",      "Verdigris", "#0d0d10", "#4f8f8b", "#9dcfca", "#25504d", "#153331", "#ffffff", 14, 0),
  M("Aurora",       "prism",       "Cobalt",    "#0d0d10", "#1c2b58", "#8ea4dd", "#101a38", "#c4d2f4", "#4fd1a0", 8, 1),
  M("Umbra",        "eclipse",     "Iron",      "#0d0d10", "#a6a9ad", "#e0e2e4", "#2f3134", "#1c1d1f", "#c8323c", 120, 1),
  M("Nadir",        "void",        "Cobalt",    "#0d0d10", "#0e1630", "#3956a3", "#070b18", "#8ea4dd", "#ffffff", 3, 1),
  M("Zenith",       "supernova",   "Gold",      "#ece8df", "#d0a640", "#f5dc8a", "#6e5316", "#4a370c", "#ffffff", 36, 1),
  M("Halcyon",      "mobius",      "Rose",      "#ece8df", "#d69aa8", "#f3d2d9", "#7a4552", "#4d2a33", "#2f7fd6", 8, 1),
  M("Meridian",     "mirror",      "Copper",    "#0d0d10", "#b8734a", "#e8b58e", "#5f3620", "#3b2114", "#ffffff", 1, 0),
  M("Corona",       "blacksun",    "Gold",      "#0d0d10", "#d0a640", "#f5dc8a", "#6e5316", "#4a370c", "#ffffff", 36, 1),
  M("Penumbra",     "eclipse",     "Obsidian",  "#ece8df", "#3a3742", "#8a8494", "#0a090c", "#050507", "#f0b429", 160, 0),
  M("Antimatter",   "mirror",      "Obsidian",  "#ece8df", "#1e1c22", "#4e4a56", "#0a090c", "#8a8494", "#ffffff", 2, 0),
  M("Quasar",       "supernova",   "Cobalt",    "#0d0d10", "#3956a3", "#8ea4dd", "#1c2b58", "#101a38", "#ffffff", 60, 0),
  M("Pulsar",       "singularity", "Silver",    "#0d0d10", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#c8323c", 7, 1),
  M("Tessellation", "lattice",     "Ivory",     "#0d0d10", "#e9e0cc", "#fbf7ee", "#9a8b6a", "#5b5040", "#ffffff", 8, 1),
  M("Monolith",     "zero",        "Obsidian",  "#ece8df", "#1e1c22", "#4e4a56", "#0a090c", "#8a8494", "#ffffff", 1, 0),
  M("Oracle",       "infinite",    "Ivory",     "#0d0d10", "#e9e0cc", "#fbf7ee", "#9a8b6a", "#5b5040", "#8a5cd6", 4, 1),
  M("Relic",        "fracture",    "Bronze",    "#ece8df", "#9a7a48", "#d6b986", "#4d3a1e", "#2f2412", "#ffffff", 7, 1),
  M("Ember",        "spiral",      "Copper",    "#0d0d10", "#b8734a", "#e8b58e", "#5f3620", "#3b2114", "#f0b429", 10, 1),
  M("Glacier",      "prism",       "Silver",    "#ece8df", "#eef0f3", "#ffffff", "#5f6670", "#3a3f47", "#2f7fd6", 12, 0),
  M("Tide",         "mobius",      "Verdigris", "#0d0d10", "#4f8f8b", "#9dcfca", "#25504d", "#153331", "#ffffff", 5, 0),
  M("Vertex",       "lattice",     "Iron",      "#ece8df", "#6f7276", "#a6a9ad", "#2f3134", "#1c1d1f", "#c8323c", 6, 0),
  M("Cipher",       "singularity", "Obsidian",  "#0d0d10", "#1e1c22", "#4e4a56", "#0a090c", "#8a8494", "#4fd1a0", 12, 0),
  M("Aether",       "infinite",    "Silver",    "#ece8df", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#8a5cd6", 6, 0),
  M("Nocturne",     "void",        "Iron",      "#0d0d10", "#1a1b1e", "#6f7276", "#0a0a0c", "#a6a9ad", "#8a5cd6", 2, 1),
  M("Solstice",     "eclipse",     "Amber",     "#0d0d10", "#f7c67a", "#fff0d0", "#6e4210", "#4a2c0a", "#ffffff", 40, 1),
  M("Equinox",      "mirror",      "Jade",      "#ece8df", "#5f9d7c", "#a8d6bd", "#2d5240", "#1a3328", "#ffffff", 0, 1),
  M("Lodestar",     "supernova",   "Silver",    "#0d0d10", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#f0b429", 24, 1),
  M("Helix",        "spiral",      "Cobalt",    "#ece8df", "#3956a3", "#8ea4dd", "#1c2b58", "#101a38", "#ffffff", 18, 0),
  M("Abyss",        "void",        "Verdigris", "#0d0d10", "#0c1a1a", "#25504d", "#050a0a", "#9dcfca", "#4fd1a0", 4, 0),
  M("Radiance",     "blacksun",    "Amber",     "#ece8df", "#d98a2b", "#f7c67a", "#6e4210", "#4a2c0a", "#ffffff", 48, 0),
  M("Obelisk",      "zero",        "Iron",      "#0d0d10", "#6f7276", "#a6a9ad", "#2f3134", "#1c1d1f", "#ffffff", 2, 1),
  M("Chalice",      "genesis",     "Rose",      "#0d0d10", "#d69aa8", "#f3d2d9", "#7a4552", "#4d2a33", "#f0b429", 8, 2),
  M("Keystone",     "fracture",    "Iron",      "#0d0d10", "#6f7276", "#a6a9ad", "#2f3134", "#1c1d1f", "#c8323c", 3, 0),
  M("Anvil",        "lattice",     "Bronze",    "#0d0d10", "#9a7a48", "#d6b986", "#4d3a1e", "#2f2412", "#ffffff", 4, 1),
  M("Sigma",        "singularity", "Jade",      "#ece8df", "#5f9d7c", "#a8d6bd", "#2d5240", "#1a3328", "#ffffff", 5, 0),
  M("Omega",        "infinite",    "Obsidian",  "#0d0d10", "#1e1c22", "#4e4a56", "#0a090c", "#8a8494", "#c8323c", 2, 1),
  M("Alpha",        "genesis",     "Silver",    "#ece8df", "#b9bec6", "#eef0f3", "#5f6670", "#3a3f47", "#2f7fd6", 6, 1),
  M("Ouroboros",    "spiral",      "Gold",      "#0d0d10", "#d0a640", "#f5dc8a", "#6e5316", "#4a370c", "#ffffff", 8, 2),
];

export type MasterBody = { svg: string; bg: string; ink: string };

const R = 400;

function rot(inner: string, n: number, cx = 500): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    s += a === 0 ? inner : `<g transform="rotate(${a} ${cx} 500)">${inner}</g>`;
  }
  return s;
}

function base(m: Master, level: number): string {
  return `<rect width="1000" height="1000" fill="${m.bg}"/>` + yieldOrbits(level, m.light, m.accent);
}

function rim(m: Master): string {
  return `<circle cx="500" cy="500" r="${R - 4}" fill="none" stroke="${m.light}" stroke-width="4"/><circle cx="500" cy="500" r="${R - 32}" fill="none" stroke="${m.dark}" stroke-width="2"/>`;
}

function fingerprintTicks(seed: bigint, color: string): string {
  const bits = seed & 0xffffffffn;
  let s = "";
  for (let i = 0; i < 32; i++) {
    if ((bits >> BigInt(i)) & 1n) {
      s += `<rect x="498" y="118" width="4" height="12" fill="${color}" transform="rotate(${i * 11 + 4} 500 500)"/>`;
    }
  }
  return s;
}

export function renderMasterBody(m: Master, input: CoinInput, design: Design, level: number): MasterBody {
  let s = base(m, level);
  s += `<circle cx="500" cy="500" r="${R}" fill="${m.body}"/>`;
  const inkOnBody = m.mode === "void" || m.mode === "mirror" ? m.ink : m.dark;
  switch (m.mode) {
    case "void": {
      // Nothing but a point of light, off centre by the recipe, and faint rings fading in.
      const dy = m.a * 40;
      for (let i = 1; i <= 6; i++) {
        s += `<circle cx="500" cy="500" r="${i * 55}" fill="none" stroke="${m.light}" stroke-width="1" stroke-opacity=".${i < 4 ? "0" + (i + 1) : "1" + (i - 4)}"/>`;
      }
      s += `<circle cx="500" cy="${500 - dy}" r="${m.b ? 9 : 5}" fill="${m.accent}"/>`;
      break;
    }
    case "eclipse": {
      const rays = 36;
      s += `<g stroke="${m.light}" stroke-width="3">${rot(`<path d="M500 140V180"/>`, rays)}</g>`;
      s += `<circle cx="500" cy="500" r="300" fill="${m.light}"/>`;
      s += `<circle cx="${500 + m.a}" cy="${500 - (m.b ? m.a : 0)}" r="${300 - 12}" fill="${m.bg}"/>`;
      break;
    }
    case "singularity": {
      // Rings whose spacing shrinks toward the centre: a well.
      let r = 350;
      let gap = 40;
      const count = 5 + m.a;
      for (let i = 0; i < count && r > 20; i++) {
        s += `<circle cx="500" cy="500" r="${r}" fill="none" stroke="${i % 2 ? m.dark : m.light}" stroke-width="${2 + (i >> 1)}"/>`;
        gap = gap > 6 ? gap - 3 : 6;
        r -= gap + (m.b ? 6 : 0);
      }
      s += `<circle cx="500" cy="500" r="${r > 20 ? r : 20}" fill="${m.bg}"/>`;
      s += `<circle cx="500" cy="500" r="4" fill="${m.accent}"/>`;
      break;
    }
    case "mobius": {
      // Two bands, one over the other, each a fat dashed ellipse copied by the recipe.
      const copies = m.a;
      s += `<g fill="none" stroke-width="18">`;
      for (let i = 0; i < copies; i++) {
        const a = (i * 180) / copies;
        s += `<ellipse cx="500" cy="500" rx="300" ry="110" stroke="${i % 2 ? m.light : m.dark}" stroke-dasharray="90 60" transform="rotate(${a} 500 500)"/>`;
      }
      s += `</g>`;
      s += `<circle cx="500" cy="500" r="60" fill="${m.accent}"/>`;
      break;
    }
    case "prism": {
      // Facets in a few colours around the centre.
      const colors = m.b ? [m.accent, m.light, m.dark, m.body, m.ink] : [m.accent, "#2f7fd6", "#f0b429", "#4fd1a0", "#8a5cd6", "#c8323c"];
      const n = m.a;
      for (let i = 0; i < n; i++) {
        const c = colors[i % colors.length];
        s += `<path d="M500 500L500 140L${500 + 170} 190Z" fill="${c}" fill-opacity=".85" transform="rotate(${(i * 360) / n} 500 500)"/>`;
      }
      s += `<circle cx="500" cy="500" r="70" fill="${m.body}" stroke="${m.dark}" stroke-width="3"/>`;
      break;
    }
    case "supernova": {
      const rays = m.a;
      s += `<g stroke="${m.light}" stroke-width="2">`;
      for (let i = 0; i < rays; i++) {
        const len = i % 3 === 0 ? 330 : i % 3 === 1 ? 250 : 190;
        s += `<path d="M500 ${500 - 60}V${500 - len}" transform="rotate(${(i * 360) / rays} 500 500)"/>`;
      }
      s += `</g>`;
      s += `<circle cx="500" cy="500" r="${m.b ? 90 : 60}" fill="${m.light}"/><circle cx="500" cy="500" r="${m.b ? 50 : 30}" fill="${m.accent}"/>`;
      break;
    }
    case "blacksun": {
      s += `<g fill="${m.light}">${rot(`<path d="M480 150L500 60L520 150Z"/>`, m.a)}</g>`;
      s += `<circle cx="500" cy="500" r="${m.b ? 230 : 260}" fill="${m.dark}" stroke="${m.accent}" stroke-width="6"/>`;
      break;
    }
    case "mirror": {
      // Left as is, right inverted, seam down the middle at the recipe angle.
      const half = `<path d="M500 100A400 400 0 0 1 500 900Z" fill="${m.dark}"/>`;
      s += `<g transform="rotate(${m.a * 45} 500 500)">${half}<circle cx="500" cy="500" r="120" fill="${m.dark}"/><path d="M500 380A120 120 0 0 1 500 620Z" fill="${m.body}"/><path d="M500 100V900" stroke="${m.accent}" stroke-width="3"/></g>`;
      break;
    }
    case "zero": {
      s += `<circle cx="500" cy="500" r="${m.a ? 240 : 200}" fill="none" stroke="${m.dark}" stroke-width="${m.b ? 60 : 36}"/>`;
      if (m.a === 2) s += `<rect x="470" y="180" width="60" height="640" fill="${m.dark}"/>`;
      break;
    }
    case "fracture": {
      const shards = m.a;
      s += `<g stroke="${m.bg}" stroke-width="${m.b ? 14 : 10}" stroke-linejoin="round" fill="none">`;
      for (let i = 0; i < shards; i++) {
        s += `<path d="M500 500L${560 + i * 20} 300L${520 + i * 30} 110" transform="rotate(${(i * 360) / shards} 500 500)"/>`;
      }
      s += `</g>`;
      s += `<circle cx="500" cy="500" r="40" fill="${m.accent}"/>`;
      break;
    }
    case "genesis": {
      const n = m.a;
      s += `<g fill="none" stroke="${m.dark}" stroke-width="1.5">`;
      for (let i = 0; i < n * 2; i++) {
        s += `<ellipse cx="500" cy="500" rx="320" ry="90" transform="rotate(${(i * 180) / n} 500 500)"/>`;
      }
      s += `</g>`;
      s += `<g fill="${m.light}">${rot(`<circle cx="500" cy="118" r="7"/>`, n * 4)}</g>`;
      s += `<circle cx="500" cy="500" r="130" fill="${m.body}" stroke="${m.light}" stroke-width="10"/>`;
      s += `<g fill="${m.accent}">${rot(`<path d="M500 390L520 470L500 500L480 470Z"/>`, m.b * 4)}</g>`;
      break;
    }
    case "infinite": {
      const r = 150;
      s += `<g fill="none" stroke="${m.light}" stroke-width="${m.b ? 12 : 20}">`;
      for (let i = 0; i < m.a; i++) {
        s += `<g transform="rotate(${(i * 180) / m.a} 500 500)"><circle cx="${500 - r}" cy="500" r="${r}"/><circle cx="${500 + r}" cy="500" r="${r}"/></g>`;
      }
      s += `</g>`;
      s += `<circle cx="500" cy="500" r="14" fill="${m.accent}"/>`;
      break;
    }
    case "lattice": {
      const n = m.a;
      s += `<g fill="none" stroke="${m.dark}" stroke-width="2">`;
      for (let k = -4; k <= 4; k++) {
        s += rot(`<path d="M140 ${500 + k * 70}H860"/>`, n);
      }
      s += `</g>`;
      s += `<circle cx="500" cy="500" r="${m.b ? 110 : 80}" fill="${m.light}"/>`;
      break;
    }
    case "spiral": {
      // Compass spiral from alternating semicircles around two centres.
      const d = m.a;
      let path = `M500 500`;
      let x = 500;
      for (let i = 1; i <= 12; i++) {
        const r = i * d;
        const nx = i % 2 ? 500 + d + r : 500 - r;
        path += `A${r} ${r} 0 0 ${i % 2 ? 1 : 0} ${nx} 500`;
        x = nx;
        if (r > 340) break;
      }
      s += `<path d="${path}" fill="none" stroke="${m.light}" stroke-width="${8 + m.b * 4}"/>`;
      s += `<circle cx="500" cy="500" r="${8 + m.b * 6}" fill="${m.accent}"/>`;
      break;
    }
  }
  s += rim(m);
  s += fingerprintTicks(input.seed, inkOnBody);
  return { svg: s, bg: m.bg, ink: inkOnBody };
}
