/**
 * Page HTML. The page has no palette of its own: it wears the ground and ink
 * of the newest coin. No light or dark mode.
 *
 * Copy rules: plain words, active voice, no adverbs, no em dashes, nothing a
 * reader could misunderstand. Every number about odds, levels and classes
 * comes from coin.ts and preview.ts, not from prose.
 */
import {
  MATERIALS, MATERIAL_WEIGHTS, GROUNDS, GROUND_WEIGHTS, RIMS, RIM_WEIGHTS, FIELDS, FIELD_WEIGHTS, SYMMETRIES, SYMMETRY_WEIGHTS,
  CORES, CORE_WEIGHTS, GLYPHS, GLYPH_WEIGHTS, SURFACES, SURFACE_WEIGHTS, HALOS, HALO_WEIGHTS, ACCENTS, ACCENT_WEIGHTS,
  ANOMALIES, ANOMALY_WEIGHTS, MASTERS, YIELD_STEPS, fingerprint, roman, type Coin, type Traits,
} from "./coin.ts";
import { SERIES_SIZE, MASTERS_PER_SERIES, FOUNDER_PER_SERIES, BACKINGS, PREVIEW_SUPPLY, previewCoin, previewInput, mastersFound } from "./preview.ts";

export const SITE = "one.onenft.click";
export const NAME = "ONE";
export const REPO = "https://github.com/pawelorzech/onenft-one";
export const PARENT = "onenft.click";
export const FEE_PCT = 10;
export const PREVIEW = true;
/** "10, 25 or 50". */
export const BACKING_LIST = `${BACKINGS.slice(0, -1).join(", ")} or ${BACKINGS[BACKINGS.length - 1]}`;

export type Colors = { bg: string; fg: string };

export const num = (n: number | bigint) => n.toLocaleString("en-US");
export function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export const pctOf = (p: number) => (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)) + "%";
export const pad5 = (n: number) => String(n).padStart(5, "0");
/** Basis points as a percent with one decimal: 1234 gives "12.3%". */
export const bpsPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
/** USDC with six decimals shown as dollars and cents. */
export const usdc = (units: number) => `${(units / 1e6).toFixed(2)} USDC`;

