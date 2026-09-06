/** Inner pages: your wallet, one holder, assets. The same shape as the sisters. */
import type { Address } from "viem";
import {
  SITE, REPO, PARENT, NAME, layout, topBar, footer, staleNote, noContractNote, pageColors, esc, num, plural, shortAddr,
  usdc, bpsPct, pad5, traitList, moneyBlock, coinTags, coinActions, actionScript, isAuthor, factTile, type Names, NO_NAMES,
} from "./site.ts";
import { whoBlock, connectScript, downloadScript, downloadBar, sizePicker, nameHeading } from "./wallet.ts";
import { IMG_Q, factsOf, coinsOf, explorer, openseaCoin, openseaWallet, type ChainState, type ChainStatus } from "./contract.ts";
import { coinOf } from "./token.ts";
import { holderFacts } from "./facts.ts";

/** The way in: connect a wallet or type an address, then land on that wallet's page. */
export function yoursPage(chain: ChainState | null, status: ChainStatus | null = null, bad: string | null = null): string {
  const body = `<main class="wide" id="main">
${topBar("Your wallet")}
${staleNote(status)}
${noContractNote(status)}
<div><h2 class="syne">Your coins</h2><p class="lead" style="margin-top:8px">Connect a wallet or type an address, and this page lists every coin it holds with its backing, its yield and its ring, each one ready to save as SVG, PNG or JPEG, and each one ready to claim or burn.</p></div>
${bad !== null ? `<p class="note" role="alert">"${esc(bad)}" is not a wallet address or an ENS name. An address is 42 characters starting with 0x; a name ends in .eth.</p>` : ""}
${whoBlock(Boolean(chain))}
<p class="small">Viewing a wallet needs no transaction and no signature. Its public address appears in the page URL and is sent to this site to load its tokens. The same list is on <a href="https://${PARENT}/wallet">${PARENT}</a> for every collection at once; each site connects on its own.</p>
${footer()}
</main>
${connectScript("/", true)}`;
  return layout(`Your coins | ${NAME}`, pageColors(chain), body, `/newest.png${IMG_Q}`, "/yours");
}

/** One wallet: its coins, what they hold, and the two things its owner can do with each. */
export function holderPage(chain: ChainState, who: Address, handle: string, names: Names = NO_NAMES, status: ChainStatus | null = null): string {
  const f = factsOf(chain);
  const rawName = names.get(who.toLowerCase()) ?? shortAddr(who);
  const mine = coinsOf(chain, who);
  const facts = holderFacts(who, chain);
  const factList = facts.length ? `<ul class="facts" aria-label="About these coins">${facts.map((f) => factTile(f.figure, f.label)).join("")}</ul>` : "";
  const rows = mine.map((c) => {
    const coin = coinOf(c);
    const links = [`<a href="/coin/${c.id}">Coin page</a>`, `<a href="${openseaCoin(chain.chainId, chain.address, c.id)}">OpenSea</a>`, `<a href="${explorer(chain.chainId)}/nft/${chain.address}/${c.id}">Basescan</a>`].join(", ");
    return `<div class="tok" id="coin-${c.id}">
<a href="/coin/${c.id}"><img class="px" src="/coin/${c.id}.svg${IMG_Q}" width="256" height="256" alt="Coin ${pad5(c.id)}" loading="lazy"></a>
<div class="meta">
<div class="num syne">#${pad5(c.id)}${coinTags(coin, c)}</div>
<p class="small" style="margin:0">${c.sealed ? "sealed, waiting for the seed from Chainlink VRF" : coin.masterName ? `Master Coin ${esc(coin.masterName)}` : esc(coin.traits.material)}, series ${c.series}, ${c.backing} USDC class, yield ${bpsPct(c.yieldBps)}</p>
${traitList(coin, c.sealed, f)}
${moneyBlock(c, coin.yieldLevel, f)}
${coinActions(chain, c)}
<p class="small" style="margin:0">${links}.</p>
${downloadBar(c.id, coin.palette.bg)}
</div>
</div>`;
  });
  const body = `<main class="wide" id="main">
${topBar(rawName)}
${staleNote(status)}
<div><h2 class="syne">${nameHeading(rawName)}</h2><p class="lead" style="margin-top:8px">${mine.length ? `${mine.length} ${plural(mine.length, "coin", "coins")}${isAuthor(chain, who) ? ", the author's wallet" : ""}.` : "No coins yet."}${handle.toLowerCase() !== who.toLowerCase() ? ` <span class="small">${shortAddr(who)}</span>` : ""}</p></div>
${factList}
${whoBlock(true)}
${rows.length ? `${sizePicker()}\n<div>${rows.join("\n")}</div>` : `<p>No coins here yet. <a href="/#mint">Mint one</a>.</p>`}
<nav class="nav small" style="padding-top:20px;border-top:1px solid var(--line)" aria-label="Wallet links"><a href="${explorer(chain.chainId)}/address/${who}">Basescan</a><a href="${openseaWallet(chain.chainId, who)}">OpenSea</a><a href="/api/holder/${who}">JSON</a><a href="https://${PARENT}/wallet/${who}">This wallet on ${PARENT}</a></nav>
${footer()}
</main>
${connectScript("/")}
${rows.length ? `${downloadScript()}${actionScript(chain)}` : ""}`;
  return layout(`${rawName} | ${NAME}`, pageColors(chain), body, `/newest.png${IMG_Q}`, `/${handle}`, `${mine.length} ${plural(mine.length, "coin", "coins")} of ${SITE} held by ${rawName}.`);
}

