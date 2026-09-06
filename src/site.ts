/**
 * Page HTML. The page has no palette of its own: it wears the ground and ink
 * of the newest coin. No light or dark mode.
 *
 * Copy rules: plain words, active voice, no adverbs, no em dashes, nothing a
 * reader could misunderstand. Every number about odds, levels, classes and
 * counts comes from coin.ts or from the chain, not from prose.
 */
import {
  MATERIALS, MATERIAL_WEIGHTS, GROUNDS, GROUND_WEIGHTS, RIMS, RIM_WEIGHTS, FIELDS, FIELD_WEIGHTS, SYMMETRIES, SYMMETRY_WEIGHTS,
  CORES, CORE_WEIGHTS, GLYPHS, GLYPH_WEIGHTS, SURFACES, SURFACE_WEIGHTS, HALOS, HALO_WEIGHTS, ACCENTS, ACCENT_WEIGHTS,
  ANOMALIES, ANOMALY_WEIGHTS, MASTERS, YIELD_STEPS, fingerprint, roman, type Coin, type Traits,
} from "./coin.ts";
import {
  RISK, RISK_SHORT, DEFAULT_MAX_BATCH, SELECTORS, MINTED_TOPIC, IMG_Q, IMG_V, factsOf, backingList,
  REVERTS, chainName, explorer, openseaCoin, newestCoin, coinIds, mastersFound,
  type ChainState, type ChainStatus, type CoinRecord,
} from "./contract.ts";
import { coinOf } from "./token.ts";
import { placeholderCoin } from "./preview.ts";
import { sizePicker, downloadBar, downloadScript } from "./wallet.ts";

export const SITE = "one.onenft.click";
export const NAME = "ONE";
export const REPO = "https://github.com/pawelorzech/onenft-one";
export const PARENT = "onenft.click";
export { RISK, RISK_SHORT, IMG_Q };

export type Colors = { bg: string; fg: string };
export type Names = Map<string, string>;
export const NO_NAMES: Names = new Map();