// ---- colours: the page wears the coin

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}
function luminance(c: string): number {
  const ch = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hex(c).map((x) => ch(x / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function pulled(fg: string, bg: string, from: number, min: number): string {
  for (let t = from; t > 0; t -= 0.01) {
    const c = mix(fg, bg, t);
    if (contrast(c, bg) >= min) return c;
  }
  return fg;
}
export function textFor(fg: string, bg: string): string {
  if (contrast(fg, bg) >= 4.5) return fg;
  const ink = contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, ink, t);
    if (contrast(c, bg) >= 4.5) return c;
  }
  return ink;
}
export function cssVars(p: Colors): string {
  const fg = textFor(p.fg, p.bg);
  return `--bg:${p.bg};--fg:${fg};--muted:${pulled(fg, p.bg, 0.38, 4.5)};--edge:${pulled(fg, p.bg, 0.6, 3)};--line:${mix(fg, p.bg, 0.8)};--soft:${mix(fg, p.bg, 0.93)}`;
}

function css(p: Colors): string {
  return `
:root{${cssVars(p)}}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{background:var(--bg);color:var(--fg);font-family:"Newsreader",Georgia,serif;font-size:17px;line-height:1.5}
body{margin:0;min-height:100vh}
a{color:inherit}
a:focus-visible,button:focus-visible{outline:3px solid var(--fg);outline-offset:3px}
.skip{position:absolute;left:-999px;top:8px;background:var(--fg);color:var(--bg);padding:8px 14px;font-weight:700;z-index:9}
.skip:focus{left:8px}
.syne{font-family:"Syne",system-ui,sans-serif}
.page{display:grid;grid-template-columns:360px minmax(0,1fr);min-height:100vh}
aside{border-right:1px solid var(--line);padding:38px 32px}
aside .stick{position:sticky;top:38px;display:flex;flex-direction:column;gap:28px}
.mark{font-weight:800;font-size:20px;letter-spacing:-.01em;text-decoration:none}
h1{font-weight:800;font-size:33px;line-height:.96;letter-spacing:-.045em;margin:0}
h2{font-weight:800;font-size:30px;line-height:1;letter-spacing:-.03em;margin:0}
h3{font-weight:700;font-size:18px;margin:0}
.lead{color:var(--muted);margin:0}
.facts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line);max-width:1120px}
.facts li{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 20px 16px;display:flex;flex-direction:column;gap:6px;min-width:0}
.facts .fig{font-weight:800;font-size:28px;line-height:1;letter-spacing:-.03em;white-space:nowrap}
.facts .lab{font-size:15px;color:var(--muted);line-height:1.35}
hr{border:0;border-top:1px solid var(--line);margin:0;width:100%}
.small{font-size:15px;color:var(--muted)}
.cta{display:flex;align-items:center;justify-content:center;min-height:58px;padding:0 16px;background:var(--fg);color:var(--bg);text-decoration:none;font-weight:700;font-size:18px;text-align:center}
.cta.ghost{background:transparent;color:var(--fg);border:1px solid var(--fg)}
.cta[aria-disabled="true"]{opacity:.55;cursor:default}
.note{padding:12px 16px;border:1px solid var(--edge);font-size:15px;margin:0}
.px,.px svg,.px img{image-rendering:pixelated}
.hero{padding:38px 34px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:minmax(0,396px) minmax(280px,1fr);gap:34px;align-items:start}
.hero .coinimg{width:100%;max-width:396px;aspect-ratio:1;box-shadow:0 0 0 1px var(--line);display:block}
.hero .meta{display:flex;flex-direction:column;gap:14px}
.num{font-weight:800;font-size:62px;line-height:.95;letter-spacing:-.03em}
.row{display:flex;align-items:center;gap:22px;padding:0 34px;min-height:128px;border-bottom:1px solid var(--line);text-decoration:none}
.row:hover{background:var(--soft)}
.row img{width:92px;height:92px;display:block;flex-shrink:0;box-shadow:0 0 0 1px var(--line)}
.row .n{font-weight:700;font-size:23px}
.row .sub{color:var(--muted);font-size:15px}
.tag{display:inline-block;padding:1px 7px;border:1px solid var(--line);font-size:13px;color:var(--muted);margin-left:8px;vertical-align:middle}
.tag.master{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.tag.founder{border-color:var(--fg);color:var(--fg)}
.counts{display:flex;gap:34px;flex-wrap:wrap;padding:22px 34px;border-bottom:1px solid var(--line)}
.counts b{display:block;font-weight:700;font-size:26px;line-height:1}
footer{padding:26px 34px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;color:var(--muted);font-size:16px}
footer nav,.nav{display:flex;gap:6px 20px;flex-wrap:wrap}
.step{display:flex;gap:2px}
.step a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;font-size:22px;line-height:1;color:var(--muted);text-decoration:none;box-shadow:0 0 0 1px var(--line)}
.step a:hover{color:var(--fg);background:var(--soft)}
.step .gone{display:inline-flex;min-width:44px;min-height:44px;box-shadow:0 0 0 1px var(--line);opacity:.35}
.prose{max-width:680px;padding:38px 34px;display:flex;flex-direction:column;gap:22px}
.prose h2{margin-top:22px}
.prose p,.prose ul{margin:0}
.prose code{font-family:ui-monospace,Menlo,monospace;font-size:.92em}
.single{padding:38px 34px;display:flex;flex-direction:column;gap:22px;max-width:760px}
.single .coinimg{width:100%;max-width:512px;aspect-ratio:1;box-shadow:0 0 0 1px var(--line);display:block}
.top{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.top nav{display:flex;gap:4px 18px;flex-wrap:wrap;font-size:16px;color:var(--muted)}
.wide{padding:38px 34px;display:flex;flex-direction:column;gap:28px;max-width:1180px}
.wide p{margin:0}
.strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.strip a,.strip div{text-decoration:none}
.strip img{width:100%;aspect-ratio:1;display:block;box-shadow:0 0 0 1px var(--line)}
.strip .cap{font-size:14px;color:var(--muted);margin-top:6px}
.strip .cap b{color:var(--fg)}
.strip .gone img{opacity:.35}
table.tr{border-collapse:collapse;width:100%;max-width:720px;font-size:16px}
table.tr th,table.tr td{text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid var(--line);vertical-align:top}
table.tr th{font-weight:400;color:var(--muted);font-size:14px}
table.tr td.n{text-align:right;font-family:"Syne",system-ui,sans-serif;font-weight:700;white-space:nowrap}
.traits{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:16px;max-width:460px;margin:0}
.traits dt{color:var(--muted);margin:0}
.traits dd{margin:0}
.traits .odds{color:var(--muted);font-size:14px}
.money{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);max-width:640px}
.money div{background:var(--bg);padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.money b{font-weight:800;font-size:22px;line-height:1;font-family:"Syne",system-ui,sans-serif}
.money span{font-size:14px;color:var(--muted)}
.crumb{margin:0}
.crumb ol{list-style:none;margin:0;padding:0;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.crumb li{display:flex;gap:10px;align-items:baseline}
.crumb a,.crumb span[aria-current]{display:inline-flex;align-items:center;min-height:44px}
.crumb .hub{color:var(--muted)}
.crumb .sep{color:var(--line);font-weight:800;font-size:20px}
.crumb span[aria-current]{color:var(--muted);font-size:16px;font-family:"Syne",system-ui,sans-serif;font-weight:700}
@media (min-width:901px){
 aside .crumb ol,aside .crumb li{flex-direction:column;gap:2px;align-items:flex-start}
 aside .crumb .sep{display:none}
 aside .crumb a,aside .crumb span[aria-current]{min-height:0}
 aside .crumb .hub{font-size:15px;font-weight:700}
}
.dl{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line)}
.dl .lab{color:var(--muted);font-size:15px;margin-right:6px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 16px;border:1px solid var(--fg);color:var(--fg);text-decoration:none;font-weight:700;font-size:15px;font-family:"Syne",system-ui,sans-serif;background:transparent}
.top nav a,.nav a,footer nav a{font-family:"Syne",system-ui,sans-serif;font-weight:700;font-size:14px;letter-spacing:.01em;text-decoration:none;color:var(--muted);display:inline-flex;align-items:center;min-height:44px}
.top nav a:hover,.nav a:hover,footer nav a:hover{color:var(--fg);text-decoration:underline;text-underline-offset:4px}
.top nav,footer nav{gap:2px 24px}
.levels{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
.levels img{width:100%;aspect-ratio:1;display:block;box-shadow:0 0 0 1px var(--line)}
.levels .cap{font-size:14px;color:var(--muted);margin-top:6px}
@media (max-width:1180px){.hero{display:block}.hero .coinimg{margin-bottom:20px}}
@media (max-width:900px){
 .page{grid-template-columns:1fr}
 aside{border-right:0;border-bottom:1px solid var(--line);padding:18px 20px}
 aside .stick{position:static;gap:16px}
 h1{font-size:38px}
 .hero{padding:20px}
 .num{font-size:44px}
 .row{min-height:64px;padding:14px 20px;gap:16px}
 .row img{width:56px;height:56px}
 .counts{padding:16px 20px;gap:24px}
 footer,.prose,.single,.wide{padding:20px}
}
@media (max-width:360px){h1{font-size:29px}.mark{font-size:17px}}
@media (prefers-reduced-motion:no-preference){.row{transition:background .15s}}
`;
}

const UMAMI_URL = process.env.UMAMI_URL ?? "";
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID ?? "";
const ANALYTICS = UMAMI_URL && UMAMI_WEBSITE_ID ? `<script defer src="${esc(UMAMI_URL)}/script.js" data-website-id="${esc(UMAMI_WEBSITE_ID)}"></script>` : "";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Newsreader:opsz,wght@6..72,400&display=swap">`;
export const DESC = `${num(SERIES_SIZE)} pixel coins per series on Base, ${MASTERS_PER_SERIES} one of ones, every coin backed by ${BACKINGS.join(", ")} USDC that earns yield. Burn to redeem.`;

export function layout(title: string, p: Colors, body: string, image = "/newest.png", path = "/", description?: string): string {
  const alt = title.replace(/ \| .*$/, "") + " on " + SITE;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description ?? DESC)}">
