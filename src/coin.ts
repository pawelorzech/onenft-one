/**
 * ONE coin renderer. Source of truth for contracts/src/CoinRenderer.sol.
 *
 * Every number is an integer. There is no trigonometry: every radial thing is
 * one motif drawn on the vertical axis and copied with `rotate()` in the SVG,
 * so the Solidity port is a string builder over the same integers. The SVG is
 * meant to be returned from `tokenURI` as `data:image/svg+xml;base64,...`.
 *
 * Two layers:
 *   - the coin, fixed at mint from the seed (plus the master index for a 1/1);
 *   - the yield ring around it, drawn from the coin's lifetime yield over its
 *     backing, in basis points. It grows; it never shrinks.
 */

const U64 = (1n << 64n) - 1n;

/** splitmix64 step and finalizer, as in the sister collections. */
export function nextRandom(state: bigint): bigint {
  let z = (state + 0x9e3779b97f4a7c15n) & U64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
  return (z ^ (z >> 31n)) & U64;
}

/** A stream of draws over a counter. `bits` at a time, top bits first. */
export class Draws {
  private state: bigint;
  constructor(seed: bigint) {
    this.state = seed & U64;
  }
  bits(bits: number): number {
    this.state = (this.state + 1n) & U64;
    const mixed = nextRandom(this.state);
    return Number((mixed >> BigInt(64 - bits)) & ((1n << BigInt(bits)) - 1n));
  }
  /** Weighted pick: `weights` sum to any total; returns the index. */
  pick(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let v = this.bits(16) % total;
    for (let i = 0; i < weights.length; i++) {
      if (v < weights[i]) return i;
      v -= weights[i];
    }
    return weights.length - 1;
  }
  /** Uniform integer in [lo, hi]. */
  range(lo: number, hi: number): number {
    return lo + (this.bits(16) % (hi - lo + 1));
  }
}

// ---------------------------------------------------------------------------
// Trait tables. Weights are per mille of the draw; they set the odds.
// ---------------------------------------------------------------------------

export type Material = {
  name: string;
  /** Coin body. */
  base: string;
  /** Raised edges and highlights. */
  light: string;
  /** Recessed engraving. */
  dark: string;
  /** Fine line work on the body. */
  ink: string;
};

export const MATERIALS: readonly Material[] = [
  { name: "Silver",   base: "#b9bec6", light: "#eef0f3", dark: "#5f6670", ink: "#3a3f47" },
  { name: "Copper",   base: "#b8734a", light: "#e8b58e", dark: "#5f3620", ink: "#3b2114" },
  { name: "Bronze",   base: "#9a7a48", light: "#d6b986", dark: "#4d3a1e", ink: "#2f2412" },
  { name: "Gold",     base: "#d0a640", light: "#f5dc8a", dark: "#6e5316", ink: "#4a370c" },
  { name: "Iron",     base: "#6f7276", light: "#a6a9ad", dark: "#2f3134", ink: "#1c1d1f" },
  { name: "Ivory",    base: "#e9e0cc", light: "#fbf7ee", dark: "#9a8b6a", ink: "#5b5040" },
  { name: "Cobalt",   base: "#3956a3", light: "#8ea4dd", dark: "#1c2b58", ink: "#101a38" },
  { name: "Rose",     base: "#d69aa8", light: "#f3d2d9", dark: "#7a4552", ink: "#4d2a33" },
  { name: "Jade",     base: "#5f9d7c", light: "#a8d6bd", dark: "#2d5240", ink: "#1a3328" },
  { name: "Obsidian", base: "#1e1c22", light: "#4e4a56", dark: "#0a090c", ink: "#8a8494" },
  { name: "Amber",    base: "#d98a2b", light: "#f7c67a", dark: "#6e4210", ink: "#4a2c0a" },
  { name: "Verdigris",base: "#4f8f8b", light: "#9dcfca", dark: "#25504d", ink: "#153331" },
];
export const MATERIAL_WEIGHTS = [220, 160, 130, 70, 110, 90, 60, 45, 45, 28, 22, 20];

export const GROUNDS = ["Night", "Paper", "Tinted"] as const;
export const GROUND_WEIGHTS = [640, 240, 120];

export const RIMS = ["Smooth", "Ridged", "Beaded", "Segmented", "Toothed", "Broken"] as const;
export const RIM_WEIGHTS = [300, 300, 170, 140, 82, 8];

