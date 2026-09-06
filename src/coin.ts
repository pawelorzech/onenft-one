/**
 * ONE coin renderer, pixel art. Source of truth for contracts/src/CoinRenderer.sol.
 *
 * A coin is a 64 by 64 grid of colour indices. Every pixel is decided by
 * integer arithmetic on its offset from the centre: no trigonometry, no floats.
 * Symmetry comes from folding the offset into a fundamental domain (mirror,
 * quadrant, octant, or a quarter turn) before the pattern looks at it. Angles,
 * where a pattern needs one, are a pseudo angle in 0..255 built from the octant
 * and the slope. The Solidity port is the same loop over the same integers.
 *
 * Two layers:
 *   - the coin, fixed at mint from the seed (plus the master index for a 1/1);
 *   - the yield ring around it, from the coin's lifetime yield over its backing
 *     in basis points. It grows; it never shrinks.
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
  /** Weighted pick over per-mille weights; returns the index. */
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
  range(lo: number, hi: number): number {
    return lo + (this.bits(16) % (hi - lo + 1));
  }
}

/** A 32-bit hash of a pixel and a salt, for speckle and cracks. Same in Solidity. */
export function hash32(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Integer square root. */
export function isqrt(n: number): number {
  if (n < 2) return n;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

// ---------------------------------------------------------------------------
// Trait tables. Weights are per mille of the draw; they set the odds.
// ---------------------------------------------------------------------------

import { MATERIALS, type Material } from "./tables.ts";
export { MATERIALS, type Material };
export const MATERIAL_WEIGHTS = [220, 160, 130, 70, 110, 90, 60, 45, 45, 28, 22, 20];

export const GROUNDS = ["Night", "Paper", "Tinted"] as const;
export const GROUND_WEIGHTS = [640, 240, 120];

export const RIMS = ["Smooth", "Ridged", "Beaded", "Segmented", "Toothed", "Broken"] as const;
export const RIM_WEIGHTS = [300, 300, 170, 140, 82, 8];

export const FIELDS = ["Rings", "Diamonds", "Lattice", "Grid", "Spokes", "Spiral", "Speckle", "Bare"] as const;
export const FIELD_WEIGHTS = [220, 160, 140, 120, 130, 90, 90, 50];

export const SYMMETRIES = ["Mirror", "Quad", "Octant", "Turn"] as const;
export const SYMMETRY_WEIGHTS = [250, 350, 280, 120];

export const CORES = ["Full", "Ring", "Hollow", "Aperture", "Split"] as const;
export const CORE_WEIGHTS = [420, 240, 140, 130, 70];

export const GLYPHS = ["Sigil", "Rune", "Star", "Cross", "Dot", "None"] as const;
export const GLYPH_WEIGHTS = [300, 200, 180, 120, 140, 60];

export const SURFACES = ["Polished", "Matte", "Aged", "Fractured"] as const;
export const SURFACE_WEIGHTS = [450, 340, 190, 20];

export const HALOS = ["None", "Ring", "Rays", "Dotted", "Double"] as const;
export const HALO_WEIGHTS = [500, 220, 120, 100, 60];

export const ACCENTS = [
  { name: "None",    color: "" },
  { name: "Crimson", color: "#d23b45" },
  { name: "Azure",   color: "#3a8ae6" },
  { name: "Saffron", color: "#f5b82e" },
  { name: "Mint",    color: "#4fd1a0" },
  { name: "Violet",  color: "#9a6ee6" },
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

/** Everything the seed decides, as indices. Same draw order in Solidity. */
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
  /** Pattern scale, 0..3. */
  density: number;
  /** Sixteen bits for the glyph. */
  glyphBits: number;
  /** Two small settings a pattern may use. */
  fieldA: number;
  fieldB: number;
  /** Salt for speckle, cracks and the aged finish. */
  salt: number;
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
    salt: d.bits(16),
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
// Yield ring levels.
// ---------------------------------------------------------------------------

/** Level n is reached at YIELD_STEPS[n - 1] basis points of lifetime yield. */
export const YIELD_STEPS = [1, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 30000, 50000];

export function yieldLevel(bps: number): number {
  let level = 0;
  for (const step of YIELD_STEPS) if (bps >= step) level++;
  return level;
}

// ---------------------------------------------------------------------------
// The grid.
// ---------------------------------------------------------------------------

export const N = 64;
/** Coin radius in pixels. The centre sits between pixels 31 and 32. */
export const RADIUS = 23;
export const CORE = 8;

/** Colour slots. A coin's palette maps these to hex colours. */
export const SLOT = { ground: 0, body: 1, light: 2, dark: 3, ink: 4, accent: 5, white: 6, extra1: 7, extra2: 8, extra3: 9 } as const;

export class Grid {
  g = new Uint8Array(N * N);
  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= N || y >= N ? 0 : this.g[y * N + x];
  }
  set(x: number, y: number, v: number) {
    if (x >= 0 && y >= 0 && x < N && y < N) this.g[y * N + x] = v;
  }
}

/** The pixel's offset from the centre, doubled so it is an odd integer, and folds of it. */
export type Px = {
  x: number;
  y: number;
  /** 2x - 63, 2y - 63: odd, never zero. */
  dx: number;
  dy: number;
  /** dx * dx + dy * dy: four times the squared distance. */
  rr: number;
  /** Radius in pixels: floor(sqrt(rr) / 2). */
  r: number;
  /** Absolute offsets. */
  ax: number;
  ay: number;
  /** Folded offsets under the coin's symmetry. */
  u: number;
  v: number;
  /** Pseudo angle 0..255, counter clockwise from the right, no trigonometry. */
  a: number;
};

export function pixel(x: number, y: number, symmetry: Symmetry): Px {
  const dx = 2 * x - 63;
  const dy = 2 * y - 63;
  const rr = dx * dx + dy * dy;
  const r = isqrt(rr) >> 1;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  let u: number, v: number;
  switch (symmetry) {
    case "Mirror": u = ax; v = dy; break;
    case "Quad": u = ax; v = ay; break;
    case "Octant": u = ax > ay ? ax : ay; v = ax > ay ? ay : ax; break;
    case "Turn": {
      let px = dx, py = dy;
      while (!(px > 0 && py < 0)) { const t = px; px = py; py = -t; }
      u = px; v = -py;
      break;
    }
  }
  const big = ax > ay ? ax : ay;
  const small = ax > ay ? ay : ax;
  const slope = Math.floor((small * 32) / big);
  let oct: number;
  if (dx > 0 && dy < 0) oct = ax >= ay ? 0 : 1;
  else if (dx < 0 && dy < 0) oct = ay >= ax ? 2 : 3;
  else if (dx < 0 && dy > 0) oct = ax >= ay ? 4 : 5;
  else oct = ay >= ax ? 6 : 7;
  const a = oct % 2 === 0 ? oct * 32 + slope : oct * 32 + (32 - slope);
  return { x, y, dx, dy, rr, r, ax, ay, u, v, a: a & 255 };
}

// ---------------------------------------------------------------------------
// The tiny font: 3 by 5, for the legend.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["111", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "111", "100", "111"],
  F: ["111", "100", "111", "100", "100"],
  I: ["111", "010", "010", "010", "111"],
  N: ["110", "101", "101", "101", "101"],
  O: ["111", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  X: ["101", "101", "010", "101", "101"],
  " ": ["000", "000", "000", "000", "000"],
};

/** Writes `text` with its left edge at x, top at y. */
export function stamp(grid: Grid, text: string, x: number, y: number, slot: number) {
  let cx = x;
  for (const ch of text) {
    const rows = FONT[ch] ?? FONT[" "];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === "1") grid.set(cx + i, y + j, slot);
    cx += 4;
  }
}

export function textWidth(text: string): number {
  return text.length * 4 - 1;
}

/** Hex of the top 32 bits of the seed, upper case, eight characters. */
export function fingerprint(seed: bigint): string {
  return ((seed >> 32n) & 0xffffffffn).toString(16).toUpperCase().padStart(8, "0");
}

export function roman(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let s = "";
  for (const [v, r] of table) while (n >= v) { s += r; n -= v; }
  return s;
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

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
  /** True between the mint and the VRF answer: no seed yet, the coin is drawn sealed. */
  sealed?: boolean;
};

export type Coin = {
  svg: string;
  traits: Traits;
  design: Design;
  grid: Grid;
  colors: string[];
  /** Colors for the site: the ground and the ink that reads on it. */
  palette: { bg: string; fg: string };
  masterName: string;
  yieldLevel: number;
};

export const inCoin = (p: Px) => p.r <= RADIUS;

function groundColor(ground: Ground, m: Material): string {
  switch (ground) {
    case "Night": return "#0d0d10";
    case "Paper": return "#ece8df";
    case "Tinted": return m.dark;
  }
}

export function renderCoin(input: CoinInput): Coin {
  if (input.sealed) return renderSealed(input);
  const design = designOf(input.seed);
  if (input.master >= 0) return renderMaster(input, design);
  const traits = traitsOf(design);
  const m = MATERIALS[design.material];
  const inverted = traits.anomaly === "Inverted";
  const colors = [
    groundColor(traits.ground, m),
    inverted ? m.dark : m.base,
    inverted ? m.base : m.light,
    inverted ? m.ink : m.dark,
    inverted ? m.light : m.ink,
    ACCENTS[design.accent].color || (inverted ? m.base : m.light),
    "#ffffff",
  ];
  const grid = new Grid();
  const level = yieldLevel(input.yieldBps);
  const coreShift = traits.anomaly === "Offset Core" ? 4 : 0;
  const eclipse = traits.anomaly === "Eclipse";

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = pixel(x, y, traits.symmetry);
      let c: number;
      if (!inCoin(p)) {
        c = outside(p, design, traits, level);
      } else if (eclipse && (p.dx - 34) ** 2 + (p.dy + 34) ** 2 <= (2 * RADIUS + 1) ** 2) {
        c = SLOT.ground;
      } else if (p.r >= RADIUS - 3) {
        c = rimPixel(p, design, traits);
      } else {
        c = bodyPixel(p, design, traits);
        const cx = p.dx - 2 * coreShift;
        const cr = isqrt(cx * cx + p.dy * p.dy) >> 1;
        c = corePixel(cr, cx, p, traits, c, design);
      }
      grid.set(x, y, c);
    }
  }

  glyph(grid, design, traits, coreShift);
  crack(grid, design, traits);
  fingerprintTicks(grid, input.seed);
  legend(grid, input, traits.ground === "Paper" ? SLOT.dark : SLOT.light);

  const svg = svgOf(grid, colors);
  const night = traits.ground === "Night";
  return {
    svg,
    traits,
    design,
    grid,
    colors,
    palette: { bg: colors[0], fg: night ? colors[2] : colors[4] },
    masterName: "",
    yieldLevel: level,
  };
}