export const num = (n: number | bigint) => n.toLocaleString("en-US");
export function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export function shortAddr(a: string): string {
  return a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
export function label(a: string, names: Names = NO_NAMES): string {
  return names.get(a.toLowerCase()) ?? shortAddr(a);
}
export function ownerLink(a: string, names: Names = NO_NAMES): string {
  return `<a href="/${a}">${esc(label(a, names))}</a>`;
}
export function isAuthor(chain: ChainState | null, a?: string | null): boolean {
  return Boolean(chain && a && a.toLowerCase() === chain.author.toLowerCase());
}
export const pctOf = (p: number) => (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)) + "%";
export const pad5 = (n: number) => String(n).padStart(5, "0");
/** Basis points as a percent with one decimal: 1234 gives "12.3%". */
export const bpsPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
/** USDC units, six decimals, as dollars and cents without the unit: 480000000n gives "480.00". */
export function usdcNum(units: bigint | number): string {
  const u = BigInt(units);
  const neg = u < 0n, a = neg ? -u : u;
  const whole = a / 1000000n, cents = (a % 1000000n) / 10000n;
  return `${neg ? "-" : ""}${num(whole)}.${String(cents).padStart(2, "0")}`;
}
/** The same amount with the unit. */
export const usdc = (units: bigint | number) => `${usdcNum(units)} USDC`;
/** Wei as ETH, trailing zeros trimmed: 300000000000000n gives "0.0003". */
export function ethOf(wei: bigint): string {
  const whole = wei / 10n ** 18n, frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export const eth = (wei: bigint) => `${ethOf(wei)} ETH`;
/** A unix time as a plain UTC date: 1791244800 gives "4 October 2026". */
export function dateOf(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}
/** A span of seconds in days, for copy about the lock. */
export const days = (seconds: number) => Math.round(seconds / 86400);
/**
 * True when the coin may be burned now. It needs its art and its lock, or, when the seed
 * never came, the escape date the contract opens for a coin nobody can reveal any more.
 */
export const redeemable = (c: CoinRecord, now = Date.now()) =>
  now >= c.redeemableAt * 1000 && (!c.sealed || now >= c.sealedEscapeAt * 1000);
/** USDC units with all six decimals, for text that must be exact. */
export function usdcExact(units: bigint): string {
  return `${units / 1000000n}.${(units % 1000000n).toString().padStart(6, "0")}`;
}

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
.row.yours .n::after{content:" yours";font-size:14px;font-weight:400;color:var(--muted)}
.tag{display:inline-block;padding:1px 7px;border:1px solid var(--line);font-size:13px;color:var(--muted);margin-left:8px;vertical-align:middle}
.tag.master{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.tag.founder{border-color:var(--fg);color:var(--fg)}
.tag.sealed{border-style:dashed}
.testnet{display:inline-block;padding:3px 8px;border:1px solid var(--line);font-size:13px;color:var(--muted)}
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
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 16px;border:1px solid var(--fg);color:var(--fg);text-decoration:none;font-weight:700;font-size:15px;font-family:"Syne",system-ui,sans-serif;background:transparent;cursor:pointer}
.btn[disabled],.btn[aria-disabled="true"]{opacity:.5;cursor:default}
.btn[aria-busy="true"]{opacity:.6;cursor:progress}
.top nav a,.nav a,footer nav a{font-family:"Syne",system-ui,sans-serif;font-weight:700;font-size:14px;letter-spacing:.01em;text-decoration:none;color:var(--muted);display:inline-flex;align-items:center;min-height:44px}
.top nav a:hover,.nav a:hover,footer nav a:hover{color:var(--fg);text-decoration:underline;text-underline-offset:4px}
.top nav,footer nav{gap:2px 24px}
.whobox{display:flex;flex-direction:column;gap:8px}
.wname{overflow-wrap:normal;word-break:keep-all}
.who{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;max-width:720px}
.who form{display:flex;flex-direction:column;gap:8px;flex:1;min-width:280px}
.who form .line{display:flex;gap:12px}
.who label{font-size:15px;color:var(--muted)}
.who .cta{min-height:48px;height:48px;padding:0 22px;font-size:17px;width:auto}
button.cta{border:0;cursor:pointer;font-family:"Syne",system-ui,sans-serif}
button.cta[disabled]{opacity:.55;cursor:default}
.field{height:48px;padding:0 16px;border:1px solid var(--edge);background:transparent;color:var(--fg);flex:1;min-width:0;font-family:ui-monospace,Menlo,monospace;font-size:15px}
.field::placeholder{color:var(--muted)}
.msg{font-size:15px;color:var(--muted);min-height:1.5em;margin:0}
.msg a{font-weight:700}
.sizes{display:flex;border:1px solid var(--edge)}
.sizes button{padding:0 14px;min-height:46px;display:flex;align-items:center;font-size:14px;color:var(--muted);border:0;border-right:1px solid var(--line);background:transparent;font-family:"Syne",system-ui,sans-serif;cursor:pointer}
.sizes button:last-child{border-right:0}
.sizes button[aria-pressed="true"]{background:var(--soft);color:var(--fg);font-weight:700}
pre.snip{margin:0;padding:14px;background:var(--soft);overflow-x:auto;font-size:13px;line-height:1.5;font-family:ui-monospace,Menlo,monospace}
.levels{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
.levels img{width:100%;aspect-ratio:1;display:block;box-shadow:0 0 0 1px var(--line)}
.levels .cap{font-size:14px;color:var(--muted);margin-top:6px}
.mint{padding:30px 34px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:16px;max-width:760px}
.classes{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--edge);max-width:420px}
.classes button{flex:1;min-height:58px;border:0;border-right:1px solid var(--line);background:transparent;color:var(--muted);font-family:"Syne",system-ui,sans-serif;font-weight:700;font-size:18px;cursor:pointer}
.classes button:last-child{border-right:0}
.classes button[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
.count{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}
.count label{font-size:15px;color:var(--muted);display:flex;flex-direction:column;gap:6px}
.count input{width:96px;height:48px;padding:0 12px;border:1px solid var(--edge);background:transparent;color:var(--fg);font-family:"Syne",system-ui,sans-serif;font-weight:700;font-size:18px}
.total{display:flex;align-items:baseline;gap:10px}
.total b{font-family:"Syne",system-ui,sans-serif;font-weight:800;font-size:28px;letter-spacing:-.03em}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tok{display:grid;grid-template-columns:256px minmax(0,1fr);gap:32px;padding:30px 0;border-top:1px solid var(--line)}
.tok img{width:256px;height:256px;display:block;box-shadow:0 0 0 1px var(--line)}
.tok .meta{display:flex;flex-direction:column;gap:14px}
.tok .num{font-size:44px}
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
 footer,.prose,.single,.wide,.mint{padding:20px}
 .tok{grid-template-columns:1fr;gap:16px}
 .tok img{width:100%;height:auto}
}
@media (max-width:360px){h1{font-size:29px}.mark{font-size:17px}}
@media (prefers-reduced-motion:no-preference){.row{transition:background .15s}}
`;
}

const UMAMI_URL = process.env.UMAMI_URL ?? "";
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID ?? "";
const ANALYTICS = UMAMI_URL && UMAMI_WEBSITE_ID ? `<script defer src="${esc(UMAMI_URL)}/script.js" data-website-id="${esc(UMAMI_WEBSITE_ID)}"></script>` : "";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Newsreader:opsz,wght@6..72,400&display=swap">`;
/** The one-line description. It carries the series' own numbers, so it changes with the contract. */
export function descOf(chain: ChainState | null): string {
  const f = factsOf(chain);
  return `${num(f.seriesSize)} pixel coins per series on Base, ${f.masters} one of ones, every coin backed by ${f.backings.join(", ")} USDC that earns yield. Burn to redeem.`;
}

export function layout(title: string, p: Colors, body: string, image = `/newest.png${IMG_Q}`, path = "/", description = descOf(null)): string {
  const alt = title.replace(/ \| .*$/, "") + " on " + SITE;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="${p.bg}">
<link rel="icon" href="/newest.svg${IMG_Q}" type="image/svg+xml">
<link rel="canonical" href="https://${SITE}${esc(path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="https://${SITE}${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="https://${SITE}${esc(path)}">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
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
export const MENU: [string, string][] = [["/coins", "All coins"], ["/masters", "Master Coins"], ["/traits", "Traits"], ["/yield", "Yield ring"], ["/assets", "Assets"], ["/how", "How it works"], ["/yours", "Your wallet"]];
export function menu(extra: [string, string][] = []): string {
  return [...MENU, ...extra].map(([h, t]) => `<a href="${h}">${t}</a>`).join("");
}
export function topBar(current?: string): string {
  return `<div class="top">${crumb(current)}<nav aria-label="Site">${menu([[`https://${PARENT}`, "All collections"]])}</nav></div>`;
}
export function footer(): string {
  return `<footer><nav aria-label="Footer">${menu()}<a href="/api/state">JSON</a><a href="${REPO}">Source</a><a href="https://${PARENT}">${PARENT}</a></nav><span>CC0. Not an investment product. This can lose you money: read <a href="/how#risk">what can go wrong</a> and <a href="/how">how it works</a> before you mint.</span></footer>`;
}
export const STEP_KEYS = `<script>
(function(){document.addEventListener('keydown',function(e){if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;var a=e.key==='ArrowLeft'?document.querySelector('a[rel=prev]'):e.key==='ArrowRight'?document.querySelector('a[rel=next]'):null;if(a){e.preventDefault();location.href=a.href}})})();
</script>`;

/** Marks the rows a connected wallet owns. Reads accounts, sends nothing. */
export const YOURS = `<script>
(function(){var eth=window.ethereum;if(!eth||!eth.request)return;
function mark(accs){var mine={};(accs||[]).forEach(function(a){mine[a.toLowerCase()]=1});var n=0;document.querySelectorAll('[data-owner]').forEach(function(el){var y=!!mine[el.getAttribute('data-owner')];el.classList.toggle('yours',y);if(y)n++});var box=document.getElementById('yours');if(box){box.hidden=!n;var c=box.querySelector('b');if(c)c.textContent=n}}
eth.request({method:'eth_accounts'}).then(mark).catch(function(){});
if(eth.on){eth.on('accountsChanged',mark);eth.on('disconnect',function(){mark([])})}
})();
</script>`;

/** How old the numbers on the page are, when they are not fresh. */
export function staleNote(status: ChainStatus | null | undefined): string {
  if (!status?.configured) return "";
  if (!status.known) return `<p class="note" role="status">The chain did not answer. Coins, counts and minting need it. The pages that need no chain still work. Try again in a minute.</p>`;
  if (!status.stale) return "";
  const when = new Date(status.readAt!).toISOString().slice(11, 16);
  return `<p class="note" role="status">The counts could not be refreshed. Showing what the chain said at ${when} UTC.</p>`;
}

/** Before the contract exists, or while it is not configured here. */
export function noContractNote(status: ChainStatus | null | undefined): string {
  return status?.configured ? "" : `<p class="note" role="status">No contract is configured on this server, so nothing is minted and no wallet holds a coin. The Master Coins, the traits and the yield ring are the ones the contract will use.</p>`;
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
export function traitList(coin: Coin, sealed = false, f = factsOf(null)): string {
  if (sealed) return `<dl class="traits"><dt>traits</dt><dd>none yet<br><span class="odds">The seed decides them, and it has not arrived.</span></dd></dl>`;
  const t = coin.traits;
  const odds = oddsOf(t);
  const rows: string[] = [];
  if (coin.masterName) {
    rows.push(`<dt>master coin</dt><dd>${esc(coin.masterName)} <span class="odds">one of ${f.masters} in ${num(f.seriesSize)}</span></dd>`);
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

/** The capital side of one coin, from the contract's own numbers. */
export function moneyBlock(c: CoinRecord, level: number, f = factsOf(null)): string {
  const fee = (c.profit * BigInt(f.feeBps)) / 10000n;
  const onBurn = c.nav - fee;
  return `<div class="money">
<div><b>${usdc(c.principal)}</b><span>${c.founder && c.principal < BigInt(c.backing) * 1000000n ? `funded of the ${c.backing} USDC class` : "backing, paid at mint"}</span></div>
<div><b>${bpsPct(c.yieldBps)}</b><span>lifetime yield over backing, ring level ${level} of ${YIELD_STEPS.length}</span></div>
<div><b>${usdc(c.lifetime)}</b><span>earned so far, ${usdc(c.claimed)} of it claimed</span></div>
<div><b>${usdc(onBurn)}</b><span>a burn sends this now, after the ${f.feePct}% fee on yield</span></div>
</div>`;
}

/**
 * One fact tile. The figure can be a long amount ("1,480.00 USDC"), and a
 * figure wider than its cell would run into the next one, so it steps down in
 * size as it grows.
 */
export function factTile(figure: string, lab: string): string {
  const size = figure.length <= 8 ? "" : figure.length <= 11 ? ' style="font-size:20px"' : figure.length <= 14 ? ' style="font-size:17px"' : ' style="font-size:15px"';
  return `<li><span class="fig syne"${size}>${esc(figure)}</span><span class="lab">${esc(lab)}</span></li>`;
}

export function coinTags(coin: Coin, c: CoinRecord): string {
  return `${c.sealed ? `<span class="tag sealed">sealed</span>` : coin.masterName ? `<span class="tag master">1/1</span>` : ""}${c.founder ? `<span class="tag founder">founder</span>` : ""}`;
}
export function coinLine(c: CoinRecord): string {
  if (c.sealed) return "sealed, waiting for the seed from Chainlink VRF";
  const coin = coinOf(c);
  return coin.masterName ? `${coin.masterName}, ${coin.traits.material}` : `${coin.traits.material}, ${coin.traits.field.toLowerCase()} field, ${coin.traits.glyph.toLowerCase()} glyph`;
}
export function coinRow(c: CoinRecord, chain: ChainState | null = null, names: Names = NO_NAMES): string {
  const coin = coinOf(c);
  const who = c.owner ? (isAuthor(chain, c.owner) ? ", held by the author" : `, held by ${esc(label(c.owner, names))}`) : "";
  return `<a class="row px" href="/coin/${c.id}"${c.owner ? ` data-owner="${c.owner.toLowerCase()}"` : ""}><img src="/coin/${c.id}.svg${IMG_Q}" alt="" width="92" height="92" loading="lazy"><span><span class="n syne">#${pad5(c.id)}</span>${coinTags(coin, c)}<br><span class="sub">${esc(coinLine(c))}, ${c.backing} USDC, yield ${bpsPct(c.yieldBps)}${who}</span></span></a>`;
}

// ---- pages

/**
 * The site wears the newest coin that has its art. A sealed coin is grey by
 * design, and every mint puts one at the head, so wearing it would drain the
 * whole site of colour for as long as Chainlink takes to answer.
 */
export function pageColors(chain: ChainState | null): Colors {
  if (chain) {
    for (let id = chain.nextId - 1; id >= 1; id--) {
      const c = chain.coins.get(id);
      if (c && !c.sealed) return coinOf(c).palette;
    }
  }
  return placeholderCoin().palette;
}

export function sidebar(chain: ChainState | null, status: ChainStatus | null, current?: string): string {
  const f = factsOf(chain);
  const live = Boolean(chain);
  const series = chain?.series ?? 1;
  // With no contract on this server nothing is minted, and that is a fact, not a gap.
  // With a contract whose chain never answered the counts are unknown, and a zero would be a lie.
  const unknown = !chain && Boolean(status?.configured);
  const mintedHere = chain ? chain.seriesMinted : unknown ? null : 0;
  const found = chain ? f.masters - chain.mastersLeft : unknown ? null : 0;
  return `<aside><div class="stick">
${crumb(current)}
<h1 class="syne">${num(f.seriesSize)} coins a series. ${f.masters} one of ones. Every coin backed.</h1>
<p class="lead">A pixel coin drawn on chain from a random seed, and ${backingList(f.backings)} USDC held in a vault that earns. Art and money never correlate: a ${f.backings[0]} USDC coin can be a Master Coin. Burn the coin and the backing plus its yield comes back to you. ${RISK_SHORT.replace("Read what can go wrong before you mint.", `<a href="/how#risk">Read what can go wrong</a> before you mint.`)}</p>
<a class="cta syne" href="${live ? "#mint" : "/how"}" aria-disabled="${live ? "false" : "true"}">${live ? "Mint a coin" : status?.configured ? "The chain did not answer" : "Minting opens with the contract"}</a>
<ul class="facts">
<li><span class="fig syne">${roman(series)}</span><span class="lab">series, ${num(f.seriesSize)} coins each, series without end</span></li>
<li><span class="fig syne">${mintedHere === null ? "?" : num(mintedHere)}</span><span class="lab">of ${num(f.seriesSize)} minted in this series</span></li>
<li><span class="fig syne">${found === null ? "?" : `${found} of ${f.masters}`}</span><span class="lab">Master Coins drawn from the urn</span></li>
<li><span class="fig syne">${f.feePct}%</span><span class="lab">of the yield goes to the author; nothing else does</span></li>
</ul>
<nav class="nav" aria-label="Site">${menu([[`https://${PARENT}`, "All collections"]])}</nav>
</div></aside>`;
}

/** The testnet badge, so nobody mistakes a test contract for the real one. */
function testnet(chain: ChainState | null): string {
  return chain && chain.chainId !== 8453 ? ` <span class="testnet">${chainName(chain.chainId)} testnet</span>` : "";
}

/** The mint box: a class, a count, the total, and one button that walks the whole way. */
function mintBox(chain: ChainState): string {
  const f = factsOf(chain);
  const classes = chain.backings.map((b, i) => `<button type="button" data-class="${i}" data-units="${BigInt(b) * 1000000n}" aria-pressed="${i === 0}">${b} USDC</button>`).join("");
  const soldOut = chain.seriesMinted >= f.seriesSize;
  return `<section class="mint" id="mint" aria-labelledby="mint-h">
<h2 id="mint-h" class="syne">Mint a coin</h2>
<p class="small">You choose how much USDC the coin holds. You do not choose the art: the seed comes from Chainlink VRF and the art slot from the urn, a few blocks after your transaction. ${num(f.seriesSize - chain.seriesMinted)} left in series ${roman(chain.series)}.${testnet(chain)}</p>
<div class="classes" role="group" aria-label="Backing">${classes}</div>
<div class="count"><label for="count">How many coins<input class="field" id="count" type="number" inputmode="numeric" min="1" max="${chain.maxBatch}" step="1" value="1"></label><span class="small">Up to ${chain.maxBatch} in one transaction.</span></div>
<p class="total"><span class="small">Total</span><b class="syne" id="total">${chain.backings[0]}.00 USDC</b></p>
${chain.vrfFeeWei > 0n ? `<p class="small">Plus ${eth(chain.vrfFeeWei)} for the randomness, paid to Chainlink, one fee per transaction whatever the count. Plus network gas.</p>` : ""}
<div class="actions">${soldOut ? `<button class="cta syne" disabled>Series ${roman(chain.series)} is full</button>` : `<button class="cta syne" id="mint-btn">Connect wallet</button>`}<button class="btn" id="mint-check" type="button" hidden>Check status</button></div>
<p class="msg" id="msg" aria-live="polite"></p>
<p class="note" role="note">This can lose you money. <a href="/how#risk">Read what can go wrong</a> before you mint.</p>
<div id="sealed" hidden><p class="small">Your coins are minted and sealed. The seed arrives from Chainlink VRF a few blocks later, and this page opens them.</p><div class="strip" id="sealed-list"></div></div>
<p class="small">The price is the backing and nothing on top; the author takes none of it. You pay the Chainlink fee, network gas, and USDC needs one approval the first time. Burning a coin sends the backing plus its yield back, minus ${f.feePct}% of the yield, and a coin can be burned ${f.lockDays} days after its mint. Read <a href="/how">how it works</a> first.</p>
${(() => {
  const w = chain.founder;
  const where = w.left === 0
    ? `Series ${roman(chain.series)} has all ${f.founders}.`
    : w.open
      ? `${w.left} left, and the window is open until coin ${num(w.closesAt)} of series ${roman(chain.series)}. The series is at coin ${num(chain.position)}.`
      : `Closed since coin ${num(w.closesAt)} of series ${roman(chain.series)}. The series is at coin ${num(chain.position)}, so the ${w.left} not minted are forfeited.`;
  const can = w.open && w.left > 0;
  const most = Math.max(1, Math.min(chain.maxBatch, w.left));
  return `<div id="founder-box" hidden><hr><h3 class="syne">Mint founder coins</h3><p class="small">This wallet is the author. A founder coin carries no backing at mint; the contract fills it from the fee on yield. The Chainlink fee is the same as any mint. They are minted at the start of a series, inside its first ${num(w.closesAt)} coins, or not at all. ${w.minted} of ${f.founders} minted. ${where}</p><div class="count"><label for="fcount">How many<input class="field" id="fcount" type="number" inputmode="numeric" min="1" max="${most}" step="1" value="1"${can ? "" : " disabled"}></label><button class="btn" id="founder-btn" type="button"${can ? "" : " disabled data-shut"}>${w.left === 0 ? "None left in this series" : can ? "Mint founder coins" : `The window closed at coin ${num(w.closesAt)}`}</button></div></div>`;
})()}
</section>`;
}

/** The mint state machine. Plain provider calls: no bundler, no ABI encoder in the browser. */
export function mintScript(chain: ChainState | null): string {
  const cfg = JSON.stringify({
    address: chain?.address ?? null,
    chainHex: chain ? "0x" + chain.chainId.toString(16) : null,
    name: chain ? chainName(chain.chainId) : null,
    rpc: chain?.chainId === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org",
    explorer: chain ? explorer(chain.chainId) : "",
    usdc: chain?.usdc ?? null,
    author: chain?.author ?? null,
    maxBatch: chain?.maxBatch ?? DEFAULT_MAX_BATCH,
    vrfFeeWei: (chain?.vrfFeeWei ?? 0n).toString(),
    vrfFeeEth: ethOf(chain?.vrfFeeWei ?? 0n),
    imgq: IMG_Q,
    sel: SELECTORS,
    mintedTopic: MINTED_TOPIC,
    reverts: REVERTS,
  });
  return `<script>
(function(){
var CFG=${cfg};if(!CFG.address)return;
var btn=document.getElementById('mint-btn');var out=document.getElementById('msg');var check=document.getElementById('mint-check');
var count=document.getElementById('count');var total=document.getElementById('total');var classes=document.querySelectorAll('.classes button');
var sealedBox=document.getElementById('sealed');var sealedList=document.getElementById('sealed-list');
var fbox=document.getElementById('founder-box');var fbtn=document.getElementById('founder-btn');var fcount=document.getElementById('fcount');
var cls=0;var units=BigInt(classes.length?classes[0].getAttribute('data-units'):'0');
function say(t){if(out)out.textContent=t}
function link(h){return ' <a href="'+CFG.explorer+'/tx/'+h+'" target="_blank" rel="noopener">View transaction</a>'}
function show(t,h){if(!out)return;out.textContent=t;if(h)out.insertAdjacentHTML('beforeend',link(h))}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function word(v){return v.toString(16).padStart(64,'0')}
function addr(a){return a.slice(2).toLowerCase().padStart(64,'0')}
/** A wallet hands back the contract's four bytes; this turns the known ones into a sentence. */
function reverted(e){var blob='';try{blob=JSON.stringify(e)}catch(x){}blob=(blob+' '+((e&&e.message)||'')).toLowerCase();
  for(var i=0;i<CFG.reverts.length;i++)if(blob.indexOf(CFG.reverts[i][0].toLowerCase())>=0)return CFG.reverts[i][1];return null}
function failed(e){return e&&e.code===4001?'Cancelled in the wallet. Nothing was sent.':e&&e.code===-32002?'The wallet is already asking. Open it to answer.':(reverted(e)||('Failed: '+((e&&e.message)||e)))}
function money(u){var w=u/1000000n;var c=(u%1000000n)/10000n;return w.toString()+'.'+c.toString().padStart(2,'0')+' USDC'}
function n(){var v=parseInt(count&&count.value||'1',10);if(!(v>=1))v=1;if(v>CFG.maxBatch)v=CFG.maxBatch;return v}
function totalUnits(){return units*BigInt(n())}
function paint(){classes.forEach(function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-class')===cls))});if(total)total.textContent=money(totalUnits())}
classes.forEach(function(b){b.addEventListener('click',function(){if(locked)return;cls=+b.getAttribute('data-class');units=BigInt(b.getAttribute('data-units'));paint()})});
if(count)count.addEventListener('input',function(){paint()});
if(count)count.addEventListener('change',function(){count.value=String(n());paint()});
paint();

var locked=false;
function lock(on){locked=on;classes.forEach(function(b){b.disabled=on});if(count)count.disabled=on;if(btn)btn.disabled=on;if(fbtn&&!fbtn.hasAttribute('data-shut')){fbtn.disabled=on;if(fcount)fcount.disabled=on}}
var eth=window.ethereum;var account=null;
if(!eth||!eth.request){if(btn){btn.disabled=true;btn.textContent='No wallet detected'}say('No wallet detected. Open this site in your wallet\\u2019s browser, or install one like Rabby, MetaMask or Coinbase Wallet.');return}
function key(a){return 'onenft_mint:'+CFG.chainHex+':'+CFG.address.toLowerCase()+':'+a.toLowerCase()}
function keep(a,r){try{localStorage.setItem(key(a),JSON.stringify(r))}catch(e){}}
function rec(a){try{return JSON.parse(localStorage.getItem(key(a))||'null')}catch(e){return null}}
function drop(a){try{localStorage.removeItem(key(a))}catch(e){}}
function offerCheck(f){if(!check)return;check.hidden=false;check.onclick=function(){check.hidden=true;f()}}
async function receipt(hash){try{return await eth.request({method:'eth_getTransactionReceipt',params:[hash]})}catch(e){return null}}
async function call(to,data){var v=await eth.request({method:'eth_call',params:[{to:to,data:data},'latest']});return (!v||v==='0x')?0n:BigInt(v)}
async function wait(hash,what){
  for(var i=0;i<60;i++){var r=await receipt(hash);if(r)return r;await sleep(document.hidden?4000:2500)}
  show('We cannot confirm '+what+' yet. Check its status before trying again.',hash);return null;
}
/** The ids of the new coins, from the Minted logs of the receipt. A mint also writes ERC-721 Transfer logs; only this topic is Minted. */
function idsOf(r){var out=[];(r.logs||[]).forEach(function(l){
  if((l.address||'').toLowerCase()!==CFG.address.toLowerCase())return;
  if(!l.topics||l.topics.length<3||l.topics[0].toLowerCase()!==CFG.mintedTopic.toLowerCase())return;
  var to='0x'+l.topics[2].slice(26);
  if(account&&to.toLowerCase()!==account.toLowerCase())return;
  out.push(parseInt(l.topics[1],16));});
  return out.filter(function(v,i,a){return a.indexOf(v)===i}).sort(function(a,b){return a-b});}
window.retryImg=function(el){var n=+el.dataset.tries;if(n>=12)return;el.dataset.tries=n+1;setTimeout(function(){el.src=el.src.split('?')[0]+'?t='+Date.now()},5000)};
var CFGQ=CFG.imgq+(CFG.imgq?'&':'?')+'t='+Date.now();
function tile(id,open){
  return '<'+(open?'a href="/coin/'+id+'"':'div')+' class="px" data-coin="'+id+'"><img src="/coin/'+id+'.svg?t='+Date.now()+'" alt="Coin '+id+'" width="140" height="140" data-tries="0" onerror="retryImg(this)"><div class="cap"><b>#'+String(id).padStart(5,'0')+'</b> '+(open?'open':'sealed')+'</div></'+(open?'a':'div')+'>';
}
function drawSealed(ids,open){if(!sealedList)return;sealedBox.hidden=false;sealedList.innerHTML=ids.map(function(id){return tile(id,open.indexOf(id)>=0)}).join('')}
async function watch(ids){
  keep(account,{stage:'sealed',ids:ids});
  var open=[];drawSealed(ids,open);
  say(ids.length===1?'Coin #'+ids[0]+' is minted and sealed. Waiting for the seed from Chainlink VRF.':ids.length+' coins are minted and sealed. Waiting for the seed from Chainlink VRF.');
  for(var i=0;i<180;i++){
    for(var k=0;k<ids.length;k++){
      if(open.indexOf(ids[k])>=0)continue;
      try{var res=await fetch('/api/coin/'+ids[k],{cache:'no-store'});if(res.ok){var j=await res.json();if(j&&j.sealed===false)open.push(ids[k])}}catch(e){}
    }
    drawSealed(ids,open);
    if(open.length===ids.length){say(ids.length===1?'Coin #'+ids[0]+' is open.':'All '+ids.length+' coins are open.');drop(account);lock(false);if(ids.length===1){await sleep(1200);location.href='/coin/'+ids[0]}return}
    await sleep(10000);
  }
  say('The seed is taking long. Your coins are safe and they open on their own; anyone can also ask Chainlink again from the contract.');lock(false);offerCheck(function(){watch(ids)});
}
async function switchChain(){
  try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:CFG.chainHex}]})}
  catch(e){if(e&&e.code===4902){await eth.request({method:'wallet_addEthereumChain',params:[{chainId:CFG.chainHex,chainName:CFG.name,rpcUrls:[CFG.rpc],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},blockExplorerUrls:[CFG.explorer]}]})}else{throw e}}
}
/** The Chainlink fee rides along as value; the contract passes it straight to its subscription. */
function withFee(tx){var v=BigInt(CFG.vrfFeeWei);if(v>0n)tx.value='0x'+v.toString(16);return tx}
function feeText(){return BigInt(CFG.vrfFeeWei)>0n?' plus '+CFG.vrfFeeEth+' ETH for the randomness':''}
async function mintNow(need,cnt,klass){
  say('Confirm the mint in your wallet: '+money(need)+feeText()+' for '+cnt+(cnt===1?' coin.':' coins.'));
  var data=CFG.sel.mint+word(BigInt(klass))+word(BigInt(cnt))+addr(account);
  var hash=await eth.request({method:'eth_sendTransaction',params:[withFee({from:account,to:CFG.address,data:data})]});
  keep(account,{stage:'mint',hash:hash});
  show('Mint sent. Waiting for confirmation.',hash);
  return settleLater(hash);
}
function settle(r,hash){
  if(r.status!=='0x1'){drop(account);show('The network rejected the transaction. Nothing was spent beyond gas.',hash);lock(false);return}
  var ids=idsOf(r);
  if(!ids.length){drop(account);show('The transaction went through, but this page could not read the coin numbers from it. Open your wallet page to see them.',hash);lock(false);return}
  return watch(ids);
}
async function settleLater(hash){var r=await wait(hash,'the mint');if(r)return settle(r,hash);offerCheck(function(){settleLater(hash)})}
/** An approval that was already sent: wait for it, then mint what it was approved for. */
async function afterApprove(r){
  show('An approval from this wallet is on its way.',r.hash);
  var ar=await wait(r.hash,'the approval');
  if(!ar){offerCheck(function(){afterApprove(r)});return}
  if(ar.status!=='0x1'){drop(account);show('The network rejected the approval. Nothing was spent beyond gas.',r.hash);lock(false);return}
  return mintNow(BigInt(r.need),r.count,r.klass);
}
/** Picks up whatever this wallet left behind: a sealed batch, a mint in flight, an approval in flight. */
function resume(r){
  if(r.stage==='sealed'&&r.ids&&r.ids.length)return watch(r.ids);
  if(r.stage==='approve'&&r.hash)return afterApprove(r);
  if(r.hash){show('A transaction from this wallet is still on its way.',r.hash);return settleLater(r.hash)}
  drop(account);lock(false);
}
async function run(){
  lock(true);
  var cnt=n(),klass=cls,need=totalUnits();
  try{
    var accs=await eth.request({method:'eth_requestAccounts'});if(!accs||!accs.length)throw new Error('the wallet gave no account');
    account=accs[0];
    var old=rec(account);
    if(old)return resume(old);
    await switchChain();
    say('Reading your USDC balance.');
    var bal=await call(CFG.usdc,CFG.sel.balanceOf+addr(account));
    if(bal<need){say('This wallet holds '+money(bal)+'. The mint needs '+money(need)+'.');lock(false);return}
    var allow=await call(CFG.usdc,CFG.sel.allowance+addr(account)+addr(CFG.address));
    if(allow<need){
      say('Approve '+money(need)+' of USDC for the contract. This is the first of two transactions.');
      var ah=await eth.request({method:'eth_sendTransaction',params:[{from:account,to:CFG.usdc,data:CFG.sel.approve+addr(CFG.address)+word(need)}]});
      var r={stage:'approve',hash:ah,klass:klass,count:cnt,need:need.toString()};
      keep(account,r);
      show('Approval sent. Waiting for confirmation.',ah);
      return afterApprove(r);
    }
    await mintNow(need,cnt,klass);
  }catch(e){
    say(failed(e));
    lock(false);
  }
}
async function founderRun(){
  lock(true);
  try{
    var accs=await eth.request({method:'eth_requestAccounts'});if(!accs||!accs.length)throw new Error('the wallet gave no account');
    account=accs[0];
    await switchChain();
    var cnt=parseInt(fcount&&fcount.value||'1',10);if(!(cnt>=1))cnt=1;if(cnt>CFG.maxBatch)cnt=CFG.maxBatch;
    say('Confirm the founder mint in your wallet: '+cnt+(cnt===1?' coin':' coins')+feeText()+'.');
    var data=CFG.sel.mintFounder+word(BigInt(cnt))+addr(account);
    var hash=await eth.request({method:'eth_sendTransaction',params:[withFee({from:account,to:CFG.address,data:data})]});
    keep(account,{stage:'mint',hash:hash});
    show('Founder mint sent. Waiting for confirmation.',hash);
    await settleLater(hash);
  }catch(e){say(failed(e));lock(false)}
}
function seen(accs){
  var a=accs&&accs[0]||null;
  if(btn)btn.textContent=a?'Mint':'Connect wallet';
  if(fbox)fbox.hidden=!(a&&CFG.author&&a.toLowerCase()===CFG.author.toLowerCase());
  if(!a||locked)return;
  account=a;var r=rec(a);
  if(r){lock(true);resume(r)}
}
eth.request({method:'eth_accounts'}).then(seen).catch(function(){});
if(eth.on){eth.on('accountsChanged',seen);eth.on('chainChanged',function(id){if(parseInt(id,16)!==parseInt(CFG.chainHex,16))say('The wallet switched network. Switch back to '+CFG.name+' to mint.')})}
if(btn)btn.addEventListener('click',run);
if(fbtn)fbtn.addEventListener('click',founderRun);
})();
</script>`;
}

/** Claim and redeem, on the coin page and on a wallet's page. Shown only to the wallet that owns the coin. */
export function actionScript(chain: ChainState | null): string {
  const cfg = JSON.stringify({
    address: chain?.address ?? null,
    chainHex: chain ? "0x" + chain.chainId.toString(16) : null,
    name: chain ? chainName(chain.chainId) : null,
    rpc: chain?.chainId === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org",
    explorer: chain ? explorer(chain.chainId) : "",
    sel: SELECTORS,
    reverts: REVERTS,
  });
  return `<script>
(function(){
var CFG=${cfg};if(!CFG.address)return;
var eth=window.ethereum;var acts=document.querySelectorAll('[data-act]');if(!acts.length)return;
var out=document.getElementById('msg');
function say(t){if(out)out.textContent=t}
function show(t,h){if(!out)return;out.textContent=t;if(h)out.insertAdjacentHTML('beforeend',' <a href="'+CFG.explorer+'/tx/'+h+'" target="_blank" rel="noopener">View transaction</a>')}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function word(v){return v.toString(16).padStart(64,'0')}
if(!eth||!eth.request)return;
function mine(accs){var m={};(accs||[]).forEach(function(a){m[a.toLowerCase()]=1});acts.forEach(function(b){b.hidden=!m[(b.getAttribute('data-owner')||'').toLowerCase()]})}
eth.request({method:'eth_accounts'}).then(mine).catch(function(){});
if(eth.on){eth.on('accountsChanged',mine);eth.on('disconnect',function(){mine([])})}
acts.forEach(function(b){b.addEventListener('click',async function(){
  if(b.getAttribute('aria-busy')==='true')return;
  var act=b.getAttribute('data-act');var id=b.getAttribute('data-id');
  if(act==='redeem'&&!confirm(b.getAttribute('data-confirm')))return;
  var was=b.textContent;b.setAttribute('aria-busy','true');b.textContent='\\u2026';
  try{
    var accs=await eth.request({method:'eth_requestAccounts'});if(!accs||!accs.length)throw new Error('the wallet gave no account');
    var from=accs[0];
    if(from.toLowerCase()!==(b.getAttribute('data-owner')||'').toLowerCase())throw new Error('this coin belongs to another wallet');
    try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:CFG.chainHex}]})}
    catch(e){if(e&&e.code===4902){await eth.request({method:'wallet_addEthereumChain',params:[{chainId:CFG.chainHex,chainName:CFG.name,rpcUrls:[CFG.rpc],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},blockExplorerUrls:[CFG.explorer]}]})}else{throw e}}
    say('Confirm in your wallet.');
    var data=(act==='claim'?CFG.sel.claim:CFG.sel.redeem)+word(BigInt(id));
    var hash=await eth.request({method:'eth_sendTransaction',params:[{from:from,to:CFG.address,data:data}]});
    show('Sent. Waiting for confirmation.',hash);
    for(var i=0;i<60;i++){
      var r=null;try{r=await eth.request({method:'eth_getTransactionReceipt',params:[hash]})}catch(e){}
      if(r){if(r.status==='0x1'){show(act==='claim'?'The yield is in your wallet. Reloading.':'The coin is burned and the USDC is in your wallet. Reloading.',hash);await sleep(2000);location.reload();return}
        show('The network rejected the transaction. Nothing was spent beyond gas.',hash);break}
      await sleep(2500);
    }
    if(i>=60)show('We cannot confirm the transaction yet. Check it before trying again.',hash);
  }catch(e){
    var blob='';try{blob=JSON.stringify(e)}catch(x){}blob=(blob+' '+((e&&e.message)||'')).toLowerCase();
    var said=null;for(var j=0;j<CFG.reverts.length;j++)if(blob.indexOf(CFG.reverts[j][0].toLowerCase())>=0){said=CFG.reverts[j][1];break}
    say(e&&e.code===4001?'Cancelled in the wallet.':(said||('Failed: '+((e&&e.message)||e))));
  }
  finally{b.removeAttribute('aria-busy');b.textContent=was}
})});
})();
</script>`;
}

/** The two buttons a holder gets on their own coin. */
export function coinActions(chain: ChainState, c: CoinRecord, now = Date.now()): string {
  if (!c.owner) return "";
  const fee = (c.profit * BigInt(factsOf(chain).feeBps)) / 10000n;
  const onBurn = c.nav - fee;
  const confirm = `Burning coin ${pad5(c.id)} sends ${usdcExact(onBurn)} USDC to your wallet and destroys the coin.${c.sealed ? " It never got its seed, so it has no art and never will." : ""} This cannot be undone.`;
  const claimable = c.profit > 0n;
  const open = redeemable(c, now);
  const burnLabel = open
    ? `Burn and redeem ${usdc(onBurn)}`
    : c.sealed
      ? `Burning opens on ${dateOf(c.sealedEscapeAt)} if the seed never arrives`
      : `Burning opens on ${dateOf(c.redeemableAt)}`;
  const who = c.owner.toLowerCase();
  return `<div class="actions" id="acts-${c.id}">