export const FIELDS = ["Rosette", "Radial", "Orbital", "Crystalline", "Wave", "Bare"] as const;
export const FIELD_WEIGHTS = [300, 240, 190, 130, 90, 50];

export const SYMMETRIES = [3, 4, 5, 6, 8, 12] as const;
export const SYMMETRY_WEIGHTS = [70, 170, 120, 330, 240, 70];

export const CORES = ["Full", "Ring", "Hollow", "Aperture", "Split"] as const;
export const CORE_WEIGHTS = [420, 240, 140, 130, 70];

export const GLYPHS = ["Sigil", "Star", "Orbit", "Rune", "Seal", "None"] as const;
export const GLYPH_WEIGHTS = [300, 220, 160, 150, 110, 60];

export const SURFACES = ["Polished", "Matte", "Aged", "Fractured"] as const;
export const SURFACE_WEIGHTS = [450, 340, 190, 20];

export const HALOS = ["None", "Ring", "Rays", "Dotted", "Double"] as const;
export const HALO_WEIGHTS = [500, 220, 120, 100, 60];

export const ACCENTS = [
  { name: "None",    color: "" },
  { name: "Crimson", color: "#c8323c" },
  { name: "Azure",   color: "#2f7fd6" },
  { name: "Saffron", color: "#f0b429" },
  { name: "Mint",    color: "#4fd1a0" },
  { name: "Violet",  color: "#8a5cd6" },
  { name: "White",   color: "#ffffff" },
] as const;
export const ACCENT_WEIGHTS = [640, 90, 80, 80, 45, 40, 25];

export const ANOMALIES = ["None", "Double Orbit", "Offset Core", "Inverted", "Eclipse", "Ghost Rim"] as const;
export const ANOMALY_WEIGHTS = [968, 8, 8, 6, 6, 4];

export type Ground = (typeof GROUNDS)[number];
export type Rim = (typeof RIMS)[number];
export type Field = (typeof FIELDS)[number];
export type Symmetry = (typeof SYMMETRIES)[number];
export type Core = (typeof CORES)[number];
export type Glyph = (typeof GLYPHS)[number];
export type Surface = (typeof SURFACES)[number];
export type Halo = (typeof HALOS)[number];
export type Anomaly = (typeof ANOMALIES)[number];

export type Traits = {
  material: string;
  ground: Ground;
  rim: Rim;
  field: Field;
  symmetry: Symmetry;
  core: Core;
  glyph: Glyph;
  surface: Surface;
  halo: Halo;
  accent: string;
  anomaly: Anomaly;
};

/** Everything the seed decides, resolved to indices. Same order in Solidity. */
export type Design = {
  material: number;
  ground: number;
  rim: number;
  field: number;
  symmetry: number;
  core: number;
  glyph: number;
  surface: number;
  halo: number;
  accent: number;
  anomaly: number;
  /** Field density and the glyph's strokes come from these extra draws. */
  density: number;
  glyphBits: number;
  fieldA: number;
  fieldB: number;
  rimPhase: number;
};

export function designOf(seed: bigint): Design {
  const d = new Draws(seed);
  return {
    material: d.pick(MATERIAL_WEIGHTS),
    ground: d.pick(GROUND_WEIGHTS),
    rim: d.pick(RIM_WEIGHTS),
    field: d.pick(FIELD_WEIGHTS),
    symmetry: d.pick(SYMMETRY_WEIGHTS),
    core: d.pick(CORE_WEIGHTS),
    glyph: d.pick(GLYPH_WEIGHTS),
    surface: d.pick(SURFACE_WEIGHTS),
    halo: d.pick(HALO_WEIGHTS),
    accent: d.pick(ACCENT_WEIGHTS),
    anomaly: d.pick(ANOMALY_WEIGHTS),
    density: d.range(0, 3),
    glyphBits: d.bits(16),
    fieldA: d.range(0, 15),
    fieldB: d.range(0, 15),
    rimPhase: d.range(0, 59),
  };
}

export function traitsOf(design: Design): Traits {
  return {
    material: MATERIALS[design.material].name,
    ground: GROUNDS[design.ground],
    rim: RIMS[design.rim],
    field: FIELDS[design.field],
    symmetry: SYMMETRIES[design.symmetry],
    core: CORES[design.core],
    glyph: GLYPHS[design.glyph],
    surface: SURFACES[design.surface],
    halo: HALOS[design.halo],
    accent: ACCENTS[design.accent].name,
    anomaly: ANOMALIES[design.anomaly],
  };
}

