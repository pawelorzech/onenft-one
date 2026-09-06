/**
 * The fifty Master Coins: twenty-five compositions, each in two palettes.
 * A composition is a per-pixel rule over the same integer offsets coin.ts
 * uses, so the Solidity port is one more switch in the same loop.
 */
import { MATERIALS } from "./tables.ts";
import { RADIUS, CORE, SLOT, hash32, isqrt, type Px, type Design, type Symmetry } from "./coin.ts";

export type Mode =
  | "void" | "eclipse" | "singularity" | "mobius" | "prism" | "supernova" | "blacksun"
  | "mirror" | "zero" | "fracture" | "genesis" | "infinite" | "lattice" | "spiral"
  | "checker" | "target" | "hourglass" | "cross" | "orbiter" | "maze" | "pulse"
  | "ziggurat" | "comet" | "eye" | "crown";

export type Master = {
  name: string;
  mode: Mode;
  material: string;
  symmetry: Symmetry;
  bg: string;
  body: string;
  light: string;
  dark: string;
  ink: string;
  accent: string;
  extra1: string;
  extra2: string;
  extra3: string;
  a: number;
  b: number;
};

const NIGHT = "#0d0d10";
const PAPER = "#ece8df";

function mat(name: string) {
  const m = MATERIALS.find((x) => x.name === name);
  if (!m) throw new Error(`no material ${name}`);
  return m;
}

/** A recipe from a material, a ground, an accent and up to three extra colours. */
function M(name: string, mode: Mode, material: string, symmetry: Symmetry, bg: string, accent: string, a = 0, b = 0, extras: string[] = []): Master {
  const m = mat(material);
  return {
    name, mode, material, symmetry, bg, accent, a, b,
    body: m.base, light: m.light, dark: m.dark, ink: m.ink,
    extra1: extras[0] ?? m.light, extra2: extras[1] ?? m.dark, extra3: extras[2] ?? accent,
  };
}

