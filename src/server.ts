import { transactionApi } from "./transaction-status.ts";
import { mintPage } from "./mint-page.ts";
/**
 * The server. Every page that shows a coin reads the chain through the cache
 * in contract.ts: the last good state at once, a wait only before the first
 * read answers. Without CONTRACT_ADDRESS the site is a plain renderer and
 * every page says so. Routes mirror the sisters so the hub can read
 * /api/state and /api/holder the same way.
 */
import { MASTERS } from "./coin.ts";
import { refreshCoin, refreshHoldings } from "./contract.ts";
import { withDeadline } from "./swr.ts";
import { seriesCoinId } from "./series.ts";
import { chainState, chainStatus, contractEnabled, readNow, newestCoin, factsOf, backingList, IMG_V, IMG_Q, CONTRACT, CHAIN_ID, type ChainState } from "./contract.ts";
import { coinOfSeed, placeholderCoin } from "./preview.ts";
import { coinOf } from "./token.ts";
import { homePage, coinsPage, coinPage, mastersPage, traitsPage, yieldPage, howPage, legalPage, notFound, chainDown, pad5, bpsPct, num, type Names } from "./site.ts";
import { coinJson, stateJson, specJson, holderJson } from "./api.ts";
import { cardPng, squarePng } from "./image.ts";
import { yoursPage, holderPage, assetsPage } from "./pages.ts";
import { goTarget } from "./wallet.ts";
import { resolveHolder, resolveFailed, ensNames } from "./ens.ts";
import { startKeeper, keeperInfo } from "./keeper.ts";
import { isAddress, type Address, type Hex } from "viem";

const transactionRead = transactionApi({ address: CONTRACT, chainId: CHAIN_ID, tokenReads: true });
const PORT = Number(process.env.PORT ?? 3000);
const BOOT_AT = Date.now();