// ---------------------------------------------------------------------------
// Yield ring. Lifetime yield over backing, in basis points, to a level.
// ---------------------------------------------------------------------------

/** Level thresholds in basis points: level n is reached at YIELD_STEPS[n - 1]. */
export const YIELD_STEPS = [1, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 30000, 50000];

export function yieldLevel(bps: number): number {
  let level = 0;
  for (const step of YIELD_STEPS) if (bps >= step) level++;
  return level;
}

// ---------------------------------------------------------------------------
// Geometry. Centre 500,500; the coin is a circle of radius 400.
// ---------------------------------------------------------------------------

const C = 500;
const R = 400;

export type CoinInput = {
  seed: bigint;
  /** Token number inside the series, 1-based. */
  number: number;
  series: number;
  /** Backing class in whole USDC: 10, 25 or 50. */
  backing: number;
  /** Lifetime yield over backing in basis points. */
  yieldBps: number;
  /** Master coin index (0..49) or -1. */
  master: number;
  founder: boolean;
};

export type Coin = {
  svg: string;
  traits: Traits;
  design: Design;
  /** Colors for the site: the coin's body and its ink. */
  palette: { bg: string; fg: string };
  masterName: string;
  yieldLevel: number;
};

/** Hex of the top 32 bits of the seed, upper case, eight characters. */
export function fingerprint(seed: bigint): string {
  return ((seed >> 32n) & 0xffffffffn).toString(16).toUpperCase().padStart(8, "0");
}

function pad5(n: number): string {
  return String(n).padStart(5, "0");
}

/** Angle of copy i of n, integer degrees; Solidity does the same division. */
export function angle(i: number, n: number): number {
  return Math.floor((i * 360) / n);
}

/** The largest count at most n * k that divides 360 and is a multiple of n. */
export function copies(n: number, k: number): number {
  let m = n * k;
  while (m > n && 360 % m !== 0) m -= n;
  return m;
}

/** N copies of `#m` around the centre. */
function ring(id: string, n: number, phase = 0): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = phase + angle(i, n);
    s += a === 0 ? `<use href="#${id}"/>` : `<use href="#${id}" transform="rotate(${a} 500 500)"/>`;
  }
  return s;
}

function groundColor(design: Design, m: Material): string {
  switch (GROUNDS[design.ground]) {
    case "Night": return "#0d0d10";
    case "Paper": return "#ece8df";
    case "Tinted": return m.dark;
  }
}

