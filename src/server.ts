/**
 * The server. Preview mode until a contract exists: every page draws from the
 * simulated series in preview.ts. Routes mirror the sisters so the hub can read
 * /api/state and /api/coin/<n> the same way.
 */
import { MASTERS } from "./coin.ts";
import { PREVIEW_SUPPLY, previewCoin, previewInput, coinOfSeed } from "./preview.ts";
import { homePage, coinsPage, coinPage, mastersPage, traitsPage, yieldPage, howPage, notFound, pad5, bpsPct } from "./site.ts";
import { coinJson, stateJson, specJson, holderJson } from "./api.ts";
import { cardPng, squarePng } from "./image.ts";
import { yoursPage, holderPage, assetsPage } from "./pages.ts";
import { goTarget } from "./wallet.ts";
import { resolveHolder, resolveFailed, ensNames } from "./ens.ts";
import { isAddress, type Address } from "viem";

const PORT = Number(process.env.PORT ?? 3000);
const BOOT_AT = Date.now();

const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const svg = (s: string, immutable: boolean) => new Response(s, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=60", "access-control-allow-origin": "*" } });
const png = (b: Uint8Array, immutable: boolean) => new Response(b as Uint8Array<ArrayBuffer>, { headers: { "content-type": "image/png", "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300", "access-control-allow-origin": "*" } });
const json = (o: unknown, maxAge = 15, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 && maxAge > 0 ? `public, max-age=${maxAge}` : "no-store", "access-control-allow-origin": "*" } });
const text = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

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

/** The coin id in a path, when it is one the preview has minted. */
function idOf(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= PREVIEW_SUPPLY ? n : null;
}

const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

async function route(url: URL): Promise<Response> {
  const path = url.pathname;
  if (path === "/health") return text(`ok, preview supply ${PREVIEW_SUPPLY}, up ${Math.floor((Date.now() - BOOT_AT) / 1000)} s`);
  if (path === "/ready") return json({ ok: true, preview: true, totalSupply: PREVIEW_SUPPLY }, 0);
  if (path === "/spec.json") return json(specJson(), 3600);
  if (path === "/") return html(homePage());
  if (path === "/coins") return html(coinsPage(Number(url.searchParams.get("page") ?? 1)));
  if (path === "/masters") return html(mastersPage());
  if (path === "/traits") return html(traitsPage());
  if (path === "/yield") return html(yieldPage());
  if (path === "/how") return html(howPage());
  if (path === "/api/state") return json(stateJson(), 15);
  if (path === "/assets") return html(assetsPage());
  if (path === "/yours") return html(yoursPage(url.searchParams.get("bad")));
  if (path === "/go") return redirect(goTarget(url.searchParams.get("who")));

  // The newest coin as the site's own image.
  if (path === "/newest.svg" || path === "/newest.png") {
    if (PREVIEW_SUPPLY < 1) return text("no coins yet", 404);
    const c = previewCoin(PREVIEW_SUPPLY);
    if (path === "/newest.svg") return svg(c.svg, false);
    return png(cardPng(`newest${PREVIEW_SUPPLY}`, "ONE", `newest coin #${pad5(PREVIEW_SUPPLY)}`, `${c.traits.material}, ${c.traits.field}, ${c.traits.glyph}`, c), false);
  }

  // A master with a sample seed, for the ones not found yet.
  const master = path.match(/^\/master\/(\d{1,2})\.svg$/);
  if (master) {
    const i = Number(master[1]);
    if (!MASTERS[i]) return text("no such master", 404);
    return svg(coinOfSeed(0x5eedn * BigInt(i + 1), 0, i).svg, true);
  }

  // Any seed, for previews and the yield demo: /preview/<16 hex>.svg?yield=<bps>
  const pre = path.match(/^\/preview\/([0-9a-fA-F]{1,16})\.svg$/);
  if (pre) {
    const y = Math.min(100000, Math.max(0, Number(url.searchParams.get("yield") ?? 0) || 0));
    return svg(coinOfSeed(BigInt("0x" + pre[1]), y).svg, true);
  }

  const m = path.match(/^\/(api\/)?coin\/(\d{1,5})(\.svg|\.png|-1024\.png)?$/);
  if (m) {
    const n = idOf(m[2]);
    if (n === null) return m[1] ? json({ error: "no such coin", totalSupply: PREVIEW_SUPPLY }, 0, 404) : html(notFound(`Coin ${m[2]} does not exist yet. ${PREVIEW_SUPPLY} coins are minted.`), 404);
    const c = previewCoin(n);
    const inp = previewInput(n);
    if (m[1]) return json(coinJson(n));
    if (m[3] === ".svg") {
      const y = url.searchParams.get("yield");
      if (y !== null) {
        const bps = Math.min(100000, Math.max(0, Number(y) || 0));
        return svg(coinOfSeed(inp.seed, bps, inp.master).svg, true);
      }
      return svg(c.svg, false);
    }
    if (m[3] === ".png") return png(cardPng(`coin${n}-${inp.yieldBps}`, `#${pad5(n)}`, c.masterName ? `Master Coin ${c.masterName}` : "coin", `${inp.backing} USDC, yield ${bpsPct(inp.yieldBps)}, ${c.traits.material}`, c), false);
    if (m[3] === "-1024.png") return png(squarePng(`coin${n}-${inp.yieldBps}`, c), false);
    return html(coinPage(n));
  }

  const holder = path.match(/^\/(api\/holder\/)?(0x[0-9a-fA-F]{40}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)$/i);
  if (holder) {
    const who = await resolveHolder(holder[2]);
    if (!who || !isAddress(who)) {
      const failed = resolveFailed(holder[2]);
      if (holder[1]) return json({ error: failed ? "ENS did not answer" : "no such name" }, 0, failed ? 503 : 404);
      return html(notFound(failed ? "ENS did not answer. Try the name again in a minute, or use the address." : `No wallet answers to ${holder[2]}.`), failed ? 503 : 404);
    }
    if (holder[1]) return json(holderJson(who), 15);
    const names = await ensNames([who]);
    return html(holderPage(who as Address, holder[2], names.get(who.toLowerCase()) ?? null));
  }
  if (path.startsWith("/api/")) return json({ error: "no such endpoint" }, 0, 404);
  return html(notFound(), 404);
}

if (import.meta.main) {
  Bun.serve({ port: PORT, fetch: handle });
  console.log(`one.onenft.click on :${PORT}, preview supply ${PREVIEW_SUPPLY}`);
}
