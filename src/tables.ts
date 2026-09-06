export type Material = {
  name: string;
  base: string;
  light: string;
  dark: string;
  ink: string;
};

export const MATERIALS: readonly Material[] = [
  { name: "Silver",    base: "#b9bec6", light: "#eef0f3", dark: "#6b7280", ink: "#2d3138" },
  { name: "Copper",    base: "#b8734a", light: "#e8b58e", dark: "#7a4528", ink: "#3b2114" },
  { name: "Bronze",    base: "#9a7a48", light: "#d6b986", dark: "#5c4624", ink: "#2f2412" },
  { name: "Gold",      base: "#d0a640", light: "#f5dc8a", dark: "#8a6a1e", ink: "#4a370c" },
  { name: "Iron",      base: "#6f7276", light: "#a6a9ad", dark: "#44474b", ink: "#1c1d1f" },
  { name: "Ivory",     base: "#e9e0cc", light: "#fbf7ee", dark: "#b3a483", ink: "#5b5040" },
  { name: "Cobalt",    base: "#3956a3", light: "#8ea4dd", dark: "#243a70", ink: "#101a38" },
  { name: "Rose",      base: "#d69aa8", light: "#f3d2d9", dark: "#9a5f6d", ink: "#4d2a33" },
  { name: "Jade",      base: "#5f9d7c", light: "#a8d6bd", dark: "#3b6a52", ink: "#1a3328" },
  { name: "Obsidian",  base: "#26242c", light: "#4e4a56", dark: "#141318", ink: "#8a8494" },
  { name: "Amber",     base: "#d98a2b", light: "#f7c67a", dark: "#8f5717", ink: "#4a2c0a" },
  { name: "Verdigris", base: "#4f8f8b", light: "#9dcfca", dark: "#2f5f5c", ink: "#153331" },
];