/** Pixels outside the coin: the static halo and the yield ring. */
export function outside(p: Px, d: Design, t: Traits, level: number): number {
  let c: number = SLOT.ground;
  switch (t.halo) {
    case "Ring": if (p.r === RADIUS + 2) c = SLOT.light; break;
    case "Double": if (p.r === RADIUS + 2 || p.r === RADIUS + 5) c = SLOT.light; break;
    case "Rays": if (p.r >= RADIUS + 2 && p.r <= RADIUS + 4 && (p.a & 15) === 0) c = SLOT.light; break;
    case "Dotted": if (p.r === RADIUS + 3 && (p.a & 7) === 0) c = SLOT.light; break;
  }
  if (level === 0) return c;
  // Levels 1..4: one orbit each at radius + 2, + 4, + 6, + 8, dashed at first.
  // Levels 5..8: the orbits fill in, one per level. Levels 9..12: sparks between
  // them, denser each level. Levels 13 and 14: the orbits turn to the accent.
  const k = p.r - (RADIUS + 2);
  if (p.r > RADIUS + 8) return c;
  const orbit = k >= 0 && k % 2 === 0 ? k >> 1 : -1;
  if (orbit >= 0 && orbit < (level < 4 ? level : 4)) {
    const solid = level >= 5 + orbit;
    const accent = level >= 13 + orbit || (t.anomaly === "Double Orbit" && (p.a & 7) === 0);
    if (solid || (p.a & 3) < 2) c = accent ? SLOT.accent : SLOT.light;
  } else if (level >= 9 && k >= 0) {
    const spark = hash32(p.x, p.y, d.salt + 1) % 32;
    if (spark < level - 8) c = spark === 0 ? SLOT.accent : SLOT.light;
  }
  return c;
}