export const MASTERS: readonly Master[] = [
  M("Genesis",      "genesis",     "Gold",      "Octant", NIGHT, "#ffffff", 4, 6),
  M("The Void",     "void",        "Obsidian",  "Quad",   NIGHT, "#ffffff", 9, 0),
  M("Eclipse",      "eclipse",     "Gold",      "Mirror", NIGHT, "#ffffff", 14, 0),
  M("Singularity",  "singularity", "Iron",      "Quad",   NIGHT, "#ffffff", 140, 0),
  M("Möbius",       "mobius",      "Silver",    "Quad",   NIGHT, "#3a8ae6", 40, 16),
  M("Prism",        "prism",       "Ivory",     "Quad",   PAPER, "#d23b45", 5, 0, ["#3a8ae6", "#f5b82e", "#4fd1a0"]),
  M("Supernova",    "supernova",   "Amber",     "Octant", NIGHT, "#ffffff", 8, 16),
  M("Black Sun",    "blacksun",    "Obsidian",  "Quad",   PAPER, "#f5b82e", 15, 0),
  M("The Mirror",   "mirror",      "Silver",    "Mirror", NIGHT, "#ffffff", 0, 0),
  M("Zero",         "zero",        "Ivory",     "Quad",   NIGHT, "#d23b45", 10, 16),
  M("Infinite",     "infinite",    "Cobalt",    "Quad",   NIGHT, "#ffffff", 18, 8),
  M("Fracture",     "fracture",    "Jade",      "Quad",   NIGHT, "#ffffff", 5, 12),
  M("Lattice",      "lattice",     "Copper",    "Quad",   NIGHT, "#ffffff", 5, 0),
  M("Spiral",       "spiral",      "Verdigris", "Quad",   NIGHT, "#ffffff", 6, 0),
  M("Vertex",       "checker",     "Iron",      "Quad",   PAPER, "#d23b45", 3, 0),
  M("Lodestar",     "target",      "Silver",    "Quad",   NIGHT, "#f5b82e", 3, 0),
  M("Meridian",     "hourglass",   "Copper",    "Quad",   NIGHT, "#ffffff", 0, 0),
  M("Obelisk",      "cross",       "Iron",      "Quad",   NIGHT, "#ffffff", 5, 0),
  M("Oracle",       "orbiter",     "Ivory",     "Quad",   NIGHT, "#9a6ee6", 14, 64),
  M("Labyrinth",    "maze",        "Bronze",    "Quad",   NIGHT, "#ffffff", 2, 3),
  M("Radiance",     "pulse",       "Amber",     "Quad",   PAPER, "#ffffff", 0, 0),
  M("Ziggurat",     "ziggurat",    "Bronze",    "Quad",   NIGHT, "#f5b82e", 2, 0),
  M("Comet",        "comet",       "Cobalt",    "Quad",   NIGHT, "#ffffff", 0, 0),
  M("Oculus",       "eye",         "Jade",      "Quad",   NIGHT, "#f5b82e", 0, 0),
  M("Crown",        "crown",       "Gold",      "Mirror", NIGHT, "#d23b45", 16, 0),
  M("Alpha",        "genesis",     "Silver",    "Octant", PAPER, "#3a8ae6", 3, 5),
  M("Abyss",        "void",        "Verdigris", "Quad",   NIGHT, "#4fd1a0", 5, 1),
  M("Umbra",        "eclipse",     "Iron",      "Mirror", PAPER, "#d23b45", 10, 1),
  M("Cipher",       "singularity", "Obsidian",  "Quad",   NIGHT, "#4fd1a0", 90, 1),
  M("Tide",         "mobius",      "Verdigris", "Quad",   PAPER, "#ffffff", 36, 20),
  M("Aurora",       "prism",       "Cobalt",    "Quad",   NIGHT, "#4fd1a0", 4, 1, ["#9a6ee6", "#3a8ae6", "#f3d2d9"]),
  M("Quasar",       "supernova",   "Cobalt",    "Octant", NIGHT, "#ffffff", 4, 32),
  M("Corona",       "blacksun",    "Gold",      "Quad",   NIGHT, "#ffffff", 13, 1),
  M("Antimatter",   "mirror",      "Obsidian",  "Mirror", PAPER, "#ffffff", 1, 0),
  M("Monolith",     "zero",        "Obsidian",  "Quad",   PAPER, "#ffffff", 6, 18),
  M("Ouroboros",    "infinite",    "Gold",      "Quad",   NIGHT, "#d23b45", 16, 6),
  M("Relic",        "fracture",    "Bronze",    "Quad",   PAPER, "#ffffff", 7, 10),
  M("Tessellation", "lattice",     "Ivory",     "Quad",   NIGHT, "#3a8ae6", 4, 1),
  M("Helix",        "spiral",      "Rose",      "Quad",   NIGHT, "#ffffff", 4, 1),
  M("Keystone",     "checker",     "Jade",      "Quad",   NIGHT, "#f5b82e", 2, 1),
  M("Pulsar",       "target",      "Cobalt",    "Quad",   PAPER, "#d23b45", 2, 1),
  M("Equinox",      "hourglass",   "Jade",      "Quad",   PAPER, "#ffffff", 1, 0),
  M("Anvil",        "cross",       "Bronze",    "Quad",   PAPER, "#d23b45", 4, 1),
  M("Aether",       "orbiter",     "Silver",    "Quad",   NIGHT, "#3a8ae6", 12, 32),
  M("Enigma",       "maze",        "Obsidian",  "Quad",   NIGHT, "#4fd1a0", 2, 2),
  M("Ember",        "pulse",       "Copper",    "Quad",   NIGHT, "#f5b82e", 1, 0),
  M("Zenith",       "ziggurat",    "Gold",      "Quad",   PAPER, "#ffffff", 3, 1),
  M("Nadir",        "comet",       "Obsidian",  "Quad",   NIGHT, "#9a6ee6", 1, 0),
  M("Omega",        "eye",         "Rose",      "Quad",   PAPER, "#2d3138", 1, 0),
  M("Halcyon",      "crown",       "Rose",      "Mirror", NIGHT, "#f5b82e", 12, 1),
];

/** The default rim, shared by every master: a lit outer edge and a dark inner line. */
function rim(p: Px): number {
  if (p.r === RADIUS) return p.dx + p.dy < 0 ? SLOT.light : SLOT.dark;
  if (p.r === RADIUS - 3) return SLOT.dark;
  return p.dx + p.dy < -24 ? SLOT.light : p.dx + p.dy > 28 ? SLOT.dark : SLOT.body;
}

