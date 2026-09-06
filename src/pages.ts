/** Inner pages: your wallet, one holder, assets. The same shape as the sisters. */
import type { Address } from "viem";
import { SITE, REPO, PARENT, NAME, layout, topBar, footer, previewNote, pageColors, esc, num, plural, shortAddr, PREVIEW } from "./site.ts";
import { whoBlock, connectScript, downloadScript, sizePicker, nameHeading } from "./wallet.ts";
import { SERIES_SIZE, MASTERS_PER_SERIES, BACKINGS } from "./preview.ts";

/** The way in: connect a wallet or type an address, then land on that wallet's page. */
export function yoursPage(bad: string | null = null): string {
  const body = `<main class="wide" id="main">
${topBar("Your wallet")}
${previewNote()}
<div><h2 class="syne">Your coins</h2><p class="lead" style="margin-top:8px">Connect a wallet or type an address, and this page lists every coin it holds with its backing, its yield and its ring, each one ready to save as SVG, PNG or JPEG.</p></div>
${bad !== null ? `<p class="note" role="alert">"${esc(bad)}" is not a wallet address or an ENS name. An address is 42 characters starting with 0x; a name ends in .eth.</p>` : ""}
${whoBlock(true)}
<p class="small">Viewing a wallet needs no transaction and no signature. Its public address appears in the page URL and is sent to this site to load its tokens. The same list is on <a href="https://${PARENT}/wallet">${PARENT}</a> for every collection at once; each site connects on its own.</p>
${footer()}
</main>
${connectScript("/", true)}`;
  return layout(`Your coins | ${NAME}`, pageColors(), body, "/newest.png", "/yours");
}

/** One wallet. In preview no wallet holds a coin, and the page says so. */
export function holderPage(who: Address, handle: string, name: string | null): string {
  const rawName = name ?? shortAddr(who);
  const body = `<main class="wide" id="main">
${topBar(rawName)}
${previewNote()}
<div><h2 class="syne">${nameHeading(rawName)}</h2><p class="lead" style="margin-top:8px">${PREVIEW ? "No coins yet: no contract is live, so no wallet holds one." : "No coins yet."}${handle.toLowerCase() !== who.toLowerCase() ? ` <span class="small">${shortAddr(who)}</span>` : ""}</p></div>
${whoBlock(true)}
<p>When minting opens, this page will list every coin of this wallet with its backing, its lifetime yield and its ring, and let you claim yield or burn a coin to redeem. Until then, <a href="/coins">browse the preview series</a>.</p>
<nav class="nav small" style="padding-top:20px;border-top:1px solid var(--line)" aria-label="Wallet links"><a href="https://basescan.org/address/${who}">Basescan</a><a href="https://opensea.io/${who}">OpenSea</a><a href="/api/holder/${who}">JSON</a><a href="https://${PARENT}/wallet/${who}">This wallet on ${PARENT}</a></nav>
${footer()}
</main>
${connectScript("/")}`;
  return layout(`${rawName} | ${NAME}`, pageColors(), body, "/newest.png", `/${handle}`, `Coins of ${SITE} held by ${rawName}.`);
}

export function assetsPage(): string {
  const img = esc(`<img src="https://${SITE}/coin/1.svg" width="256" height="256" alt="Coin 00001 of one.onenft.click" style="image-rendering:pixelated">`);
  const body = `<main class="prose" id="main">
${topBar("Assets")}
<h2 class="syne">Take it. It is yours.</h2>
<p>Every coin, the fifty Master Coins, the renderer, the contracts and the text of this site are <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>. No credit needed, no permission to ask. Print it, remix it, mint it elsewhere. Owning a coin gives you the token and its backing; the image belongs to everyone. The site's code in the repository carries its own license file; the fonts Syne and Newsreader are under the SIL Open Font License; the libraries the site uses keep their own licenses.</p>
<h2 class="syne">Images</h2>
<p>Any coin as SVG at <code>/coin/N.svg</code>, as a 1024 pixel PNG at <code>/coin/N-1024.png</code>, and as a 1200 by 630 link card at <code>/coin/N.png</code>. The same coin at any yield level at <code>/coin/N.svg?yield=BPS</code>, any seed at <code>/preview/HEX.svg</code>, and each Master Coin with a sample seed at <code>/master/I.svg</code>. The SVG is the same file the contract holds: a 64 by 64 grid, one path per colour. Render it with <code>image-rendering: pixelated</code> so the pixels stay square.</p>
<pre class="snip">${img}</pre>
<h2 class="syne">Data</h2>
<p><a href="/api/state">/api/state</a> gives the series, the supply, the Master Coins found and the newest coins. <code>/api/coin/N</code> returns one coin: seed, fingerprint, traits, rarity, backing, yield, image links. <code>/api/holder/ADDRESS</code> lists one wallet's coins. <a href="/spec.json">/spec.json</a> holds the trait tables with their odds, the yield levels, the ${MASTERS_PER_SERIES} Master Coin names and modes, and the backing classes ${BACKINGS.join(", ")}, so you can port the generator. All JSON, open to any origin.</p>
<h2 class="syne">Code and contract</h2>
<p>The generator in TypeScript and Solidity, the site and the contracts: <a href="${REPO}">${REPO.replace("https://", "")}</a>. ${PREVIEW ? "No contract is deployed yet; the address will appear here." : ""} Every collection: <a href="https://${PARENT}">${PARENT}</a>.</p>
<p class="small">A series is ${num(SERIES_SIZE)} coins. <a href="/">Back to the coins</a></p>
${footer()}
</main>`;
  return layout(`Assets | ${NAME}`, pageColors(), body, "/newest.png", "/assets");
}