function rimPixel(p: Px, d: Design, t: Traits): number {
  const outer = p.r === RADIUS;
  const lamp = p.dx + p.dy;
  let c: number = lamp < -24 ? SLOT.light : lamp > 28 ? SLOT.dark : SLOT.body;
  if (outer) c = lamp < 0 ? SLOT.light : SLOT.dark;
  if (p.r === RADIUS - 3) c = SLOT.dark;
  const inner = !outer && p.r > RADIUS - 3;
  switch (t.rim) {
    case "Smooth": break;
    case "Ridged": if (inner && (p.a & 1) === 1) c = SLOT.dark; break;
    case "Beaded": if (inner) c = (p.a & 3) === 0 ? SLOT.light : SLOT.dark; break;
    case "Segmented": if (inner && ((p.a >> 3) & 1) === 1) c = SLOT.dark; break;
    case "Toothed": if (outer && (p.a & 3) !== 0) c = SLOT.ground; else if (p.r === RADIUS - 1 && (p.a & 3) === 0) c = SLOT.light; break;
    case "Broken": {
      const gap = (d.fieldA * 16) & 255;
      const da = (p.a - gap) & 255;
      if (da < 10 || da > 246) c = SLOT.ground;
      else if (inner && ((p.a >> 3) & 1) === 1) c = SLOT.dark;
      break;
    }
  }
  if (t.anomaly === "Ghost Rim" && ((p.x + p.y) & 1) === 1) c = SLOT.ground;
  return c;
}