<button class="btn" type="button" data-act="claim" data-id="${c.id}" data-owner="${who}" hidden${claimable ? "" : " disabled"}>${claimable ? `Claim ${usdc(c.profit - fee)}` : "Nothing to claim yet"}</button>
<button class="btn" type="button" data-act="redeem" data-id="${c.id}" data-owner="${who}" data-confirm="${esc(confirm)}" hidden${open ? "" : " disabled"}>${burnLabel}</button>
</div>`;
}

export function homePage(chain: ChainState | null, status: ChainStatus | null = null, names: Names = NO_NAMES): string {
  const p = pageColors(chain);
  const f = factsOf(chain);
  const newest = chain ? newestCoin(chain) : null;
  if (!chain || !newest) return emptyHome(p, chain, status);
  const coin = coinOf(newest);
  const ids = coinIds(chain).slice(0, 40);
  const rows = ids.map((id) => coinRow(chain.coins.get(id)!, chain, names)).join("");
  const body = `<div class="page">${sidebar(chain, status)}<main id="main">
${staleNote(status)}
<section class="hero"><img class="coinimg px" src="/coin/${newest.id}.svg${IMG_Q}" alt="Coin ${pad5(newest.id)}" width="396" height="396"><div class="meta">
<span class="small">Newest coin</span>
<span class="num syne">#${pad5(newest.id)}</span>
<div>${coinTags(coin, newest)}</div>
${traitList(coin, newest.sealed, f)}
${moneyBlock(newest, coin.yieldLevel, f)}
<a class="btn" href="/coin/${newest.id}">Open the coin</a>
</div></section>
${mintBox(chain)}
<div class="counts"><div><b class="syne">${num(chain.seriesMinted)}</b><span class="small">minted in series ${roman(chain.series)}</span></div><div><b class="syne">${num(f.seriesSize - chain.seriesMinted)}</b><span class="small">left in the series</span></div><div><b class="syne">${chain.mastersLeft}</b><span class="small">Master Coins still in the urn</span></div><div><b class="syne">${num(chain.pending)}</b><span class="small">sealed, waiting for a seed</span></div><div><b class="syne">${usdc(chain.treasuryAssets)}</b><span class="small">fee on yield, not withdrawn</span></div><div id="yours" hidden><b class="syne">0</b><span class="small">yours</span></div></div>
${rows}
<p class="small" style="padding:20px 34px"><a href="/coins">All ${num(chain.coins.size)} ${plural(chain.coins.size, "coin", "coins")}</a></p>
${footer()}
</main></div>
${mintScript(chain)}
${YOURS}`;
  return layout(`${NAME} | ${descOf(chain).split(".")[0]}`, p, body, `/newest.png${IMG_Q}`, "/", descOf(chain));
}

/** Before the first mint, or with no chain to read: the sealed coin, the numbers, and the door to the rest. */
function emptyHome(p: Colors, chain: ChainState | null, status: ChainStatus | null): string {
  const f = factsOf(chain);
  const live = Boolean(chain);
  const body = `<div class="page">${sidebar(chain, status)}<main id="main">