<meta name="theme-color" content="${p.bg}">
<link rel="icon" href="/newest.svg" type="image/svg+xml">
<link rel="canonical" href="https://${SITE}${esc(path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description ?? DESC)}">
<meta property="og:image" content="https://${SITE}${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="https://${SITE}${esc(path)}">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description ?? DESC)}">
<meta name="twitter:image" content="https://${SITE}${esc(image)}">
${FONTS}
${ANALYTICS}
<style>${css(p)}</style>
</head>
<body><a class="skip" href="#main">Skip to content</a>${body}</body>
</html>`;
}

export function crumb(current?: string): string {
  const here = current ? `<li><span class="sep syne" aria-hidden="true">/</span><span aria-current="page">${esc(current)}</span></li>` : "";
  return `<nav class="crumb" aria-label="Breadcrumb"><ol><li><a class="mark syne hub" href="https://${PARENT}">${PARENT}</a></li><li><span class="sep syne" aria-hidden="true">/</span><a class="mark syne" href="/"${current ? "" : ' aria-current="page"'}>${NAME}</a></li>${here}</ol></nav>`;
}
export const MENU: [string, string][] = [["/coins", "All coins"], ["/masters", "Master Coins"], ["/traits", "Traits"], ["/yield", "Yield ring"], ["/how", "How it works"]];
export function menu(extra: [string, string][] = []): string {
  return [...MENU, ...extra].map(([h, t]) => `<a href="${h}">${t}</a>`).join("");
}
export function topBar(current?: string): string {
  return `<div class="top">${crumb(current)}<nav aria-label="Site">${menu([[`https://${PARENT}`, "All collections"]])}</nav></div>`;
}
export function footer(): string {
  return `<footer><nav aria-label="Footer">${menu()}<a href="/api/state">JSON</a><a href="${REPO}">Source</a><a href="https://${PARENT}">${PARENT}</a></nav><span>CC0. Not an investment product. Read <a href="/how">how it works</a> before you mint.</span></footer>`;
}
export const STEP_KEYS = `<script>
(function(){document.addEventListener('keydown',function(e){if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;var a=e.key==='ArrowLeft'?document.querySelector('a[rel=prev]'):e.key==='ArrowRight'?document.querySelector('a[rel=next]'):null;if(a){e.preventDefault();location.href=a.href}})})();
</script>`;

export function previewNote(): string {
  return PREVIEW ? `<p class="note" role="status">Preview. No contract is live yet. The coins on this site come from a simulated series with the same rules; seeds, numbers and yield are not real.</p>` : "";
}

// ---- traits and odds

type Table = { trait: string; names: readonly string[]; weights: readonly number[] };
export const TABLES: Table[] = [
  { trait: "Material", names: MATERIALS.map((m) => m.name), weights: MATERIAL_WEIGHTS },
  { trait: "Ground", names: GROUNDS, weights: GROUND_WEIGHTS },
  { trait: "Rim", names: RIMS, weights: RIM_WEIGHTS },
  { trait: "Field", names: FIELDS, weights: FIELD_WEIGHTS },
  { trait: "Symmetry", names: SYMMETRIES, weights: SYMMETRY_WEIGHTS },
  { trait: "Core", names: CORES, weights: CORE_WEIGHTS },
  { trait: "Glyph", names: GLYPHS, weights: GLYPH_WEIGHTS },
  { trait: "Surface", names: SURFACES, weights: SURFACE_WEIGHTS },
  { trait: "Halo", names: HALOS, weights: HALO_WEIGHTS },
  { trait: "Accent", names: ACCENTS.map((a) => a.name), weights: ACCENT_WEIGHTS },
  { trait: "Anomaly", names: ANOMALIES, weights: ANOMALY_WEIGHTS },
];
const KEYS: (keyof Traits)[] = ["material", "ground", "rim", "field", "symmetry", "core", "glyph", "surface", "halo", "accent", "anomaly"];

/** Percent odds of each trait value, from the weight tables. */
export function oddsOf(t: Traits): Map<string, number> {
  const m = new Map<string, number>();
  TABLES.forEach((tb, i) => {
    const total = tb.weights.reduce((a, b) => a + b, 0);
    const idx = tb.names.indexOf(String(t[KEYS[i]]));
    if (idx >= 0) m.set(tb.trait, (100 * tb.weights[idx]) / total);
  });
  return m;
}
export function oneInOf(t: Traits): string {
  let p = 1;
  for (const v of oddsOf(t).values()) p *= v / 100;
  return `1 in ${num(Math.round(1 / p))}`;
}
export function rarestOf(t: Traits): string {
  let best = { trait: "", value: "", p: 101 };
  const odds = oddsOf(t);
  TABLES.forEach((tb, i) => {
    const p = odds.get(tb.trait) ?? 100;
    if (p < best.p) best = { trait: tb.trait.toLowerCase(), value: String(t[KEYS[i]]), p };
  });
  return `${best.value} (${best.trait}, ${pctOf(best.p)})`;
}
export function attributesOf(coin: Coin, input: { backing: number; founder: boolean; series: number; yieldBps: number }) {
  const attrs: { trait_type: string; value: string | number; display_type?: string }[] = [];
  if (coin.masterName) attrs.push({ trait_type: "Master Coin", value: coin.masterName });
  TABLES.forEach((tb, i) => { if (!coin.masterName || tb.trait === "Material") attrs.push({ trait_type: tb.trait, value: String(coin.traits[KEYS[i]]) }); });
  attrs.push({ trait_type: "Series", value: roman(input.series) });
  attrs.push({ trait_type: "Backing", value: `${input.backing} USDC` });
  attrs.push({ trait_type: "Origin", value: input.founder ? "Founder" : "Public" });
  attrs.push({ trait_type: "Yield level", value: coin.yieldLevel, display_type: "number" });
  return attrs;
}
export function traitList(coin: Coin): string {
  const t = coin.traits;
  const odds = oddsOf(t);
  const rows: string[] = [];
  if (coin.masterName) {
    rows.push(`<dt>master coin</dt><dd>${esc(coin.masterName)} <span class="odds">one of ${MASTERS_PER_SERIES} in ${num(SERIES_SIZE)}</span></dd>`);
    rows.push(`<dt>material</dt><dd>${esc(t.material)}</dd>`);
  } else {
    TABLES.forEach((tb, i) => {
      const v = String(t[KEYS[i]]);
      const o = odds.get(tb.trait);
      rows.push(`<dt>${tb.trait.toLowerCase()}</dt><dd>${esc(v)}${o !== undefined ? ` <span class="odds">${pctOf(o)}</span>` : ""}</dd>`);
    });
    rows.push(`<dt>rarest</dt><dd>${esc(rarestOf(t))}<br><span class="odds">these eleven traits together: ${oneInOf(t)} coins</span></dd>`);
  }
  return `<dl class="traits">${rows.join("")}</dl>`;
}

/** The capital side of one coin. In preview the numbers are simulated. */
export function moneyBlock(input: { backing: number; yieldBps: number }, level: number): string {
  const backingUnits = input.backing * 1e6;
  const earned = Math.floor((backingUnits * input.yieldBps) / 10000);
  const fee = Math.floor((earned * FEE_PCT) / 100);
  return `<div class="money">