function bodyPixel(p: Px, d: Design, t: Traits): number {
  const s = 2 + d.density;
  let c: number = SLOT.body;
  const lamp = p.dx + p.dy;
  if (t.surface === "Polished") {
    if (lamp < -48 || (lamp < -36 && ((p.x + p.y) & 1) === 0)) c = SLOT.light;
    if (lamp > 48 || (lamp > 36 && ((p.x + p.y) & 1) === 0)) c = SLOT.dark;
  }
  let mark = false;
  switch (t.field) {
    case "Rings": mark = (p.r % (s + 1)) === 0; break;
    case "Diamonds": mark = (((p.u + p.v) >> 1) % (s + 2)) === 0; break;
    case "Lattice": mark = (((p.u >> s) + (p.v >> s)) & 1) === 1; break;
    case "Grid": mark = ((p.u >> 1) % (s + 2)) === 0 || ((p.v >> 1) % (s + 2)) === 0; break;
    case "Spokes": mark = (p.a % (2 << (s - 1))) === 0 && p.r > CORE + 1; break;
    case "Spiral": mark = (((p.r * 3 + (p.a >> (s + 1))) >> 1) & 1) === 1; break;
    case "Speckle": mark = hash32(p.u, p.v, d.salt) % 16 < (s - 1) * 2; break;
    case "Bare": mark = p.r === 13 + (d.fieldA & 3); break;
  }
  if (mark) c = SLOT.dark;
  if (t.surface === "Aged") {
    const h = hash32(p.x, p.y, d.salt + 7) % 12;
    if (h === 0) c = SLOT.dark; else if (h === 1) c = SLOT.ink;
  }
  return c;
}

function corePixel(cr: number, cx: number, p: Px, t: Traits, c: number, d: Design): number {
  if (cr > CORE) return c;
  switch (t.core) {
    case "Full": return cr === CORE ? SLOT.dark : SLOT.body;
    case "Ring": return cr === CORE ? SLOT.dark : cr >= CORE - 2 ? SLOT.light : SLOT.body;
    case "Hollow": return cr === CORE ? SLOT.dark : SLOT.ground;
    case "Aperture": return cr === CORE ? SLOT.dark : cr <= 2 ? SLOT.ground : cr === 3 ? SLOT.light : SLOT.body;
    case "Split": {
      const gap = (d.fieldA & 1) === 0 ? cx : p.dy;
      if (gap > -3 && gap < 3) return SLOT.ground;
      return cr === CORE ? SLOT.dark : SLOT.body;
    }
  }
}