${staleNote(status)}
${noContractNote(status)}
<section class="hero"><img class="coinimg px" src="/newest.svg${IMG_Q}" alt="A sealed coin" width="396" height="396"><div class="meta">
<span class="small">No coin minted yet</span>
<span class="num syne">#00001</span>
<p>The first coin of series ${roman(chain?.series ?? 1)} is still in the urn. Between the mint and the answer from Chainlink VRF a coin looks like this, sealed, with no seed yet; then it opens. See the <a href="/masters">${f.masters} Master Coins</a>, the <a href="/traits">traits and their odds</a>, the <a href="/yield">yield ring</a>, or <a href="/how">how it works</a>.</p>
</div></section>
${chain ? mintBox(chain) : ""}
<div class="counts"><div><b class="syne">0</b><span class="small">minted</span></div><div><b class="syne">${num(f.seriesSize)}</b><span class="small">left in series ${roman(chain?.series ?? 1)}</span></div><div><b class="syne">${f.masters}</b><span class="small">Master Coins in the urn</span></div></div>
${footer()}
</main></div>
${live ? mintScript(chain) : ""}`;
  return layout(`${NAME} | ${descOf(chain).split(".")[0]}`, p, body, `/newest.png${IMG_Q}`, "/", descOf(chain));
}

export function coinsPage(chain: ChainState | null, page: number, status: ChainStatus | null = null): string {
  const p = pageColors(chain);
  const ids = chain ? coinIds(chain) : [];
  if (!ids.length) {
    const body = `<main id="main" class="wide">${topBar("All coins")}${staleNote(status)}${noContractNote(status)}<h2 class="syne">No coins yet</h2><p>Nothing is minted. The first coin will appear here. Until then, see the <a href="/masters">Master Coins</a> and the <a href="/traits">traits</a>.</p>${footer()}</main>`;
    return layout(`All coins | ${NAME}`, p, body, `/newest.png${IMG_Q}`, "/coins");
  }
  const per = 60;
  const pages = Math.max(1, Math.ceil(ids.length / per));
  const pg = Math.min(pages, Math.max(1, page));
  const slice = ids.slice((pg - 1) * per, pg * per);
  const cells = slice.map((id) => {
    const c = chain!.coins.get(id)!;
    const coin = coinOf(c);
    return `<a class="px" href="/coin/${id}"><img src="/coin/${id}.svg${IMG_Q}" alt="Coin ${pad5(id)}" loading="lazy"><div class="cap"><b>#${pad5(id)}</b> ${esc(c.sealed ? "sealed" : coin.masterName || coin.traits.material)}</div></a>`;
  });
  const nav = `<div class="step">${pg > 1 ? `<a rel="prev" href="/coins?page=${pg - 1}" aria-label="Newer">‹</a>` : `<span class="gone"></span>`}${pg < pages ? `<a rel="next" href="/coins?page=${pg + 1}" aria-label="Older">›</a>` : `<span class="gone"></span>`}</div>`;
  const body = `<main id="main" class="wide">${topBar("All coins")}${staleNote(status)}<h2 class="syne">Coins ${pad5(slice[0])} to ${pad5(slice[slice.length - 1])}</h2><p class="small">Page ${pg} of ${pages}, newest first.</p>${nav}<div class="strip">${cells.join("")}</div>${nav}${footer()}${STEP_KEYS}</main>`;
  return layout(`All coins, page ${pg} | ${NAME}`, p, body, `/newest.png${IMG_Q}`, `/coins?page=${pg}`);
}