/** The colour slot of a pixel inside the coin. */
export function masterPixel(m: Master, p: Px, d: Design): number {
  if (p.r >= RADIUS - 3 && m.mode !== "zero" && m.mode !== "blacksun") return rim(p);
  const { r, dx, dy, ax, ay, a } = p;
  const lamp = dx + dy;
  switch (m.mode) {
    case "void": {
      if (ax <= 1 && dy >= -2 * m.a - 1 && dy <= -2 * m.a + 1) return SLOT.accent;
      if (m.b && r === 2) return SLOT.light;
      return r % 7 === 0 ? SLOT.dark : SLOT.body;
    }
    case "eclipse": {
      const off = 2 * m.a;
      const shadow = (dx - off) ** 2 + (dy + (m.b ? off : 0)) ** 2 <= (2 * 17) ** 2;
      if (r <= 18) return shadow ? SLOT.ground : r === 18 ? SLOT.accent : SLOT.light;
      return (a & 7) === 0 ? SLOT.light : SLOT.body;
    }
    case "singularity": {
      if (r <= 1) return SLOT.accent;
      const band = Math.floor(m.a / (r + 2));
      return (band & 1) === (m.b & 1) ? SLOT.dark : SLOT.light;
    }
    case "mobius": {
      const A = m.a, B = m.b;
      const e1 = dx * dx * B * B + dy * dy * A * A;
      const e2 = dy * dy * B * B + dx * dx * A * A;
      const lim = A * A * B * B;
      const inner = Math.floor((lim * 9) / 16);
      const in1 = e1 <= lim && e1 >= inner;
      const in2 = e2 <= lim && e2 >= inner;
      if (in1 && in2) return dx * dy > 0 ? SLOT.light : SLOT.dark;
      if (in1) return SLOT.light;
      if (in2) return SLOT.dark;
      if (r <= 3) return SLOT.accent;
      return SLOT.body;
    }
    case "prism": {
      if (r <= 5) return r === 5 ? SLOT.dark : SLOT.body;
      const sectors = [SLOT.accent, SLOT.extra1, SLOT.extra2, SLOT.extra3, SLOT.light, SLOT.dark];
      const idx = Math.floor((a * m.a) / 64) % sectors.length;
      if (m.b && (a * m.a) % 64 < 2) return SLOT.ink;
      return sectors[idx];
    }
    case "supernova": {
      if (r <= 2) return SLOT.accent;
      if (r <= 5) return SLOT.light;
      const long = a % m.b < 2;
      const short = a % m.a < 2 && r < 14;
      return long || short ? SLOT.light : SLOT.body;
    }
    case "blacksun": {
      if (r <= m.a) return r === m.a ? SLOT.accent : SLOT.dark;
      if (r <= m.a + 4) return ((p.x + p.y) & 1) === 0 ? SLOT.light : m.b ? SLOT.accent : SLOT.body;
      if (r <= RADIUS) return (a & 3) === 0 ? SLOT.light : r === RADIUS ? SLOT.dark : SLOT.body;
      return SLOT.body;
    }
    case "mirror": {
      const right = m.a === 0 ? dx > 0 : m.a === 1 ? dy > 0 : dx + dy > 0;
      if (r <= CORE) return r === CORE ? SLOT.accent : right ? SLOT.body : SLOT.dark;
      return right ? SLOT.dark : SLOT.body;
    }
    case "zero": {
      if (r >= RADIUS - 1) return SLOT.dark;
      if (r >= m.a && r <= m.b) return r === m.a || r === m.b ? SLOT.ink : SLOT.dark;
      if (r <= 1) return SLOT.accent;
      return SLOT.body;
    }
    case "fracture": {
      const step = Math.floor(256 / m.a);
      if (a % step < 3 && r > 3) return SLOT.ground;
      if (r === m.b && (a & 15) < 11) return SLOT.ground;
      if (r <= 2) return SLOT.accent;
      return lamp < -20 ? SLOT.light : SLOT.body;
    }
    case "genesis": {
      if (r <= 3) return SLOT.accent;
      if (r <= CORE) return (a & 31) < 4 ? SLOT.accent : SLOT.light;
      if (r === CORE + 1) return SLOT.dark;
      if (((p.u + p.v) >> 1) % m.b === 0) return SLOT.light;
      if (r % m.a === 0) return SLOT.dark;
      return SLOT.body;
    }
    case "infinite": {
      const off = 2 * m.a;
      const r1 = isqrt((dx - off) ** 2 + dy * dy) >> 1;
      const r2 = isqrt((dx + off) ** 2 + dy * dy) >> 1;
      const R = m.a - 1;
      const on1 = r1 >= R - 1 && r1 <= R;
      const on2 = r2 >= R - 1 && r2 <= R;
      if (on1 && on2) return SLOT.accent;
      if (on1 || on2) return SLOT.light;
      if (r1 < R - 1 || r2 < R - 1) return m.b ? SLOT.dark : SLOT.body;
      return SLOT.body;
    }
    case "lattice": {
      const gx = (ax >> 1) % m.a === 0, gy = (ay >> 1) % m.a === 0;
      if (gx && gy) return m.b ? SLOT.accent : SLOT.light;
      if (gx || gy) return SLOT.dark;
      return SLOT.body;
    }
    case "spiral": {
      if (r <= 2) return SLOT.accent;
      const turn = Math.floor((r * 4 + (a >> 2)) / m.a);
      return (turn & 1) === 0 ? (m.b ? SLOT.light : SLOT.dark) : SLOT.body;
    }
    case "checker": {
      const cell = m.a + 1;
      const on = (((dx + 63) >> cell) + ((dy + 63) >> cell)) & 1;
      if (r <= 2) return SLOT.accent;
      return on === 0 ? (m.b ? SLOT.dark : SLOT.light) : m.b ? SLOT.body : SLOT.dark;
    }
    case "target": {
      if (r <= 2) return SLOT.accent;
      const band = Math.floor(r / m.a);
      return (band & 1) === m.b ? SLOT.light : SLOT.dark;
    }
    case "hourglass": {
      if (r <= 2) return SLOT.accent;
      const wide = m.a ? ay > ax : ax > ay;
      if (ax - ay > -2 && ax - ay < 2) return SLOT.ink;
      return wide ? SLOT.dark : SLOT.light;
    }
    case "cross": {
      const w = 2 * m.a;
      if (ax < w && ay < w) return SLOT.accent;
      if (ax < w || ay < w) return SLOT.light;
      if (m.b && ax - ay > -2 && ax - ay < 2) return SLOT.dark;
      return SLOT.body;
    }
    case "orbiter": {
      if (r <= 4) return r === 4 ? SLOT.dark : SLOT.light;
      const orbit = m.a;
      const sat = r >= orbit - 1 && r <= orbit + 1 && a % m.b < 6;
      if (sat) return SLOT.accent;
      if (r === orbit) return SLOT.dark;
      return SLOT.body;
    }
    case "maze": {
      if (r <= 2) return SLOT.accent;
      const cx = p.u >> m.a, cy = p.v >> m.a;
      const h = hash32(cx, cy, d.salt * 0 + 77) % m.b;
      return h === 0 ? SLOT.dark : SLOT.body;
    }
    case "pulse": {
      const fib = [1, 2, 3, 5, 8, 13, 21];
      if (r <= 0) return SLOT.accent;
      for (const f of fib) if (r === f) return m.a ? SLOT.light : SLOT.dark;
      return m.a ? SLOT.dark : SLOT.body;
    }
    case "ziggurat": {
      const box = (ax > ay ? ax : ay) >> 1;
      if (box <= 2) return SLOT.accent;
      const band = Math.floor(box / m.a);
      return (band & 1) === m.b ? SLOT.light : SLOT.dark;
    }
    case "comet": {
      const head = (dx - 20) ** 2 + (dy - 20) ** 2 <= (2 * 5) ** 2;
      if (head) return SLOT.accent;
      const along = dx < 20 && dy < 20 && dx > -46 && dy > -46;
      const width = Math.max(2, 14 - ((20 - dx) >> 2));
      const across = dx - dy;
      if (along && across > -width && across < width) return m.a ? SLOT.light : ((p.x + p.y) & 1) === 0 ? SLOT.light : SLOT.body;
      return SLOT.body;
    }
    case "eye": {
      const lens = dx * dx * 144 + dy * dy * 1296 <= 186624;
      if (r <= 3) return SLOT.ink;
      if (r <= 6) return r === 6 ? SLOT.dark : SLOT.accent;
      if (lens) return m.a ? SLOT.dark : SLOT.light;
      const edge = dx * dx * 144 + dy * dy * 1296 <= 230000;
      if (edge) return SLOT.dark;
      return SLOT.body;
    }
    case "crown": {
      if (r <= 3) return SLOT.accent;
      if (ay < 4) return SLOT.dark;
      if (dy < 0 && a % m.a < 3) return SLOT.light;
      if (dy > 0 && m.b && r % 4 === 0) return SLOT.dark;
      return SLOT.body;
    }
  }
}