/** The glyph, up to 8 by 8, on the core. Sixteen bits decide it. */
function glyph(grid: Grid, d: Design, t: Traits, shift: number) {
  if (t.glyph === "None") return;
  const bits = d.glyphBits;
  const slot = ACCENTS[d.accent].color ? SLOT.accent : t.core === "Hollow" ? SLOT.light : SLOT.ink;
  const cx = 31 + shift, cy = 31;
  const on = (i: number, j: number) => ((bits >> (i * 4 + j)) & 1) === 1;
  switch (t.glyph) {
    case "Sigil":
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        if (!on(i, j)) continue;
        grid.set(cx - i, cy - j, slot); grid.set(cx + 1 + i, cy - j, slot);
        grid.set(cx - i, cy + 1 + j, slot); grid.set(cx + 1 + i, cy + 1 + j, slot);
      }
      break;
    case "Rune":
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        if (!on(i, j)) continue;
        grid.set(cx + 1 + i, cy - j, slot);
        grid.set(cx + 1 + j, cy + 1 + i, slot);
        grid.set(cx - i, cy + 1 + j, slot);
        grid.set(cx - j, cy - i, slot);
      }
      break;
    case "Star": {
      const arm = 2 + (bits & 3);
      for (let k = -arm; k <= arm + 1; k++) { grid.set(cx + k, cy, slot); grid.set(cx + k, cy + 1, slot); grid.set(cx, cy + k, slot); grid.set(cx + 1, cy + k, slot); }
      if (bits & 4) for (let k = 1; k < arm; k++) { grid.set(cx - k, cy - k, slot); grid.set(cx + 1 + k, cy - k, slot); grid.set(cx - k, cy + 1 + k, slot); grid.set(cx + 1 + k, cy + 1 + k, slot); }
      break;
    }
    case "Cross": {
      const arm = 3 + (bits & 3);
      const w = (bits >> 2) & 1;
      for (let k = -arm; k <= arm + 1; k++) for (let q = -w; q <= 1 + w; q++) { grid.set(cx + k, cy + q, slot); grid.set(cx + q, cy + k, slot); }
      break;
    }
    case "Dot": {
      const rad = 1 + (bits & 1);
      for (let j = -rad; j <= rad + 1; j++) for (let i = -rad; i <= rad + 1; i++) {
        if (rad === 2 && (i === -2 || i === 3) && (j === -2 || j === 3)) continue;
        grid.set(cx + i, cy + j, slot);
      }
      break;
    }
  }
}

/** A fracture: a walk from the top of the coin downwards, with a few side splits. */
function crack(grid: Grid, d: Design, t: Traits) {
  if (t.surface !== "Fractured") return;
  let x = 31 + ((d.fieldA & 7) - 4), y = 9;
  for (let step = 0; step < 60 && y < 50; step++) {
    grid.set(x, y, SLOT.ink);
    const h = hash32(x, y, d.salt + 3) % 8;
    if (h < 3) x += 1; else if (h < 6) x -= 1;
    if (h !== 7) y += 1;
    if (h === 0 && y > 20) { grid.set(x + 1, y, SLOT.ink); grid.set(x + 2, y - 1, SLOT.ink); }
  }
}

/** Thirty-two pixels on the inner rim ring, one per bit of the seed's low word. */
export const TICKS: [number, number][] = (() => {
  const ring: { x: number; y: number; a: number }[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = pixel(x, y, "Quad");
    if (p.r === RADIUS - 3) ring.push({ x, y, a: p.a });
  }
  const pts: [number, number][] = [];
  for (let i = 0; i < 32; i++) {
    const want = i * 8;
    let best = ring[0], bestD = 999;
    for (const q of ring) {
      const d = Math.min((q.a - want) & 255, (want - q.a) & 255);
      if (d < bestD || (d === bestD && (q.y < best.y || (q.y === best.y && q.x < best.x)))) { best = q; bestD = d; }
    }
    pts.push([best.x, best.y]);
  }
  return pts;
})();