<div><b>${input.backing} USDC</b><span>backing, paid at mint</span></div>
<div><b>${bpsPct(input.yieldBps)}</b><span>lifetime yield over backing${PREVIEW ? " (preview)" : ""}</span></div>
<div><b>${usdc(backingUnits + earned - fee)}</b><span>redeemable by burn, after the ${FEE_PCT}% fee on yield</span></div>
<div><b>${level} of ${YIELD_STEPS.length}</b><span>yield ring level</span></div>
</div>`;
}

export function coinTags(coin: Coin, founder: boolean): string {
  return `${coin.masterName ? `<span class="tag master">1/1</span>` : ""}${founder ? `<span class="tag founder">founder</span>` : ""}`;
}
export function coinRow(n: number): string {
  const c = previewCoin(n);
  const inp = previewInput(n);
  const sub = c.masterName ? `${c.masterName}, ${c.traits.material}` : `${c.traits.material}, ${c.traits.field.toLowerCase()} field, ${c.traits.glyph.toLowerCase()} glyph`;
  return `<a class="row px" href="/coin/${n}"><img src="/coin/${n}.svg" alt="" width="92" height="92" loading="lazy"><span><span class="n syne">#${pad5(n)}</span>${coinTags(c, inp.founder)}<br><span class="sub">${esc(sub)}, ${inp.backing} USDC, yield ${bpsPct(inp.yieldBps)}</span></span></a>`;
}