export function renderCoin(input: CoinInput): Coin {
  const design = designOf(input.seed);
  if (input.master >= 0) return renderMaster(input, design);
  const traits = traitsOf(design);
  const m = MATERIALS[design.material];
  const inverted = traits.anomaly === "Inverted";
  const body = inverted ? m.dark : m.base;
  const ink = inverted ? m.light : m.ink;
  const light = inverted ? m.base : m.light;
  const dark = inverted ? m.ink : m.dark;
  const accent = ACCENTS[design.accent].color || light;
  const ground = groundColor(design, m);
  const n = traits.symmetry;
  const level = yieldLevel(input.yieldBps);

  let defs = "";
  let out = "";

  // Ground.
  out += `<rect width="1000" height="1000" fill="${ground}"/>`;

  // Yield ring, behind the coin: glow first, then orbits.
  out += yieldRing(level, light, accent, traits.anomaly === "Double Orbit");

  // Static halo.
  switch (traits.halo) {
    case "Ring":
      out += `<circle cx="500" cy="500" r="424" fill="none" stroke="${light}" stroke-width="2"/>`;
      break;
    case "Double":
      out += `<circle cx="500" cy="500" r="420" fill="none" stroke="${light}" stroke-width="2"/><circle cx="500" cy="500" r="432" fill="none" stroke="${light}" stroke-width="1"/>`;
      break;
    case "Rays":
      defs += `<path id="hr" d="M500 60V88" stroke="${light}" stroke-width="3"/>`;
      out += ring("hr", copies(n, 4));
      break;
    case "Dotted":
      defs += `<circle id="hd" cx="500" cy="74" r="4" fill="${light}"/>`;
      out += ring("hd", copies(n, 6));
      break;
  }

  // Eclipse: a dark disc bites the coin from one side.
  const eclipse = traits.anomaly === "Eclipse";

  // Coin body.
  out += `<circle cx="500" cy="500" r="${R}" fill="${body}"/>`;
  if (traits.anomaly === "Ghost Rim") {
    out += `<circle cx="500" cy="500" r="${R}" fill="none" stroke="${ground}" stroke-width="8" stroke-dasharray="40 24"/>`;
  }

  // Field pattern, clipped to the coin.
  defs += `<clipPath id="cf"><circle cx="500" cy="500" r="364"/></clipPath>`;
  out += `<g clip-path="url(#cf)" fill="none" stroke="${ink}">`;
  out += fieldPattern(design, n, ink, dark);
  out += `</g>`;

  // Rim.
  out += rimPattern(design, n, light, dark, ground);

  // Core.
  const coreShift = traits.anomaly === "Offset Core" ? 58 : 0;
  out += coreShape(design, body, dark, light, ground, coreShift);

  // Glyph, on the core.
  out += glyphShape(design, n, ink, accent, coreShift);

  // Fingerprint ticks: the low 32 bits of the seed as 32 marks on the rim.
  defs += `<rect id="fp" x="498" y="118" width="4" height="12" fill="${dark}"/>`;
  out += fingerprintTicks(input.seed, "fp");

  // Backing mark: a small engraved number at the top of the rim.
  out += `<text x="500" y="146" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="${dark}" letter-spacing="2">${input.backing}</text>`;

  // Legends on the rim.
  defs += `<path id="lb" d="M132 500A368 368 0 0 0 868 500"/><path id="lt" d="M132 500A368 368 0 0 1 868 500"/>`;
  const legend = legendText(input);
  out += `<text font-family="Georgia,serif" font-size="22" fill="${dark}" letter-spacing="6"><textPath href="#lb" startOffset="50%" text-anchor="middle">${legend}</textPath></text>`;
  out += `<text font-family="Georgia,serif" font-size="22" fill="${dark}" letter-spacing="6"><textPath href="#lt" startOffset="50%" text-anchor="middle">ONE</textPath></text>`;

  // Surface finish.
  out += surfaceFinish(design, light, dark);

  if (eclipse) {
    out += `<circle cx="640" cy="360" r="${R}" fill="${ground}" fill-opacity=".92"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs>${defs}</defs>${out}</svg>`;
  return {
    svg,
    traits,
    design,
    palette: { bg: ground === "#0d0d10" ? body : ground, fg: ground === "#0d0d10" ? dark : ink },
    masterName: "",
    yieldLevel: level,
  };
}

function legendText(input: CoinInput): string {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const series = input.series <= 10 ? roman[input.series - 1] : String(input.series);
  return `BASE ${series} ${pad5(input.number)} ${fingerprint(input.seed)}`;
}

function fingerprintTicks(seed: bigint, id: string): string {
  const bits = seed & 0xffffffffn;
  let s = "";
  for (let i = 0; i < 32; i++) {
    if ((bits >> BigInt(i)) & 1n) {
      const a = i * 11 + 4; // 32 ticks over 352 degrees, offset off the axis so they never sit on the legends
      s += `<use href="#${id}" transform="rotate(${a} 500 500)"/>`;
    }
  }
  return s;
}

function yieldRing(level: number, light: string, accent: string, doubled: boolean): string {
  if (level === 0) return "";
  let s = "";
  // Glow grows with level.
  const glow = Math.min(level, 10);
  s += `<circle cx="500" cy="500" r="${420 + glow * 6}" fill="${accent}" fill-opacity=".${glow < 10 ? "0" + glow : "10"}"/>`;
  // Orbits: one thin ring per level, further out each time.
  for (let i = 0; i < level; i++) {
    const r = 414 + i * 6;
    const dash = i % 3 === 0 ? "" : i % 3 === 1 ? ` stroke-dasharray="12 6"` : ` stroke-dasharray="2 8"`;
    s += `<circle cx="500" cy="500" r="${r}" fill="none" stroke="${i % 4 === 3 ? accent : light}" stroke-width="1"${dash}/>`;
    if (doubled) s += `<circle cx="500" cy="500" r="${r + 3}" fill="none" stroke="${light}" stroke-width="1" stroke-opacity=".5"/>`;
  }
  // From level 6 on, tick marks around the outside.
  if (level >= 6) {
    const ticks = 12 * (level - 5);
    for (let i = 0; i < ticks; i++) {
      const a = angle(i, ticks);
      s += `<path d="M500 ${498 - 414 - level * 6 - 8}V${498 - 414 - level * 6}" stroke="${light}" stroke-width="2" transform="rotate(${a} 500 500)"/>`;
    }
  }
  return s;
}

function fieldPattern(d: Design, n: number, ink: string, dark: string): string {
  const field = FIELDS[d.field];
  const dens = d.density; // 0..3
  let s = "";
  switch (field) {
    case "Rosette": {
      // Guilloché: rotated ellipses.
      const rx = 200 + d.fieldA * 8;
      const ry = 60 + d.fieldB * 6;
      const count = copies(n, dens + 1);
      s += `<g stroke-width="1.5">`;
      for (let i = 0; i < count; i++) {
        s += `<ellipse cx="500" cy="500" rx="${rx}" ry="${ry}" transform="rotate(${angle(i, count)} 500 500)"/>`;
      }
      s += `</g>`;
      if (dens >= 2) {
        s += `<circle cx="500" cy="500" r="${rx + 40}" stroke-width="1" stroke-dasharray="3 5"/>`;
      }
      break;
    }
    case "Radial": {
      const lines = copies(n, 4 + dens * 2);
      const inner = 150 + d.fieldA * 4;
      s += `<g stroke-width="${dens >= 2 ? 1 : 2}">`;
      for (let i = 0; i < lines; i++) {
        const a = angle(i, lines);
        const len = i % 2 === 0 ? 360 : 300 + d.fieldB * 3;
        s += `<path d="M500 ${500 - inner}V${500 - len}" transform="rotate(${a} 500 500)"/>`;
      }
      s += `</g>`;
      break;
    }
    case "Orbital": {
      const count = 4 + dens * 2;
      for (let i = 0; i < count; i++) {
        const r = 140 + i * ((360 - 140) / count);
        const dash = (i + d.fieldA) % 3 === 0 ? "" : ` stroke-dasharray="${8 + d.fieldB} ${6 + i * 2}"`;
        s += `<circle cx="500" cy="500" r="${Math.floor(r)}" stroke-width="${i % 2 === 0 ? 2 : 1}"${dash}/>`;
      }
      break;
    }
    case "Crystalline": {
      // A chord across the coin, copied around: a star lattice.
      const y = 170 + d.fieldA * 10;
      const count = copies(n, dens + 2);
      s += `<g stroke-width="1.5">`;
      for (let i = 0; i < count; i++) {
        s += `<path d="M140 ${y}H860" transform="rotate(${angle(i, count)} 500 500)"/>`;
      }
      s += `</g>`;
      break;
    }
    case "Wave": {
      // Quadratic waves stacked, copied by symmetry.
      const amp = 20 + d.fieldB * 3;
      const rows = 3 + dens;
      s += `<g stroke-width="1.5">`;
      for (let k = 0; k < n; k++) {
        let g = "";
        for (let i = 0; i < rows; i++) {
          const y = 200 + i * 40;
          g += `<path d="M140 ${y}Q260 ${y - amp} 380 ${y}T620 ${y}T860 ${y}"/>`;
        }
        s += `<g transform="rotate(${angle(k, n)} 500 500)">${g}</g>`;
      }
      s += `</g>`;
      break;
    }
    case "Bare":
      s += `<circle cx="500" cy="500" r="${300 + d.fieldA * 3}" stroke="${dark}" stroke-width="1"/>`;
      break;
  }
  return s;
}

function rimPattern(d: Design, n: number, light: string, dark: string, ground: string): string {
  const rim = RIMS[d.rim];
  let s = `<circle cx="500" cy="500" r="${R - 4}" fill="none" stroke="${light}" stroke-width="4"/>`;
  s += `<circle cx="500" cy="500" r="${R - 32}" fill="none" stroke="${dark}" stroke-width="2"/>`;
  switch (rim) {
    case "Smooth":
      break;
    case "Ridged":
      s += `<circle cx="500" cy="500" r="${R - 18}" fill="none" stroke="${dark}" stroke-width="16" stroke-dasharray="3 5"/>`;
      break;
    case "Beaded": {
      const beads = copies(n, 8);
      for (let i = 0; i < beads; i++) {
        s += `<circle cx="500" cy="118" r="6" fill="${light}" transform="rotate(${angle(i, beads)} 500 500)"/>`;
      }
      break;
    }
    case "Segmented":
      s += `<circle cx="500" cy="500" r="${R - 18}" fill="none" stroke="${dark}" stroke-width="14" stroke-dasharray="70 18"/>`;
      break;
    case "Toothed": {
      const teeth = copies(n, 6);
      for (let i = 0; i < teeth; i++) {
        s += `<path d="M490 104L500 130L510 104Z" fill="${dark}" transform="rotate(${angle(i, teeth)} 500 500)"/>`;
      }
      break;
    }
    case "Broken":
      s += `<circle cx="500" cy="500" r="${R - 18}" fill="none" stroke="${dark}" stroke-width="14" stroke-dasharray="70 18"/>`;
      s += `<rect x="470" y="90" width="60" height="60" fill="${ground}" transform="rotate(${d.rimPhase * 6 + 40} 500 500)"/>`;
      break;
  }
  return s;
}

function coreShape(d: Design, body: string, dark: string, light: string, ground: string, shift: number): string {
  const core = CORES[d.core];
  const cx = 500 + shift;
  let s = "";
  switch (core) {
    case "Full":
      s += `<circle cx="${cx}" cy="500" r="130" fill="${body}" stroke="${dark}" stroke-width="2"/>`;
      break;
    case "Ring":
      s += `<circle cx="${cx}" cy="500" r="130" fill="${body}" stroke="${light}" stroke-width="10"/><circle cx="${cx}" cy="500" r="112" fill="none" stroke="${dark}" stroke-width="2"/>`;
      break;
    case "Hollow":
      s += `<circle cx="${cx}" cy="500" r="130" fill="${ground}" stroke="${dark}" stroke-width="6"/>`;
      break;
    case "Aperture":
      s += `<circle cx="${cx}" cy="500" r="130" fill="${body}" stroke="${dark}" stroke-width="2"/><circle cx="${cx}" cy="500" r="34" fill="${ground}" stroke="${light}" stroke-width="4"/>`;
      break;
    case "Split":
      s += `<circle cx="${cx}" cy="500" r="130" fill="${body}" stroke="${dark}" stroke-width="2"/><rect x="${cx - 6}" y="360" width="12" height="280" fill="${ground}" transform="rotate(${d.fieldA * 22} ${cx} 500)"/>`;
      break;
  }
  return s;
}

/**
 * The glyph is up to four strokes on the upper half of the vertical axis,
 * mirrored and copied by the symmetry. Sixteen bits pick the strokes.
 */
function glyphShape(d: Design, n: number, ink: string, accent: string, shift: number): string {
  const glyph = GLYPHS[d.glyph];
  if (glyph === "None") return "";
  const cx = 500 + shift;
  const bits = d.glyphBits;
  const color = ACCENTS[d.accent].color ? accent : ink;
  const hollow = CORES[d.core] === "Hollow";
  const stroke = hollow ? accent : color;
  let motif = "";
  switch (glyph) {
    case "Sigil": {
      // Strokes from the axis outwards, bent by the bits.
      for (let i = 0; i < 4; i++) {
        const b = (bits >> (i * 4)) & 15;
        const y1 = 500 - 20 - i * 22;
        const dx = (b & 7) * 6 - 18;
        const y2 = y1 - 18 - (b >> 3) * 14;
        motif += `<path d="M${cx} ${y1}L${cx + dx} ${y2}"/>`;
      }
      break;
    }
    case "Star": {
      const len = 60 + (bits & 31);
      const w = 8 + ((bits >> 5) & 7);
      motif += `<path d="M${cx} ${500 - len}L${cx + w} 500L${cx - w} 500Z"/>`;
      break;
    }
    case "Orbit": {
      const r = 8 + (bits & 7);
      const y = 500 - 40 - ((bits >> 3) & 31);
      motif += `<circle cx="${cx}" cy="${y}" r="${r}"/>`;
      if (bits & 256) motif += `<circle cx="${cx}" cy="${y - r * 3}" r="${r >> 1}"/>`;
      break;
    }
    case "Rune": {
      const y1 = 500 - 16;
      const y2 = 500 - 70 - (bits & 31);
      const dx = ((bits >> 5) & 7) * 5;
      motif += `<path d="M${cx} ${y1}V${y2}M${cx} ${y2 + 20}L${cx + dx + 8} ${y2 + 4}"/>`;
      break;
    }
    case "Seal": {
      const y = 500 - 50 - (bits & 15);
      motif += `<path d="M${cx} ${y - 30}L${cx + 26} ${y}L${cx} ${y + 30}L${cx - 26} ${y}Z"/>`;
      break;
    }
  }
  const fill = glyph === "Star" || glyph === "Seal" ? stroke : "none";
  const defs = `<g id="gl" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${motif}</g>`;
  const mirror = glyph === "Sigil" || glyph === "Rune";
  let s = `<defs>${defs}</defs>`;
  for (let i = 0; i < n; i++) {
    const a = angle(i, n);
    s += `<use href="#gl" transform="rotate(${a} ${cx} 500)"/>`;
    if (mirror) s += `<use href="#gl" transform="rotate(${a} ${cx} 500) matrix(-1 0 0 1 ${cx * 2} 0)"/>`;
  }
  if (glyph !== "Orbit") s += `<circle cx="${cx}" cy="500" r="${6 + (bits >> 12)}" fill="${stroke}"/>`;
  return s;
}

function surfaceFinish(d: Design, light: string, dark: string): string {
  switch (SURFACES[d.surface]) {
    case "Polished":
      return `<ellipse cx="380" cy="330" rx="200" ry="110" fill="${light}" fill-opacity=".16" transform="rotate(-35 380 330)"/><ellipse cx="640" cy="690" rx="180" ry="90" fill="${dark}" fill-opacity=".14" transform="rotate(-35 640 690)"/>`;
    case "Matte":
      return "";
    case "Aged": {
      let s = `<circle cx="500" cy="500" r="${R}" fill="${dark}" fill-opacity=".14"/>`;
      const p = new Draws(BigInt(d.glyphBits) * 977n + BigInt(d.fieldA));
      for (let i = 0; i < 9; i++) {
        const r = 18 + p.bits(5);
        const x = 220 + p.bits(9);
        const y = 220 + p.bits(9);
        s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${dark}" fill-opacity=".${10 + p.bits(4)}"/>`;
      }
      return s;
    }
    case "Fractured": {
      const a = d.fieldA * 22;
      return `<g transform="rotate(${a} 500 500)" fill="none" stroke="${dark}" stroke-width="5" stroke-linejoin="round"><path d="M500 110L470 260L520 330L440 470L510 560L470 700L500 890"/><path d="M520 330L640 300M440 470L300 440M510 560L610 640"/></g>`;
    }
  }
}

// ---------------------------------------------------------------------------
// Master coins. Fifty recipes; each is a mode plus its own settings and name.
// ---------------------------------------------------------------------------

import { MASTERS, renderMasterBody } from "./masters.ts";

export { MASTERS };

function renderMaster(input: CoinInput, design: Design): Coin {
  const recipe = MASTERS[input.master];
  const traits = traitsOf(design);
  const level = yieldLevel(input.yieldBps);
  const body = renderMasterBody(recipe, input, design, level);
  const legend = legendText(input);
  let out = body.svg;
  out += `<defs><path id="lb" d="M132 500A368 368 0 0 0 868 500"/><path id="lt" d="M132 500A368 368 0 0 1 868 500"/></defs>`;
  out += `<text font-family="Georgia,serif" font-size="22" fill="${body.ink}" letter-spacing="6"><textPath href="#lb" startOffset="50%" text-anchor="middle">${legend}</textPath></text>`;
  out += `<text font-family="Georgia,serif" font-size="22" fill="${body.ink}" letter-spacing="6"><textPath href="#lt" startOffset="50%" text-anchor="middle">${recipe.name.toUpperCase()}</textPath></text>`;
  out += `<text x="500" y="146" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="${body.ink}" letter-spacing="2">${input.backing}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${out}</svg>`;
  return {
    svg,
    traits: { ...traits, material: recipe.material, anomaly: "None", accent: "None" },
    design,
    palette: { bg: body.bg, fg: body.ink },
    masterName: recipe.name,
    yieldLevel: level,
  };
}

/** Yield ring helper shared with the masters. */
export function yieldOrbits(level: number, light: string, accent: string): string {
  return yieldRing(level, light, accent, false);
}