function fingerprintTicks(grid: Grid, seed: bigint) {
  const bits = seed & 0xffffffffn;
  for (let i = 0; i < 32; i++) {
    const [x, y] = TICKS[i];
    grid.set(x, y, ((bits >> BigInt(i)) & 1n) ? SLOT.light : SLOT.ink);
  }
}

/** Top: ONE, series, backing. Bottom: number and fingerprint, or SEALED before the seed exists. Each on a cleared band. */
function legend(grid: Grid, input: CoinInput, slot: number) {
  band(grid, `ONE ${roman(input.series)} ${input.backing}`, 1, slot);
  band(grid, `${String(input.number).padStart(5, "0")} ${input.sealed ? "SEALED" : fingerprint(input.seed)}`, 58, slot);
}

/**
 * A coin whose seed has not arrived: iron, smooth rim, full core, no glyph,
 * no ticks, the yield ring as it stands. The same for every sealed coin.
 */
function renderSealed(input: CoinInput): Coin {
  const m = MATERIALS[4];
  const colors = ["#0d0d10", m.base, m.light, m.dark, m.ink, m.light, "#ffffff"];
  const grid = new Grid();
  const level = yieldLevel(input.yieldBps);
  const design = designOf(0n);
  const quiet: Traits = { ...traitsOf(design), halo: "None", anomaly: "None", rim: "Smooth", surface: "Matte", symmetry: "Quad" };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = pixel(x, y, "Quad");
    let c: number;
    if (!inCoin(p)) c = outside(p, design, quiet, level);
    else if (p.r >= RADIUS - 3) c = rimPixel(p, design, quiet);
    else c = p.r === CORE ? SLOT.dark : SLOT.body;
    grid.set(x, y, c);
  }
  legend(grid, input, SLOT.light);
  return { svg: svgOf(grid, colors), traits: quiet, design, grid, colors, palette: { bg: colors[0], fg: colors[2] }, masterName: "", yieldLevel: level };
}

function band(grid: Grid, text: string, y: number, slot: number) {
  const w = textWidth(text);
  const x = (N - w) >> 1;
  for (let j = y - 1; j <= y + 5; j++) for (let i = x - 1; i <= x + w; i++) grid.set(i, j, SLOT.ground);
  stamp(grid, text, x, y, slot);
}

/** SVG: one path per colour, one `M x y h w v1 h-w z` box per run of that colour, crisp edges. */
export function svgOf(grid: Grid, colors: string[]): string {
  const runs: string[] = colors.map(() => "");
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const v = grid.g[y * N + x];
      let w = 1;
      while (x + w < N && grid.g[y * N + x + w] === v) w++;
      if (v !== 0) runs[v] += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  }
  let paths = "";
  for (let v = 1; v < colors.length; v++) if (runs[v]) paths += `<path fill="${colors[v]}" d="${runs[v]}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><rect width="${N}" height="${N}" fill="${colors[0]}"/>${paths}</svg>`;
}

// ---------------------------------------------------------------------------
// Master coins.
// ---------------------------------------------------------------------------

import { MASTERS, masterPixel, type Master } from "./masters.ts";

export { MASTERS };

function renderMaster(input: CoinInput, design: Design): Coin {
  const recipe: Master = MASTERS[input.master];
  const traits = traitsOf(design);
  const level = yieldLevel(input.yieldBps);
  const colors = [recipe.bg, recipe.body, recipe.light, recipe.dark, recipe.ink, recipe.accent, "#ffffff", recipe.extra1, recipe.extra2, recipe.extra3];
  const grid = new Grid();
  const quiet: Traits = { ...traits, halo: "None", anomaly: "None" };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = pixel(x, y, recipe.symmetry);
    grid.set(x, y, inCoin(p) ? masterPixel(recipe, p, design) : outside(p, design, quiet, level));
  }
  fingerprintTicks(grid, input.seed);
  legend(grid, input, recipe.bg === "#ece8df" ? SLOT.dark : SLOT.light);
  return {
    svg: svgOf(grid, colors),
    traits: { ...traits, material: recipe.material, anomaly: "None", accent: "None", halo: "None" },
    design,
    grid,
    colors,
    palette: { bg: recipe.bg, fg: recipe.light },
    masterName: recipe.name,
    yieldLevel: level,
  };
}