// ---- pages

export function pageColors(): Colors {
  return PREVIEW_SUPPLY > 0 ? previewCoin(PREVIEW_SUPPLY).palette : { bg: "#0d0d10", fg: "#eef0f3" };
}

export function sidebar(current?: string): string {
  const found = mastersFound().size;
  return `<aside><div class="stick">
${crumb(current)}
<h1 class="syne">${num(SERIES_SIZE)} coins a series. ${MASTERS_PER_SERIES} one of ones. Every coin backed.</h1>
<p class="lead">A pixel coin drawn on chain from a random seed, and ${BACKING_LIST} USDC held in a vault that earns. Art and money never correlate: a ${BACKINGS[0]} USDC coin can be a Master Coin. Burn the coin and the backing plus its yield comes back to you.</p>
<a class="cta syne" href="/how" aria-disabled="${PREVIEW ? "true" : "false"}">${PREVIEW ? "Minting opens with the contract" : "Mint a coin"}</a>
<ul class="facts">
<li><span class="fig syne">${roman(1)}</span><span class="lab">series, ${num(SERIES_SIZE)} coins each, series without end</span></li>
<li><span class="fig syne">${num(PREVIEW_SUPPLY)}</span><span class="lab">of ${num(SERIES_SIZE)} minted${PREVIEW ? " in the preview" : ""}</span></li>
<li><span class="fig syne">${found} of ${MASTERS_PER_SERIES}</span><span class="lab">Master Coins found so far</span></li>
<li><span class="fig syne">${FEE_PCT}%</span><span class="lab">of the yield goes to the author; nothing else does</span></li>
</ul>
<nav class="nav" aria-label="Site">${menu([[`https://${PARENT}`, "All collections"]])}</nav>
</div></aside>`;
}

export function homePage(): string {
  const p = pageColors();
  const newest = PREVIEW_SUPPLY;
  const rows = Array.from({ length: Math.min(40, newest) }, (_, i) => coinRow(newest - i)).join("");
  const c = previewCoin(newest);
  const inp = previewInput(newest);
  const body = `<div class="page">${sidebar()}<main id="main">
${previewNote()}
<section class="hero"><img class="coinimg px" src="/coin/${newest}.svg" alt="Coin ${pad5(newest)}" width="396" height="396"><div class="meta">
<span class="small">Newest coin</span>
<span class="num syne">#${pad5(newest)}</span>
<div>${coinTags(c, inp.founder)}</div>
${traitList(c)}
${moneyBlock(inp, c.yieldLevel)}
<a class="btn" href="/coin/${newest}">Open the coin</a>
</div></section>
<div class="counts"><div><b class="syne">${num(newest)}</b><span class="small">minted</span></div><div><b class="syne">${num(SERIES_SIZE - newest)}</b><span class="small">left in series ${roman(1)}</span></div><div><b class="syne">${mastersFound().size}</b><span class="small">Master Coins found</span></div></div>
${rows}
<p class="small" style="padding:20px 34px"><a href="/coins">All ${num(newest)} coins</a></p>
${footer()}
</main></div>`;
  return layout(`${NAME} | ${DESC.split(".")[0]}`, p, body);
}

export function coinsPage(page: number): string {
  const p = pageColors();
  const per = 60;
  const pages = Math.max(1, Math.ceil(PREVIEW_SUPPLY / per));
  const pg = Math.min(pages, Math.max(1, page));
  const from = PREVIEW_SUPPLY - (pg - 1) * per;
  const to = Math.max(1, from - per + 1);
  const cells: string[] = [];
  for (let n = from; n >= to; n--) {
    const c = previewCoin(n);
    cells.push(`<a class="px" href="/coin/${n}"><img src="/coin/${n}.svg" alt="Coin ${pad5(n)}" loading="lazy"><div class="cap"><b>#${pad5(n)}</b> ${esc(c.masterName || c.traits.material)}</div></a>`);
  }
  const nav = `<div class="step">${pg > 1 ? `<a rel="prev" href="/coins?page=${pg - 1}" aria-label="Newer">‹</a>` : `<span class="gone"></span>`}${pg < pages ? `<a rel="next" href="/coins?page=${pg + 1}" aria-label="Older">›</a>` : `<span class="gone"></span>`}</div>`;
  const body = `<main id="main" class="wide">${topBar("All coins")}${previewNote()}<h2 class="syne">Coins ${pad5(from)} to ${pad5(to)}</h2><p class="small">Page ${pg} of ${pages}, newest first.</p>${nav}<div class="strip">${cells.join("")}</div>${nav}${footer()}${STEP_KEYS}</main>`;
  return layout(`All coins, page ${pg} | ${NAME}`, p, body, "/newest.png", `/coins?page=${pg}`);
}