export function assetsPage(chain: ChainState | null, status: ChainStatus | null = null): string {
  const f = factsOf(chain);
  const img = esc(`<img src="https://${SITE}/coin/1.svg" width="256" height="256" alt="Coin 00001 of one.onenft.click" style="image-rendering:pixelated">`);
  const where = chain
    ? `Token contract <a href="${explorer(chain.chainId)}/address/${chain.address}">${chain.address}</a>, renderer <a href="${explorer(chain.chainId)}/address/${chain.renderer}">${chain.renderer}</a>.`
    : status?.configured
      ? "The chain did not answer, so the addresses are not on this page right now."
      : "No contract is configured on this server, so there is no address here yet.";
  const body = `<main class="prose" id="main">
${topBar("Assets")}
<h2 class="syne">Take it. It is yours.</h2>
<p>Every coin, the fifty Master Coins, the renderer, the contracts and the text of this site are <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>. No credit needed, no permission to ask. Print it, remix it, mint it elsewhere. Owning a coin gives you the token and its backing; the image belongs to everyone. The site's code in the repository carries its own license file; the fonts Syne and Newsreader are under the SIL Open Font License; the libraries the site uses keep their own licenses.</p>
<h2 class="syne">Images</h2>
<p>Any coin as SVG at <code>/coin/N.svg</code>, as a 1024 pixel PNG at <code>/coin/N-1024.png</code>, and as a 1200 by 630 link card at <code>/coin/N.png</code>. The same coin at any yield level at <code>/coin/N.svg?yield=BPS</code>, any seed at <code>/preview/HEX.svg</code>, and each Master Coin with a sample seed at <code>/master/I.svg</code>. The SVG is the same file the contract holds: a 64 by 64 grid, one path per colour. Render it with <code>image-rendering: pixelated</code> so the pixels stay square.</p>
<pre class="snip">${img}</pre>
<h2 class="syne">Data</h2>
<p><a href="/api/state">/api/state</a> gives the series, the supply, the Master Coins left and the newest coins. <code>/api/coin/N</code> returns one coin: seed, fingerprint, traits, rarity, backing, yield, holder, image links. <code>/api/holder/ADDRESS</code> lists one wallet's coins. <a href="/spec.json">/spec.json</a> holds the trait tables with their odds, the yield levels, the ${f.masters} Master Coin names and modes, and the backing classes ${f.backings.join(", ")}, so you can port the generator. Every answer carries a <code>chain</code> block that says how old the numbers are. All JSON, open to any origin. The metadata a marketplace reads comes from the contract's own <code>tokenURI</code>, not from here.</p>
<h2 class="syne">Code and contract</h2>
<p>The generator in TypeScript and Solidity, the site and the contracts: <a href="${REPO}">${REPO.replace("https://", "")}</a>. ${where} Every collection: <a href="https://${PARENT}">${PARENT}</a>.</p>
<p class="small">A series is ${num(f.seriesSize)} coins. <a href="/">Back to the coins</a></p>
${footer()}
</main>`;
  return layout(`Assets | ${NAME}`, pageColors(chain), body, `/newest.png${IMG_Q}`, "/assets");
}