const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const svg = (s: string, immutable: boolean) => new Response(s, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=60", "access-control-allow-origin": "*" } });
const png = (b: Uint8Array, immutable: boolean) => new Response(b as Uint8Array<ArrayBuffer>, { headers: { "content-type": "image/png", "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300", "access-control-allow-origin": "*" } });
const json = (o: unknown, maxAge = 15, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 && maxAge > 0 ? `public, max-age=${maxAge}` : "no-store", "access-control-allow-origin": "*" } });
/** An image with a chosen lifetime, for the coin routes: how long depends on the URL's tag. */
const svgFor = (s: string, maxAge: number) => new Response(s, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": `public, max-age=${maxAge}`, "access-control-allow-origin": "*" } });
const pngFor = (b: Uint8Array, maxAge: number) => new Response(b as Uint8Array<ArrayBuffer>, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${maxAge}`, "access-control-allow-origin": "*" } });
const text = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

export function withHeaders(res: Response): Response {
  const h = res.headers;
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-frame-options", "SAMEORIGIN");
  return res;
}

export async function handle(req: Request): Promise<Response> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return text("bad request", 400);
  }
  try {
    return withHeaders(await route(url));
  } catch (e) {
    console.error(`route ${url.pathname}:`, (e as Error).message);
    return withHeaders(url.pathname.startsWith("/api/") ? json({ error: "internal error" }, 0, 500) : text("internal error", 500));
  }
}

/** ENS names for the owners a page will show. Never throws. */
async function namesFor(chain: ChainState | null, only?: Iterable<string>): Promise<Names> {
  if (!chain) return new Map();
  const list = only ? [...only] : [...new Set([...chain.coins.values()].map((c) => c.owner).filter(Boolean) as string[])];
  return ensNames(list);
}
/** Owners of the newest coins, the ones the home page lists. */
function recentOwners(chain: ChainState, n = 40): string[] {
  return [...chain.coins.keys()].sort((a, b) => b - a).slice(0, n).map((id) => chain.coins.get(id)!.owner).filter(Boolean) as string[];
}

async function route(url: URL): Promise<Response> {
  const path = url.pathname;
  const transactionResponse = await transactionRead(url);
  if (transactionResponse) return transactionResponse;

  // ---- everything that needs no chain answers before any chain read
  if (path === "/robots.txt") return text("User-agent: *\nAllow: /\nDisallow: /api/\n");
  if (path === "/health") return text(`ok, up ${Math.floor((Date.now() - BOOT_AT) / 1000)} s`);
  if (path === "/ready") {
    const s = chainStatus();
    const ok = !s.configured || s.known;
    return json({ ok, chain: s, keeper: keeperInfo() }, 0, ok ? 200 : 503);
  }
  if (path === "/spec.json") return json(specJson(await chainState()), 3600);
  if (path === "/traits") return html(traitsPage(await chainState()));
  if (path === "/yield") return html(yieldPage(await chainState()));
  if (path === "/go") return redirect(goTarget(url.searchParams.get("who")));

  // A master with a sample seed, for the ones nobody has drawn yet.
  const master = path.match(/^\/master\/(\d{1,2})\.svg$/);
  if (master) {
    const i = Number(master[1]);
    if (!MASTERS[i]) return text("no such master", 404);
    return svg(coinOfSeed(0x5eedn * BigInt(i + 1), 0, i).svg, true);
  }

  // Any seed, for the yield demo and for anyone porting the generator: /preview/<16 hex>.svg?yield=<bps>
  const pre = path.match(/^\/preview\/([0-9a-fA-F]{1,16})\.svg$/);
  if (pre) {
    const y = Math.min(100000, Math.max(0, Number(url.searchParams.get("yield") ?? 0) || 0));
    return svg(coinOfSeed(BigInt("0x" + pre[1]), y).svg, true);
  }

  // ---- from here on pages show chain state
  let chain = await chainState();
  let status = chainStatus();

  const seriesLink = path.match(/^\/series\/(\d+)\/coin\/(\d+)$/);
  if (seriesLink || path === "/series-coin") {
    if (!chain) return html(chainDown(chain), 503);
    const id = seriesCoinId(seriesLink?.[1] ?? url.searchParams.get("series") ?? "", seriesLink?.[2] ?? url.searchParams.get("number") ?? "", chain.seriesSize);
    return id === null ? text("invalid series or coin number", 400) : redirect(`/coin/${id}`);
  }

  if (path === "/") return html(homePage(chain, status, await namesFor(chain, chain ? recentOwners(chain) : undefined)));
  if (path === "/coins") return html(coinsPage(chain, Number(url.searchParams.get("page") ?? 1), status));
  if (path === "/masters") return html(mastersPage(chain, await namesFor(chain), status));
  if (path === "/how") return html(howPage(chain, status));
  if (path === "/terms" || path === "/privacy") return html(legalPage(path.slice(1) as "terms" | "privacy", chain));
  if (path === "/assets") return html(assetsPage(chain, status));
  if (path === "/yours") return html(yoursPage(chain, status, url.searchParams.get("bad")));
  if (path === "/api/mints") {
    if (!chain || status.stale) return json({ error: "chain unavailable" }, 0, 503);
    const snapshot = chain;
    const page = mintPage(snapshot, [...snapshot.coins.keys()], url.searchParams, (id) => coinJson(snapshot.coins.get(id)!, snapshot, undefined, status));
    if ("error" in page) return json(page, 0, 400);
    // Burns remove holdings, not minted ids. Never move an announcer's head backwards.
    const head = snapshot.nextId - 1;
    return json({ ...page, head, nextCursor: url.searchParams.get("after") === "latest" ? head : page.nextCursor }, 0);
  }
  if (path === "/api/state") return json(stateJson(chain, await namesFor(chain, chain ? recentOwners(chain) : undefined), status), 15);

  // The newest coin as the site's own image, or the sealed stand-in.
  if (path === "/newest.svg" || path === "/newest.png") {
    const newest = chain ? newestCoin(chain) : null;
    const c = newest ? coinOf(newest) : placeholderCoin();
    // /newest changes with every mint, so the tag does not make it cacheable; it only keeps the
    // last contract's copy out of the way.
    if (path === "/newest.svg") return svg(c.svg, false);
    if (!newest) {
      const f = factsOf(chain);
      return png(cardPng(`sealed-${f.seriesSize}-${f.masters}`, "ONE", "no coin minted yet", `${num(f.seriesSize)} coins a series, ${f.masters} Master Coins, every coin backed by ${backingList(f.backings)} USDC`, c), false);
    }
    return png(cardPng(`newest${newest.id}-${newest.yieldBps}-${newest.sealed ? 1 : 0}`, "ONE", `newest coin #${pad5(newest.id)}`, newest.sealed ? "sealed, waiting for the seed" : `${c.traits.material}, ${c.traits.field}, ${c.traits.glyph}`, c), false);
  }

  const m = path.match(/^\/(api\/)?coin\/(\d{1,7})(\.svg|\.png|-1024\.png)?$/);
  if (m) {
    const id = Number(m[2]);
    if (!m[3]) {
      chain = await withDeadline(refreshCoin(id, afterBlock(url.searchParams)), 2500).catch(() => chain);
      status = chainStatus();
    }
    if (!contractEnabled()) return m[1] ? json({ error: "no contract configured" }, 0, 404) : html(notFound(chain, "No contract is configured on this server, so no coin exists."), 404);
    const c = chain?.coins.get(id);
    if (c && afterBlock(url.searchParams) > (c.readBlock ?? 0n)) status = { ...status, stale: true, error: "The transaction is confirmed, but this RPC has not caught up yet. Refresh to check the updated coin." };
    if (!c) {
      // Unknown here. That is "no such coin" only when the chain answered and the id is past the last mint.
      const absentBlock = chain?.absentCoins?.get(id)?.readBlock ?? (chain && id >= chain.nextId ? chain.blockNumber ?? 0n : 0n);
      const unread = !chain || status.stale || afterBlock(url.searchParams) > absentBlock;
      if (unread) return m[1] ? json({ error: "the chain did not answer for this coin", chain: status }, 0, 503) : html(chainDown(chain, `Coin ${pad5(id)} could not be read from the chain. Try again in a minute.`), 503);
      return m[1] ? json({ error: "no such coin", minted: chain!.minted }, 0, 404) : html(notFound(chain, `Coin ${pad5(id)} does not exist. ${chain!.nextId - 1} coins are minted.`), 404);
    }
    const coin = coinOf(c);
    if (m[1]) return json(coinJson(c, chain!, await namesFor(chain, c.owner ? [c.owner] : []), status), c.sealed ? 0 : 15);
    // A coin's image is only worth caching when the URL names the contract it came from: ids
    // restart at 1 with a new one. It is never immutable, because the yield ring grows with the
    // coin's lifetime yield, and a sealed coin changes the moment its seed lands.
    const tagged = IMG_V !== "" && url.searchParams.get("c") === IMG_V;
    const hold = tagged && !c.sealed ? 3600 : 60;
    if (m[3] === ".svg") {
      const y = url.searchParams.get("yield");
      if (y !== null && !c.sealed) {
        const bps = Math.min(100000, Math.max(0, Number(y) || 0));
        return svg(coinOfSeed(c.seed, bps, c.master).svg, true);
      }
      return svgFor(coin.svg, hold);
    }
    const key = `coin${id}-${c.yieldBps}-${c.sealed ? 1 : 0}`;
    if (m[3] === ".png") return pngFor(cardPng(key, `#${pad5(id)}`, c.sealed ? "sealed coin" : coin.masterName ? `Master Coin ${coin.masterName}` : "coin", `${c.backing} USDC, yield ${bpsPct(c.yieldBps)}${c.sealed ? "" : `, ${coin.traits.material}`}`, coin), hold);
    if (m[3] === "-1024.png") return pngFor(squarePng(key, coin), hold);
    return html(coinPage(chain!, c, await namesFor(chain, c.owner ? [c.owner] : []), status));
  }

  const holder = path.match(/^\/(api\/holder\/)?(0x[0-9a-fA-F]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)$/i);
  if (holder) {
    if (!contractEnabled()) return holder[1] ? json({ error: "no contract configured" }, 0, 404) : html(notFound(chain, "No contract is configured on this server, so no wallet holds a coin."), 404);
    if (!chain) return holder[1] ? json({ error: "the chain did not answer", chain: status }, 0, 503) : html(chainDown(chain), 503);
    const who = await resolveHolder(holder[2]);
    if (!who || !isAddress(who)) {
      const failed = resolveFailed(holder[2]);
      if (holder[1]) return json({ error: failed ? "ENS did not answer" : "no such name" }, 0, failed ? 503 : 404);
      return html(failed ? chainDown(chain, "ENS did not answer. Try the name again in a minute, or use the address.") : notFound(chain, `No wallet answers to ${holder[2]}.`), failed ? 503 : 404);
    }
    const names = await ensNames([who]);
    if (url.searchParams.get("refresh") === "1") {
      chain = await withDeadline(refreshHoldings(afterBlock(url.searchParams)), 2500).catch(() => chain) ?? chain;
      status = chainStatus();
    }
    if (afterBlock(url.searchParams) > (chain.ownersReadBlock ?? 0n)) status = { ...status, stale: true, error: "The transaction is confirmed, but these holdings have not caught up yet. Refresh to check them again." };
    if (holder[1]) return json(holderJson(who, chain, names, status), 15);
    return html(holderPage(chain, who as Address, holder[2], names, status));
  }
  if (path.startsWith("/api/")) return json({ error: "no such endpoint" }, 0, 404);
  return html(notFound(chain), 404);
}

if (import.meta.main) {
  if (contractEnabled()) {
    // A dead RPC at boot must not take the site down with it: the images and the static pages need no chain.
    readNow()
      .then((st) => console.log(`contract ${CONTRACT} on chain ${CHAIN_ID}, series ${st.series}, ${st.seriesMinted} minted, ${st.pending} sealed, ${st.mastersLeft} masters left, renderer ${st.renderer}`))
      .catch((e) => console.error("contract state unavailable at boot, serving without it:", (e as Error).message));
    if (process.env.DEPLOYER_KEY) startKeeper(process.env.DEPLOYER_KEY as Hex);
  }
  const server = Bun.serve({ port: PORT, fetch: handle });
  if (process.send) process.send({ port: server.port });
  console.log(`one.onenft.click on :${PORT}${contractEnabled() ? "" : ", no contract configured"}`);
}

/** Receipt block hint; bounded input and reader cooldown prevent unbounded refreshes. */
export function afterBlock(params: URLSearchParams): bigint {
  const raw = params.get("afterBlock") ?? "";
  return params.get("refresh") === "1" && /^[1-9]\d{0,15}$/.test(raw) ? BigInt(raw) : 0n;
}