export function coinPage(n: number): string {
  const c = previewCoin(n);
  const inp = previewInput(n);
  const prev = n > 1 ? `<a rel="prev" href="/coin/${n - 1}" aria-label="Coin ${pad5(n - 1)}">‹</a>` : `<span class="gone"></span>`;
  const next = n < PREVIEW_SUPPLY ? `<a rel="next" href="/coin/${n + 1}" aria-label="Coin ${pad5(n + 1)}">›</a>` : `<span class="gone"></span>`;
  const body = `<main id="main" class="single">${topBar(`#${pad5(n)}`)}${previewNote()}
<div class="step">${prev}${next}</div>
<img class="coinimg px" src="/coin/${n}.svg" alt="Coin ${pad5(n)}" width="512" height="512">
<span class="num syne">#${pad5(n)}</span>
<div>${coinTags(c, inp.founder)}<span class="small">${c.masterName ? `Master Coin ${esc(c.masterName)}` : "Procedural coin"}, series ${roman(inp.series)}, seed ${fingerprint(inp.seed)}</span></div>
${traitList(c)}
${moneyBlock(inp, c.yieldLevel)}
<p class="small">The top eight hex digits of the seed are written under the coin; the low 32 bits are the ${32} marks on the inner rim, light for one, dark for zero. The ring outside the coin is its yield: level ${c.yieldLevel} of ${YIELD_STEPS.length}. It grows with lifetime yield and never resets, not on a claim, not on a transfer.</p>
<div class="dl"><span class="lab">Download</span><a class="btn" href="/coin/${n}.svg" download="one-coin-${n}.svg">SVG</a><a class="btn" href="/coin/${n}-1024.png" download="one-coin-${n}-1024.png">PNG 1024</a><a class="btn" href="/api/coin/${n}">JSON</a></div>
${footer()}${STEP_KEYS}</main>`;
  const line = c.masterName ? `Master Coin ${c.masterName}` : [c.traits.material, c.traits.field, c.traits.glyph, c.traits.rim].join(", ");
  return layout(`Coin ${pad5(n)} | ${NAME}`, c.palette, body, `/coin/${n}.png`, `/coin/${n}`, `${line}. ${inp.backing} USDC backing, yield ${bpsPct(inp.yieldBps)}.`);
}

export function mastersPage(): string {
  const p = pageColors();
  const found = mastersFound();
  const cells = MASTERS.map((m, i) => {
    const n = found.get(i);
    const img = n ? `/coin/${n}.svg` : `/master/${i}.svg`;
    const inner = `<img src="${img}" alt="${esc(m.name)}" loading="lazy"><div class="cap"><b>${esc(m.name)}</b> ${esc(m.material)}, ${m.mode}${n ? `<br>coin #${pad5(n)}` : "<br>not found yet"}</div>`;
    return n ? `<a class="px" href="/coin/${n}">${inner}</a>` : `<div class="px gone">${inner}</div>`;
  });
  const body = `<main id="main" class="wide">${topBar("Master Coins")}${previewNote()}
<h2 class="syne">${MASTERS_PER_SERIES} Master Coins a series</h2>
<p>Each series holds ${num(SERIES_SIZE)} art slots, ${MASTERS_PER_SERIES} of them Master Coins. Every mint draws one slot from the ones left, so the first mint has ${MASTERS_PER_SERIES} in ${num(SERIES_SIZE)} odds and the odds move with every draw, and when the series ends all ${MASTERS_PER_SERIES} are out. A Master Coin carries whatever backing its minter chose, ${BACKING_LIST} USDC. ${found.size} of ${MASTERS_PER_SERIES} found so far. The images of the ones not found yet show the master with a sample seed; the rim marks and the legend will differ on the real coin.</p>
<div class="strip">${cells.join("")}</div>
${footer()}</main>`;
  return layout(`Master Coins | ${NAME}`, p, body, "/newest.png", "/masters");
}

export function traitsPage(): string {
  const p = pageColors();
  const tables = TABLES.map((tb) => {
    const total = tb.weights.reduce((a, b) => a + b, 0);
    const rows = tb.names.map((n, i) => `<tr><td>${esc(n)}</td><td class="n">${pctOf((100 * tb.weights[i]) / total)}</td></tr>`).join("");
    return `<h3 class="syne">${tb.trait}</h3><table class="tr"><thead><tr><th>value</th><th>odds</th></tr></thead><tbody>${rows}</tbody></table>`;
  });
  const body = `<main id="main" class="wide">${topBar("Traits")}
<h2 class="syne">Eleven traits, drawn from the seed</h2>
<p>The seed comes from Chainlink VRF. It is drawn into these tables in this order, each draw with the odds below, then into a pattern scale, sixteen bits for the glyph and a salt for speckle. The seed also writes itself on the coin: eight hex digits under it, thirty-two marks on the rim. Two coins with the same eleven traits still differ. Master Coins skip the tables; they keep only their material.</p>
<p>There is no rarity class. Rarity is the odds of a coin's own traits, and the only status the system defines is the Master Coin: ${MASTERS_PER_SERIES} in ${num(SERIES_SIZE)}, ${pctOf((100 * MASTERS_PER_SERIES) / SERIES_SIZE)} of a series.</p>
${tables.join("")}
${footer()}</main>`;
  return layout(`Traits and odds | ${NAME}`, p, body, "/newest.png", "/traits");
}

export function yieldPage(): string {
  const p = pageColors();
  const n = Math.max(1, PREVIEW_SUPPLY);
  const cells = [0, ...YIELD_STEPS].map((bps, level) => `<div class="px"><img src="/coin/${n}.svg?yield=${bps}" alt="Level ${level}" loading="lazy"><div class="cap"><b>Level ${level}</b> from ${bpsPct(bps)}</div></div>`);
  const body = `<main id="main" class="wide">${topBar("Yield ring")}
<h2 class="syne">The coin ages with its capital</h2>
<p>The centre of a coin never changes. Around it the renderer reads one number from the contract: lifetime yield over backing, in basis points. Claiming yield does not lower it; selling the coin does not reset it. It only goes up, and the ring follows it through ${YIELD_STEPS.length} levels: one orbit each for the first four, then the orbits fill in, then sparks between them, then the orbits take the accent colour.</p>
<div class="levels">${cells.join("")}</div>
<p class="small">Shown on coin #${pad5(n)}. The levels start at ${YIELD_STEPS.map(bpsPct).join(", ")} of lifetime yield.</p>
${footer()}</main>`;
  return layout(`Yield ring | ${NAME}`, p, body, "/newest.png", "/yield");
}

export function howPage(): string {
  const p = pageColors();
  const body = `<main id="main" class="prose">${topBar("How it works")}${previewNote()}
<h2 class="syne">Two axes that never touch</h2>
<p>Every coin has art and capital, and they are drawn apart. The art comes from a random seed and an art slot. The capital is the USDC you put in at mint: ${BACKING_LIST}. You choose the amount; you do not choose the art, and paying more buys no better odds. A ${BACKINGS[0]} USDC coin can be a Master Coin. A ${BACKINGS[2]} USDC coin can be plain.</p>
<h2 class="syne">Where the money sits</h2>
<p>The contract deposits your USDC into a vault on Base that follows the ERC-4626 standard and keeps the shares under your coin. The vault lends the USDC out and the shares grow in value. The coin's net asset value is what its shares convert to today. Burn the coin and the contract sends you the backing plus the yield earned, minus ${FEE_PCT}% of that yield, which goes to the author. That is the whole fee. The mint price is the backing, nothing on top. Yield can be claimed without burning; the coin keeps its record of everything it ever earned.</p>
<p>The contract has no admin over the pool. No pause on redeem, no upgrade, no key that can move the funds. The code holds the money, not a person. The vault is a third party with its own risks; read about it before you mint.</p>
<h2 class="syne">Randomness nobody steers</h2>
<p>The seed of each coin comes from Chainlink VRF, a verifiable random number the contract requests at mint and receives a few blocks later. The art slot comes from an urn: a series has ${num(SERIES_SIZE)} slots, ${MASTERS_PER_SERIES} of them Master Coins, and every mint takes one slot out at random from those left. The odds of a Master Coin start at ${MASTERS_PER_SERIES} in ${num(SERIES_SIZE)} and move with every draw. When a series is full, every one of its ${MASTERS_PER_SERIES} Master Coins is out, no more and no fewer. The author cannot know or choose who gets them.</p>
<h2 class="syne">Series without end</h2>
<p>A series is ${num(SERIES_SIZE)} coins. When it fills, the next one opens with its own urn and its own ${MASTERS_PER_SERIES} Master Coins. The Master Coins keep their names across series; each series renders its own version from a new seed.</p>
<h2 class="syne">Founder coins</h2>
<p>${FOUNDER_PER_SERIES} coins a series belong to the author, who mints them from the author wallet at no cost, class ${BACKINGS[BACKINGS.length - 1]} USDC, art from the same urn as everyone. Their backing is not paid at mint. The contract fills it from the author's ${FEE_PCT}% of yield, oldest founder coin first, until each holds its ${BACKINGS[BACKINGS.length - 1]} USDC. Until then the coin shows how much is funded, earns yield on that amount, and a burn returns that amount. No other minter's money ever backs a founder coin. They carry the trait Origin: Founder. On average the author draws ${(FOUNDER_PER_SERIES * MASTERS_PER_SERIES) / SERIES_SIZE} Master Coins a series, and most often none.</p>
<h2 class="syne">The image</h2>
<p>The coin is a 64 by 64 pixel grid drawn by a renderer contract from the seed and the contract's own numbers. No server, no file store, no link. <code>tokenURI</code> returns the metadata and the SVG inline. The seed is written on the coin: eight hex digits under it, thirty-two marks on the inner rim. The ring outside the coin is its lifetime yield; see the <a href="/yield">yield ring</a>. The renderer can be replaced by the author for future mints only; every coin keeps the renderer it was minted with.</p>
<h2 class="syne">What this is not</h2>
<p>Not an investment product and not advice. The yield comes from a lending vault and can be zero or negative if that vault fails. Nobody promises a return. The art is CC0.</p>
${footer()}</main>`;
  return layout(`How it works | ${NAME}`, p, body, "/newest.png", "/how");
}

export function notFound(what = "No such page."): string {
  const body = `<main id="main" class="prose">${topBar("Not found")}<h2 class="syne">Not found</h2><p>${esc(what)}</p><p><a href="/">Back to the coins</a></p>${footer()}</main>`;
  return layout(`Not found | ${NAME}`, pageColors(), body);
}
