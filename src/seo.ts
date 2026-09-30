/** Crawler metadata and bounded sitemaps. Keep these copies in step across the six sites. */
const CHUNK = 1000;
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const response = (body: string) => new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
const header = '<?xml version="1.0" encoding="UTF-8"?>';
export function sitemapResponse(url: URL, site: string, pages: string[], tokens: string[] = []): Response | null {
  if (!/^\/sitemap(?:\.xml|\/static\.xml|\/tokens-\d+\.xml)$/.test(url.pathname)) return null;
  const origin = "https://" + site;
  const urls = (paths: string[]) => response(header + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map(path => "<url><loc>" + xml(origin + path) + "</loc></url>").join("") + "</urlset>");
  if (url.pathname === "/sitemap/static.xml") return urls(pages);
  const part = url.pathname.match(/^\/sitemap\/tokens-(\d+)\.xml$/);
  if (part) {
    const n = Number(part[1]);
    if (!Number.isSafeInteger(n) || n < 1 || (n - 1) * CHUNK >= tokens.length) return new Response("No such sitemap.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return urls(tokens.slice((n - 1) * CHUNK, n * CHUNK));
  }
  if (pages.length + tokens.length <= CHUNK) return urls([...pages, ...tokens]);
  const paths = ["/sitemap/static.xml", ...Array.from({ length: Math.ceil(tokens.length / CHUNK) }, (_, i) => "/sitemap/tokens-" + (i + 1) + ".xml")];
  return response(header + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map(path => "<sitemap><loc>" + xml(origin + path) + "</loc></sitemap>").join("") + "</sitemapindex>");
}
export function robotsTxt(site: string): string {
  return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /go\nDisallow: /health\nDisallow: /ready\nDisallow: /yours\nDisallow: /wallet/\nDisallow: /wallet$\nDisallow: /embed\nSitemap: https://" + site + "/sitemap.xml\n";
}
export function pageDescription(site: string, path: string, fallback: string): string {
  const descriptions: Record<string, string> = {
    "/how": "How " + site + " works: the drawing rules, collection mechanics, ownership and risks.",
    "/assets": "Download and reuse artwork from " + site + ". Find image formats, CC0 licensing, public data endpoints and source code.",
    "/terms": "Terms of use for " + site + ": ownership, artwork rights, network fees and risks.",
    "/privacy": "Privacy at " + site + ": wallet addresses, browser storage, analytics and third-party services.",
    "/explore": "Browse the " + site + " calendar: past drawings, claimed days, gaps and previews of upcoming days.",
    "/traits": "Explore the traits and odds behind " + site + ". See how the on-chain drawing rules create each artwork.",
    "/rarity": "Every face item, tier and its odds at " + site + ". See which parts can be pinned and which come from luck.",
    "/ones": "Browse the one of one faces at " + site + ", each drawing available once, and check which remain in the pool.",
    "/masters": "Browse the Master Coin designs at " + site + " and check which have been drawn from the series.",
    "/yield": "See how a ONE coin's yield ring grows with lifetime yield. Compare the artwork at different yield levels.",
    "/coins": "Browse ONE coins, newest first. See revealed artwork, Master Coins and coins still waiting for their seed.",
  };
  const [route, query] = path.split("?");
  const description = descriptions[route] ?? fallback;
  const page = new URLSearchParams(query).get("page");
  return route === "/coins" && page ? description + " Page " + page + "." : description;
}