export function coinPage(chain: ChainState, c: CoinRecord, names: Names = NO_NAMES, status: ChainStatus | null = null): string {
  const coin = coinOf(c);
  const ids = coinIds(chain);
  const younger = ids.filter((id) => id < c.id)[0];
  const older = [...ids].reverse().filter((id) => id > c.id)[0];
  const prev = younger ? `<a rel="prev" href="/coin/${younger}" aria-label="Coin ${pad5(younger)}">‹</a>` : `<span class="gone"></span>`;
  const next = older ? `<a rel="next" href="/coin/${older}" aria-label="Coin ${pad5(older)}">›</a>` : `<span class="gone"></span>`;
  const owner = c.owner ? `${isAuthor(chain, c.owner) ? "held by the author" : `held by ${ownerLink(c.owner, names)}`}` : "holder unknown";
  const body = `<main id="main" class="single">${topBar(`#${pad5(c.id)}`)}${staleNote(status)}
${c.sealed ? `<p class="note" role="status" id="sealed-note">This coin is sealed. Chainlink VRF has not answered yet, so it has no seed and no art slot. The page reloads on its own when it opens. If the seed never arrives, this coin can be burned for its backing from ${dateOf(c.sealedEscapeAt)}.</p>` : ""}
<div class="step">${prev}${next}</div>
<img class="coinimg px" src="/coin/${c.id}.svg${IMG_Q}" alt="Coin ${pad5(c.id)}" width="512" height="512">
<span class="num syne">#${pad5(c.id)}</span>
<div>${coinTags(coin, c)}<span class="small">${c.sealed ? "sealed" : coin.masterName ? `Master Coin ${esc(coin.masterName)}` : "procedural coin"}, coin ${pad5(c.number)} of series ${roman(c.series)}${c.sealed ? "" : `, seed ${fingerprint(c.seed)}`}, ${owner}</span></div>
${traitList(coin, c.sealed)}
${moneyBlock(c, coin.yieldLevel, factsOf(chain))}
${coinActions(chain, c)}
<p class="msg" id="msg" aria-live="polite"></p>
<p class="small">${c.sealed ? `A sealed coin already holds its backing and already earns. Only the art is missing. It cannot be burned while it is sealed, unless the seed never comes: from ${dateOf(c.sealedEscapeAt)} the contract opens the door anyway, so the backing is never trapped by a request nobody answered.` : `The top eight hex digits of the seed are written under the coin; the low 32 bits are the 32 marks on the inner rim, light for one, dark for zero. The ring outside the coin is its yield: level ${coin.yieldLevel} of ${YIELD_STEPS.length}. It grows with lifetime yield and never resets, not on a claim, not on a transfer. The coin can be burned from ${dateOf(c.redeemableAt)}; claiming its yield is open the whole time.`}</p>
<nav class="nav small" aria-label="Links"><a href="${explorer(chain.chainId)}/nft/${chain.address}/${c.id}">Basescan</a><a href="${openseaCoin(chain.chainId, chain.address, c.id)}">OpenSea</a><a href="/coin/${c.id}.png${IMG_Q}">Link card</a><a href="/api/coin/${c.id}">JSON</a></nav>
${sizePicker()}
${downloadBar(c.id, coin.palette.bg)}
${footer()}${STEP_KEYS}${downloadScript()}${actionScript(chain)}${c.sealed ? sealedWatch(c.id) : ""}</main>`;
  const line = c.sealed ? "Sealed, waiting for the seed" : coin.masterName ? `Master Coin ${coin.masterName}` : [coin.traits.material, coin.traits.field, coin.traits.glyph, coin.traits.rim].join(", ");
  return layout(`Coin ${pad5(c.id)} | ${NAME}`, coin.palette, body, `/coin/${c.id}.png${IMG_Q}`, `/coin/${c.id}`, `${line}. ${c.backing} USDC backing, yield ${bpsPct(c.yieldBps)}.`);
}

/** A sealed coin's page asks the site every ten seconds and reloads when the seed lands. */
function sealedWatch(id: number): string {
  return `<script>
(function(){var n=0;async function tick(){n++;
 try{var r=await fetch('/api/coin/${id}',{cache:'no-store'});if(r.ok){var j=await r.json();if(j&&j.sealed===false){location.reload();return}}}catch(e){}
 if(n<180)setTimeout(tick,10000);else{var el=document.getElementById('sealed-note');if(el)el.textContent='This coin is still sealed. Chainlink VRF is taking long. The coin is safe; refresh to check again.'}}
setTimeout(tick,10000)})();
</script>`;
}

export function mastersPage(chain: ChainState | null, names: Names = NO_NAMES, status: ChainStatus | null = null): string {
  const p = pageColors(chain);
  const f = factsOf(chain);
  const found = chain ? mastersFound(chain) : new Map<number, CoinRecord>();
  const cells = MASTERS.slice(0, f.masters).map((m, i) => {
    const c = found.get(i);
    const img = c ? `/coin/${c.id}.svg${IMG_Q}` : `/master/${i}.svg`;
    const who = c && c.owner ? `, ${isAuthor(chain, c.owner) ? "the author" : esc(label(c.owner, names))}` : "";
    const inner = `<img src="${img}" alt="${esc(m.name)}" loading="lazy"><div class="cap"><b>${esc(m.name)}</b> ${esc(m.material)}, ${m.mode}${c ? `<br>coin #${pad5(c.id)}${who}` : "<br>still in the urn"}</div>`;
    return c ? `<a class="px" href="/coin/${c.id}">${inner}</a>` : `<div class="px gone">${inner}</div>`;
  });
  const left = chain ? chain.mastersLeft : f.masters;
  const body = `<main id="main" class="wide">${topBar("Master Coins")}${staleNote(status)}
<h2 class="syne">${f.masters} Master Coins a series</h2>
<p>Each series holds ${num(f.seriesSize)} art slots, ${f.masters} of them Master Coins. Every mint draws one slot from the ones left, so the first mint has ${f.masters} in ${num(f.seriesSize)} odds and the odds move with every draw, and when the series ends all ${f.masters} are out. A Master Coin carries whatever backing its minter chose, ${backingList(f.backings)} USDC. ${f.masters - left} of ${f.masters} drawn in series ${roman(chain?.series ?? 1)}. The images of the ones still in the urn show the master with a sample seed; the rim marks and the legend will differ on the real coin.</p>
<div class="strip">${cells.join("")}</div>
${footer()}</main>`;
  return layout(`Master Coins | ${NAME}`, p, body, `/newest.png${IMG_Q}`, "/masters");
}

export function traitsPage(chain: ChainState | null): string {
  const p = pageColors(chain);
  const f = factsOf(chain);
  const tables = TABLES.map((tb) => {
    const total = tb.weights.reduce((a, b) => a + b, 0);
    const rows = tb.names.map((n, i) => `<tr><td>${esc(n)}</td><td class="n">${pctOf((100 * tb.weights[i]) / total)}</td></tr>`).join("");
    return `<h3 class="syne">${tb.trait}</h3><table class="tr"><thead><tr><th>value</th><th>odds</th></tr></thead><tbody>${rows}</tbody></table>`;
  });
  const body = `<main id="main" class="wide">${topBar("Traits")}
<h2 class="syne">Eleven traits, drawn from the seed</h2>
<p>The seed comes from Chainlink VRF. It is drawn into these tables in this order, each draw with the odds below, then into a pattern scale, sixteen bits for the glyph and a salt for speckle. The seed also writes itself on the coin: eight hex digits under it, thirty-two marks on the rim. Two coins with the same eleven traits still differ. Master Coins skip the tables; they keep only their material.</p>
<p>There is no rarity class. Rarity is the odds of a coin's own traits, and the only status the system defines is the Master Coin: ${f.masters} in ${num(f.seriesSize)}, ${pctOf((100 * f.masters) / f.seriesSize)} of a series.</p>
${tables.join("")}
${footer()}</main>`;
  return layout(`Traits and odds | ${NAME}`, p, body, `/newest.png${IMG_Q}`, "/traits");
}

export function yieldPage(chain: ChainState | null): string {
  const p = pageColors(chain);
  const sample = "79db4ac1deadbeef";
  const cells = [0, ...YIELD_STEPS].map((bps, level) => `<div class="px"><img src="/preview/${sample}.svg?yield=${bps}" alt="Level ${level}" loading="lazy"><div class="cap"><b>Level ${level}</b> from ${bpsPct(bps)}</div></div>`);
  const body = `<main id="main" class="wide">${topBar("Yield ring")}
<h2 class="syne">The coin ages with its capital</h2>
<p>The centre of a coin never changes. Around it the renderer reads one number from the contract: lifetime yield over backing, in basis points. Claiming yield does not lower it; selling the coin does not reset it. It only goes up, and the ring follows it through ${YIELD_STEPS.length} levels: one orbit each for the first four, then the orbits fill in, then sparks between them, then the orbits take the accent colour.</p>
<div class="levels">${cells.join("")}</div>
<p class="small">Shown on a sample seed, ${sample.toUpperCase().slice(0, 8)}. The levels start at ${YIELD_STEPS.map(bpsPct).join(", ")} of lifetime yield.</p>
${footer()}</main>`;
  return layout(`Yield ring | ${NAME}`, p, body, `/newest.png${IMG_Q}`, "/yield");
}

export function howPage(chain: ChainState | null, status: ChainStatus | null = null): string {
  const p = pageColors(chain);
  const f = factsOf(chain);
  const where = chain
    ? `<p>The contract is <a href="${explorer(chain.chainId)}/address/${chain.address}">${chain.address}</a> on ${chainName(chain.chainId)}. The vault it deposits into is <a href="${explorer(chain.chainId)}/address/${chain.vault}">${chain.vault}</a>, and the USDC is <a href="${explorer(chain.chainId)}/address/${chain.usdc}">${chain.usdc}</a>. The renderer new coins are pinned to is <a href="${explorer(chain.chainId)}/address/${chain.renderer}">${chain.renderer}</a>${chain.rendererLocked ? ", and it is locked for good" : ", and the author may still replace it for coins not yet minted"}.</p>`
    : `<p>${status?.configured ? "The chain did not answer, so the addresses are not on this page right now." : "No contract is configured on this server, so there is no address to show yet."}</p>`;
  const body = `<main id="main" class="prose">${topBar("How it works")}${staleNote(status)}
<h2 class="syne">Two axes that never touch</h2>
<p>Every coin has art and capital, and they are drawn apart. The art comes from a random seed and an art slot. The capital is the USDC you put in at mint: ${backingList(f.backings)}. You choose the amount; you do not choose the art, and paying more buys no better odds. A ${f.backings[0]} USDC coin can be a Master Coin. A ${f.backings[f.backings.length - 1]} USDC coin can be plain.</p>
<h2 class="syne">Where the money sits</h2>
<p>The contract deposits your USDC into a vault on Base that follows the ERC-4626 standard and keeps the shares under your coin. The vault lends the USDC out and the shares grow in value. The coin's net asset value is what its shares convert to today. Burn the coin and the contract sends you the backing plus the yield earned, minus ${f.feePct}% of that yield, which goes to the author. That is the whole fee. The mint price is the backing, nothing on top. Yield can be claimed without burning; the coin keeps its record of everything it ever earned.</p>
<p>A coin can be burned ${f.lockDays} days after its mint, not before. Claiming its yield is open from the first day; the wait stops churn, not withdrawal. A sealed coin cannot be burned at all, because a burn would take a slot out of a draw whose random words are already public.</p>
<p>The contract has no admin over the pool. No pause on redeem, no upgrade, no key that can move the funds. The code holds the money, not a person. The vault is a third party with its own risks; read about it before you mint.</p>
${where}
<h2 class="syne">Randomness nobody steers</h2>
<p>The seed of each coin comes from Chainlink VRF, a verifiable random number the contract requests at mint and receives a few blocks later. A mint sends ${chain ? eth(chain.vrfFeeWei) : "a small amount of ETH"} with it, one fee per transaction whatever the count, and the contract passes it straight to its Chainlink subscription in the same transaction, so the randomness pays for itself and the contract never sits on ETH. Between the two the coin is sealed: it holds its backing and earns, and its art is missing. The art slot comes from an urn: a series has ${num(f.seriesSize)} slots, ${f.masters} of them Master Coins, and every mint takes one slot out at random from those left. The odds of a Master Coin start at ${f.masters} in ${num(f.seriesSize)} and move with every draw. When a series is full, every one of its ${f.masters} Master Coins is out, no more and no fewer. The author cannot know or choose who gets them. If Chainlink never answers, anyone can ask again from the contract after its retry window, and this site does it for you. If no answer ever comes, the coin can be burned for its backing after ${f.escapeDays} days, so the money is never trapped by a request nobody filled.</p>
<h2 class="syne">Series without end</h2>
<p>A series is ${num(f.seriesSize)} coins. When it fills, the next one opens with its own urn and its own ${f.masters} Master Coins. The Master Coins keep their names across series; each series renders its own version from a new seed.</p>
<h2 class="syne">Founder coins</h2>
<p>${f.founders} coins a series belong to the author, who mints them from the author wallet at no cost, class ${f.backings[f.backings.length - 1]} USDC, art from the same urn as everyone. They can only be minted while the series is inside its first ${num(f.founderWindow)} coins. When that window closes, whatever the author has not minted is gone for that series, so the free mints cannot wait for a moment when the urn is dense with Master Coins. Their backing is not paid at mint. The contract fills it from the author's ${f.feePct}% of yield, oldest founder coin first, until each holds its ${f.backings[f.backings.length - 1]} USDC. Until then the coin shows how much is funded, earns yield on that amount, and a burn returns that amount. No other minter's money ever backs a founder coin. They carry the trait Origin: Founder.</p>
<h2 class="syne">The image</h2>
<p>The coin is a 64 by 64 pixel grid drawn by a renderer contract from the seed and the contract's own numbers. No server, no file store, no link. <code>tokenURI</code> returns the metadata and the SVG inline. The seed is written on the coin: eight hex digits under it, thirty-two marks on the inner rim. The ring outside the coin is its lifetime yield; see the <a href="/yield">yield ring</a>. The renderer can be replaced by the author for future mints only; every coin keeps the renderer it was minted with.</p>
<h2 class="syne" id="risk">What can go wrong</h2>
<p>${RISK}</p>
<h2 class="syne">What this is not</h2>
<p>Not an investment product and not advice. The art is CC0.</p>
${footer()}</main>`;
  return layout(`How it works | ${NAME}`, p, body, `/newest.png${IMG_Q}`, "/how");
}

export function notFound(chain: ChainState | null, what = "No such page."): string {
  const body = `<main id="main" class="prose">${topBar("Not found")}<h2 class="syne">Not found</h2><p>${esc(what)}</p><p><a href="/">Back to the coins</a></p>${footer()}</main>`;
  return layout(`Not found | ${NAME}`, pageColors(chain), body);
}

export function chainDown(chain: ChainState | null, why = "This page needs the chain, and the chain did not answer. Try again in a minute."): string {
  const body = `<main id="main" class="prose">${topBar("Unavailable")}<h2 class="syne">The chain did not answer</h2><p>${esc(why)}</p><p><a href="/">Back to the coins</a></p>${footer()}</main>`;
  return layout(`The chain did not answer | ${NAME}`, pageColors(chain), body);
}
