/**
 * The pages against a chain state built by hand, so no test touches an RPC.
 * What must hold: a coin renders from the numbers the contract gives, the
 * counts never read as zero when the chain said nothing, the mint box only
 * appears with a contract, a holder only sees claim and redeem on coins that
 * are theirs, and a hostile ENS name cannot break out of an attribute.
 */
import { test, expect } from "bun:test";
import { homePage, coinsPage, coinPage, mastersPage, traitsPage, yieldPage, howPage, notFound, chainDown, cssVars, contrast, coinRow, usdc, bpsPct, dateOf, redeemable, eth, ethOf, IMG_Q } from "./site.ts";
import { yoursPage, holderPage, assetsPage } from "./pages.ts";
import { stateJson, holderJson, specJson, coinJson } from "./api.ts";
import { holderFacts } from "./facts.ts";
import { coinOf, inputOf, metaOf } from "./token.ts";
import { MATERIALS } from "./coin.ts";
import { DEFAULT_SERIES_SIZE as SERIES_SIZE, REVERTS, RISK, factsOf, backingList, type ChainState, type ChainStatus, type CoinRecord } from "./contract.ts";
import type { Address } from "viem";

/** A mint far enough in the past that the lock has run out, so redeem is open in the tests that want it. */
const MINT_TIME = Math.floor(Date.parse("2026-06-01T00:00:00Z") / 1000);
const AUTHOR = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;

function coin(id: number, over: Partial<CoinRecord> = {}): CoinRecord {
  const base: CoinRecord = {
    id,
    seed: BigInt(id) * 0x9e3779b97f4a7c15n,
    slot: 100 + id,
    backingClass: 1,
    backing: 25,
    founder: false,
    sealed: false,
    renderer: "0x4444444444444444444444444444444444444444" as Address,
    series: 1,
    number: id,
    shares: 25_000_000n,
    principal: 25_000_000n,
    claimed: 0n,
    requestId: 0n,
    mintedAt: MINT_TIME,
    redeemableAt: MINT_TIME + 30 * 86400,
    sealedEscapeAt: MINT_TIME + 180 * 86400,
    nav: 25_000_000n,
    profit: 0n,
    lifetime: 0n,
    yieldBps: 0,
    master: -1,
    owner: B,
  };
  return { ...base, ...over };
}

export function fakeChain(extra: Partial<ChainState> = {}): ChainState {
  const coins = new Map<number, CoinRecord>([
    [1, coin(1, { slot: 0, master: 0, owner: AUTHOR, founder: true, backing: 50, backingClass: 2, principal: 30_000_000n, nav: 31_000_000n, profit: 1_000_000n, lifetime: 1_000_000n, yieldBps: 333 })],
    [2, coin(2, { nav: 27_500_000n, profit: 2_500_000n, lifetime: 3_000_000n, claimed: 500_000n, yieldBps: 1200 })],
    [3, coin(3, { sealed: true, slot: null, seed: 0n, master: -1, requestId: 77n })],
  ]);
  return {
    address: "0x3333333333333333333333333333333333333333" as Address,
    chainId: 84532,
    author: AUTHOR,
    renderer: "0x4444444444444444444444444444444444444444" as Address,
    rendererLocked: false,
    usdc: "0x5555555555555555555555555555555555555555" as Address,
    vault: "0x6666666666666666666666666666666666666666" as Address,
    minted: 3,
    nextId: 4,
    series: 1,
    seriesMinted: 3,
    pending: 1,
    urnLeft: SERIES_SIZE - 2,
    mastersLeft: 49,
    founderMinted: 1,
    foundersFunded: false,
    treasuryAssets: 400_000n,
    maxBatch: 10,
    redeemLock: 30 * 86400,
    vrfFeeWei: 300_000_000_000_000n,
    founderWindow: 1000,
    feePct: 10,
    feeBps: 1000,
    sealedEscape: 180 * 86400,
    position: 4,
    founder: { minted: 1, left: 99, closesAt: 1000, open: true },
    seriesSize: SERIES_SIZE,
    masters: 50,
    foundersPerSeries: 100,
    backings: [5, 10, 25, 50],
    coins,
    readAt: Date.now(),
    ...extra,
  };
}

const OFF: ChainStatus = { configured: false, known: false, stale: false, readAt: null, ageSeconds: null, error: null, errorAt: null };
const DOWN: ChainStatus = { configured: true, known: false, stale: false, readAt: null, ageSeconds: null, error: "no answer", errorAt: 1 };
const STALE: ChainStatus = { configured: true, known: true, stale: true, readAt: Date.parse("2026-09-06T12:04:00Z"), ageSeconds: 600, error: "no answer", errorAt: 1 };
const OK: ChainStatus = { configured: true, known: true, stale: false, readAt: Date.now(), ageSeconds: 1, error: null, errorAt: null };

test("no contract: the empty state, no mint box, and zero counts because zero is the truth", () => {
  const h = homePage(null, OFF);
  expect(h).toContain("Minting opens with the contract");
  expect(h).toContain("No contract is configured on this server");
  expect(h).toContain('<span class="fig syne">0 of 50</span>');
  expect(h).not.toContain('<span class="fig syne">?</span>');
  expect(h).not.toContain('id="mint-btn"');
  expect(h).not.toContain("undefined");
  expect(h).not.toContain("NaN");
});

test("a chain that never answered says so and shows no zero supply", () => {
  const h = homePage(null, DOWN);
  expect(h).toContain("The chain did not answer");
  expect(h).toContain('<span class="fig syne">?</span>');
  expect(h).not.toContain('<span class="fig syne">0 of 50</span>');
  expect(h).not.toContain('id="mint-btn"');
  expect(h).not.toContain("No contract is configured");
});

test("home with a contract: the newest coin, the mint box, the counts from the chain, rows newest first", () => {
  const c = fakeChain();
  const h = homePage(c, OK);
  expect(h).toContain('id="mint-btn"');
  expect(h).toContain("#00003");
  expect(h.indexOf("#00003")).toBeLessThan(h.indexOf("#00002"));
  expect(h).toContain("sealed, waiting for the seed from Chainlink VRF");
  expect(h).toContain(">3</b><span class=\"small\">minted in series I");
  expect(h).toContain(">49</b><span class=\"small\">Master Coins still in the urn");
  expect(h).toContain(">1</b><span class=\"small\">sealed, waiting for a seed");
  expect(h).toContain("5 USDC</button>");
  expect(h).toContain("50 USDC</button>");
  expect(h).toContain("Up to 10 in one transaction.");
  expect(h).toContain("Base Sepolia testnet");
  expect(h).not.toContain("undefined");
  expect(h).not.toContain("NaN");
  expect(h).not.toContain("—");
  expect(homePage(c, STALE)).toContain("Showing what the chain said at 12:04 UTC");
});

test("the mint script approves the exact total, keeps the transaction per chain, contract and wallet, and polls the sealed coins", () => {
  const h = homePage(fakeChain(), OK);
  for (const s of ["onenft_mint:", "eth_requestAccounts", "wallet_switchEthereumChain", "CFG.sel.approve", "CFG.sel.mint", "/api/coin/", "j.sealed===false", "eth_getTransactionReceipt", "balanceOf", "allowance", "accountsChanged", "founder-box", "mintFounder"]) expect(h).toContain(s);
  expect(h).toContain('id="founder-box" hidden');
});

test("the Chainlink fee is shown and rides along as value on both mints", () => {
  const c = fakeChain();
  const h = homePage(c, OK);
  expect(h).toContain("Plus 0.0003 ETH for the randomness");
  expect(h).toContain("one fee per transaction whatever the count");
  expect(h).toContain('"vrfFeeWei":"300000000000000"');
  expect(h).toContain('"vrfFeeEth":"0.0003"');
  // Both sends go through withFee, so neither can forget the value.
  expect((h.match(/params:\[withFee\(/g) ?? []).length).toBe(2);
  expect(h).toContain("tx.value='0x'+v.toString(16)");
  expect(eth(c.vrfFeeWei)).toBe("0.0003 ETH");
  expect(ethOf(0n)).toBe("0");
  expect(howPage(c, OK)).toContain("sends 0.0003 ETH with it");
  // A contract that charges nothing shows no fee line and sends no value.
  const free = homePage(fakeChain({ vrfFeeWei: 0n }), OK);
  expect(free).not.toContain("for the randomness, paid to Chainlink");
  expect(stateJson(c, undefined, OK).vrfFeeWei).toBe("300000000000000");
});

test("home with a contract and nothing minted still offers the mint box", () => {
  const h = homePage(fakeChain({ coins: new Map(), minted: 0, nextId: 1, seriesMinted: 0, pending: 0, mastersLeft: 50 }), OK);
  expect(h).toContain('id="mint-btn"');
  expect(h).toContain("No coin minted yet");
  expect(h).toContain("A sealed coin");
});

test("a full series shuts the button and says why", () => {
  const h = homePage(fakeChain({ seriesMinted: SERIES_SIZE }), OK);
  expect(h).toContain("Series I is full");
  expect(h).not.toContain('id="mint-btn"');
});

test("coin page: the money comes from the contract, the owner gets claim and redeem, and redeem states the amount", () => {
  const c = fakeChain();
  const h = coinPage(c, c.coins.get(2)!, new Map([[B.toLowerCase(), "pawelorzech.eth"]]), OK);
  expect(h).toContain("held by <a href=\"/" + B + "\">pawelorzech.eth</a>");
  expect(h).toContain(usdc(25_000_000n));
  expect(h).toContain(bpsPct(1200));
  expect(h).toContain('data-act="claim"');
  expect(h).toContain('data-act="redeem"');
  expect(h).toContain(`data-owner="${B.toLowerCase()}"`);
  expect(h).toContain("destroys the coin");
  expect(h).toContain("27.25 USDC");
  expect(h).toContain('data-dl="png"');
  // Nothing to claim disables the button rather than hiding the truth.
  const none = coinPage(c, c.coins.get(3)!, new Map(), OK);
  expect(none).toContain("Nothing to claim yet");
  expect(none).toContain("This coin is sealed");
  expect(none).toContain("/api/coin/3");
  expect(none).toContain("location.reload()");
});

test("the thirty day lock: burning is shut with a date until it runs out, and shut for good while the coin is sealed", () => {
  const soon = Math.floor(Date.now() / 1000) + 20 * 86400;
  const c = fakeChain({ coins: new Map([[2, { ...fakeChain().coins.get(2)!, mintedAt: soon - 30 * 86400, redeemableAt: soon }]]) });
  const h = coinPage(c, c.coins.get(2)!, new Map(), OK);
  expect(h).toContain("Burning opens on");
  expect(h).toContain(dateOf(soon));
  expect(h).toMatch(/data-act="redeem"[^>]*disabled/);
  // A coin past its lock offers the burn with the amount.
  const open = fakeChain();
  expect(coinPage(open, open.coins.get(2)!, new Map(), OK)).toContain("Burn and redeem");
  // A sealed coin waits for its seed, or for the escape date when no seed ever comes.
  const sealed = coinPage(open, open.coins.get(3)!, new Map(), OK);
  expect(sealed).toContain("if the seed never arrives");
  expect(sealed).toMatch(/data-act="redeem"[^>]*disabled/);
  expect(redeemable(open.coins.get(3)!)).toBe(false);
  expect(howPage(open, OK)).toContain("30 days after its mint");
});

test("the founder window: open at the start of a series, shut for good after it, and forfeited", () => {
  const open = homePage(fakeChain(), OK);
  expect(open).toContain("1 of 100 minted");
  expect(open).toContain("99 left, and the window is open until coin 1,000 of series I");
  expect(open).toContain("inside its first 1,000 coins, or not at all");
  expect(open).toContain("Mint founder coins");
  expect(open).not.toMatch(/id="founder-btn"[^>]*disabled/);
  expect(open).toContain('max="10"');
  // Past the window: the button shuts and the page says what was lost.
  const shut = fakeChain({ position: 4000, seriesMinted: 3999, founder: { minted: 3, left: 97, closesAt: 1000, open: false } });
  const h = homePage(shut, OK);
  expect(h).toContain("Closed since coin 1,000 of series I");
  expect(h).toContain("so the 97 not minted are forfeited");
  expect(h).toContain("The window closed at coin 1,000");
  expect(h).toMatch(/id="founder-btn"[^>]*disabled data-shut/);
  // All hundred out.
  expect(homePage(fakeChain({ founder: { minted: 100, left: 0, closesAt: 1000, open: false } }), OK)).toContain("Series I has all 100.");
  // The count is capped by what is left, not just by the batch.
  expect(homePage(fakeChain({ founder: { minted: 97, left: 3, closesAt: 1000, open: true } }), OK)).toContain('max="3"');
});

test("the risk is stated on the page, under the mint button, in the sidebar, the footer and the JSON", () => {
  const c = fakeChain();
  const how = howPage(c, OK);
  expect(how).toContain('id="risk"');
  expect(how).toContain(RISK);
  expect(how).toContain("What can go wrong");
  const home = homePage(c, OK);
  expect(home).toContain('href="/how#risk">Read what can go wrong</a> before you mint.');
  // Under the mint button, in the sidebar lead and in the footer of every page.
  expect((home.match(/how#risk/g) ?? []).length).toBeGreaterThanOrEqual(3);
  expect(home).toContain("This can lose you money.");
  for (const h of [coinsPage(c, 1, OK), mastersPage(c, new Map(), OK), yieldPage(c), assetsPage(c, OK)]) {
    expect(h).toContain("This can lose you money: read");
  }
  expect(stateJson(c, undefined, OK).risk).toBe(RISK);
  expect(specJson(c).risk).toBe(RISK);
  expect(RISK).toContain("Put in only what you can lose.");
  expect(RISK).toContain("third-party lending vault on Base");
});

test("the series shape comes from the chain, never from a constant in the page", () => {
  const c = fakeChain();
  const h = homePage(c, OK);
  expect(h).toContain("25,000 coins a series. 50 one of ones.");
  expect(h).toContain("5, 10, 25 or 50 USDC held in a vault");
  expect(h).toContain("a 5 USDC coin can be a Master Coin");
  for (const b of [5, 10, 25, 50]) expect(h).toContain(`${b} USDC</button>`);
  // A contract with a different shape moves the copy with it, and nothing is hardcoded.
  const other = fakeChain({ seriesSize: 1000, masters: 7, foundersPerSeries: 3, backings: [1, 2] });
  const o = homePage(other, OK);
  expect(o).toContain("1,000 coins a series. 7 one of ones.");
  expect(o).toContain("1 or 2 USDC held in a vault");
  expect(o).toContain("of 3 minted");
  // The fee, the lock and the escape follow the same rule.
  const cheap = fakeChain({ feePct: 2.5, feeBps: 250, redeemLock: 7 * 86400, sealedEscape: 90 * 86400 });
  expect(howPage(cheap, OK)).toContain("minus 2.5% of that yield");
  expect(howPage(cheap, OK)).toContain("burned 7 days after its mint");
  expect(howPage(cheap, OK)).toContain("after 90 days");
  expect(homePage(cheap, OK)).toContain('<span class="fig syne">2.5%</span>');
  expect(mastersPage(other, new Map(), OK)).toContain("7 Master Coins a series");
  expect(howPage(other, OK)).toContain("A series is 1,000 coins.");
  expect(stateJson(other, undefined, OK).seriesSize).toBe(1000);
  expect(stateJson(other, undefined, OK).mastersPerSeries).toBe(7);
  expect(specJson(other).backings).toEqual([1, 2]);
  expect(backingList([5, 10, 25, 50])).toBe("5, 10, 25 or 50");
  expect(factsOf(null).seriesSize).toBe(SERIES_SIZE);
});

test("the sealed escape: a coin the seed never reached can be burned for its backing", () => {
  const c = fakeChain();
  const stuck = c.coins.get(3)!;
  // Still inside the 180 days: the page names the date and the button stays shut.
  const waiting = coinPage(c, stuck, new Map(), OK);
  expect(waiting).toContain(`this coin can be burned for its backing from ${dateOf(stuck.sealedEscapeAt)}`);
  expect(waiting).toContain(`Burning opens on ${dateOf(stuck.sealedEscapeAt)} if the seed never arrives`);
  expect(waiting).toMatch(/data-act="redeem"[^>]*disabled/);
  expect(redeemable(stuck)).toBe(false);
  // Past it, the door opens even though the coin never got its art.
  const gone = Math.floor(Date.now() / 1000) - 86400;
  const escaped = { ...stuck, mintedAt: gone - 180 * 86400, redeemableAt: gone - 150 * 86400, sealedEscapeAt: gone };
  expect(redeemable(escaped)).toBe(true);
  const page = coinPage(fakeChain({ coins: new Map([[3, escaped]]) }), escaped, new Map(), OK);
  expect(page).toContain("Burn and redeem");
  expect(page).not.toMatch(/data-act="redeem"[^>]*disabled/);
  expect(page).toContain("It never got its seed, so it has no art and never will.");
  // A revealed coin is not let out early by the escape date.
  expect(redeemable({ ...c.coins.get(2)!, redeemableAt: Math.floor(Date.now() / 1000) + 86400 })).toBe(false);
});

test("a revert the contract can throw reaches the reader as a sentence, not four bytes of hex", () => {
  const h = homePage(fakeChain(), OK);
  const coin = coinPage(fakeChain(), fakeChain().coins.get(2)!, new Map(), OK);
  // Each selector travels with the page, next to what it means.
  for (const [selector, said] of REVERTS) {
    expect(h).toContain(selector);
    expect(h).toContain(said);
  }
  expect(h).toContain("The founder window of this series has closed");
  expect(h).toContain("no founder coin left to mint");
  expect(h).toContain("The vault is not taking deposits right now");
  expect(coin).toContain("The vault cannot release that much right now");
  expect(coin).toContain("A sealed coin cannot be burned");
  // Every selector is four bytes and they are all different.
  expect(REVERTS.every(([s]) => /^0x[0-9a-f]{8}$/.test(s))).toBe(true);
  expect(new Set(REVERTS.map(([s]) => s)).size).toBe(REVERTS.length);
});

test("the author's coin says the author holds it, and a founder coin shows what is funded", () => {
  const c = fakeChain();
  const h = coinPage(c, c.coins.get(1)!, new Map(), OK);
  expect(h).toContain("held by the author");
  expect(h).toContain("funded of the 50 USDC class");
  expect(h).toContain("founder</span>");
  expect(coinRow(c.coins.get(1)!, c)).toContain("held by the author");
});

test("holder page: one block per coin with traits, money, a download bar and the two actions", () => {
  const h = holderPage(fakeChain(), B, B, new Map(), OK);
  expect((h.match(/data-dl="png"/g) ?? []).length).toBe(2);
  expect(h).toContain('download="one-coin-2.svg"');
  expect((h.match(/data-act="redeem"/g) ?? []).length).toBe(2);
  expect(h).toContain("2 coins");
  expect(h).toContain("backing under them");
  expect(h).toContain(`https://onenft.click/wallet/${B}`);
  expect(h).toContain('class="sizes"');
  const empty = holderPage(fakeChain(), AUTHOR, AUTHOR, new Map(), OK);
  expect(empty).toContain("the author's wallet");
});

test("a hostile ENS name cannot break the title, a heading or an attribute", () => {
  const c = fakeChain();
  const names = new Map([[B.toLowerCase(), '</title><script>alert(1)</script>"']]);
  for (const h of [homePage(c, OK, names), coinPage(c, c.coins.get(2)!, names, OK), holderPage(c, B, B, names, OK), mastersPage(c, names, OK)]) {
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).not.toContain("</title><script>");
  }
});

test("state json: null counts when the chain never answered, the hub's fields when it did", () => {
  const down = stateJson(null, undefined, DOWN);
  expect(down.totalSupply).toBeNull();
  expect(down.pending).toBeNull();
  expect(down.poolLeft).toBeNull();
  expect(down.chain.known).toBe(false);
  const s = stateJson(fakeChain(), new Map([[B.toLowerCase(), "pawelorzech.eth"]]), OK);
  expect(s.kind).toBe("coins");
  expect(s.totalSupply).toBe(3);
  expect(s.maxSupply).toBe(SERIES_SIZE);
  expect(s.pending).toBe(1);
  expect(s.poolLeft).toBe(49);
  expect(s.series).toBe(1);
  expect(s.urnLeft).toBe(SERIES_SIZE - 2);
  expect(s.founderMinted).toBe(1);
  expect(s.founderWindow).toEqual({ minted: 1, left: 99, closesAt: 1000, open: true });
  expect(s.foundersPerSeries).toBe(100);
  expect(s.backings).toEqual([5, 10, 25, 50]);
  expect(s.position).toBe(4);
  expect(s.sealedEscapeSeconds).toBe(180 * 86400);
  expect(s.recent[0].sealedEscapeAt).toBe(s.recent[0].mintedAt + 180 * 86400);
  expect(s.treasuryAssetsUnits).toBe("400000");
  expect(s.recent.length).toBe(3);
  expect(s.recent[0].id).toBe(3);
  expect(s.recent[0].sealed).toBe(true);
  expect(s.recent[0].seed).toBeNull();
  expect(s.recent[1].ownerName).toBe("pawelorzech.eth");
  expect(s.recent[2].treasury).toBe(true);
  expect(s.recent[0].image).toBe("https://one.onenft.click/coin/3.svg");
  expect(s.recent[0].url).toBe("https://one.onenft.click/coin/3");
});

test("holder json: the coins the hub reads, with the sums", () => {
  const c = fakeChain();
  const j = holderJson(B, c, new Map(), OK);
  expect(j.count).toBe(2);
  expect(j.coins.map((x) => x.id)).toEqual([3, 2]);
  expect(j.coins[0].url).toBe("https://one.onenft.click/coin/3");
  expect(j.facts[0].figure).toBe("2");
  expect(j.facts.find((f) => f.kind === "backing")!.figure).toBe("50.00");
  expect(holderJson(AUTHOR, c, new Map(), OK).treasury).toBe(true);
  expect(holderFacts("0x9999999999999999999999999999999999999999", c)).toEqual([]);
});

test("coin json carries the metadata the contract builds, funded and lifetime included", () => {
  const c = fakeChain();
  const j = coinJson(c.coins.get(1)!, c, new Map(), OK);
  expect(j.name).toContain("#00001");
  expect(j.description).toContain("funded 30.000000 USDC");
  expect(j.description).toContain("lifetime yield 1.000000 USDC");
  expect(j.fundedUnits).toBe("30000000");
  expect(j.master).toBe(coinOf(c.coins.get(1)!).masterName);
  const sealed = coinJson(c.coins.get(3)!, c, new Map(), OK);
  expect(sealed.description).toContain("Sealed");
  expect(sealed.rarity).toBeNull();
  expect(inputOf(c.coins.get(3)!).sealed).toBe(true);
  // The traits in the API are the traits in the token, one list, no second implementation.
  for (const id of [1, 2, 3]) {
    const rec = c.coins.get(id)!;
    expect(coinJson(rec, c, new Map(), OK).attributes).toEqual(JSON.parse(metaOf(rec).json).attributes);
  }
});

test("every page carries the breadcrumb and the same menu labels", () => {
  const c = fakeChain();
  for (const h of [homePage(c, OK), coinsPage(c, 1, OK), coinPage(c, c.coins.get(2)!, new Map(), OK), mastersPage(c, new Map(), OK), traitsPage(c), yieldPage(c), howPage(c, OK), assetsPage(c, OK), yoursPage(c, OK), holderPage(c, B, B, new Map(), OK), notFound(c), chainDown(c)]) {
    expect(h).toContain("<!doctype html>");
    expect(h).toContain('<nav class="crumb" aria-label="Breadcrumb"><ol>');
    expect(h).toContain('href="https://onenft.click">All collections</a>');
    expect(h).toContain('href="/yours">Your wallet</a>');
    expect(h).not.toContain("undefined");
    expect(h).not.toContain("NaN");
    expect(h).not.toContain("—");
  }
});

test("how and assets name the contract when there is one and say why when there is not", () => {
  const c = fakeChain();
  expect(howPage(c, OK)).toContain(c.address);
  expect(howPage(c, OK)).toContain(c.vault);
  expect(howPage(null, OFF)).toContain("No contract is configured");
  expect(assetsPage(c, OK)).toContain(c.renderer);
  expect(assetsPage(null, OFF)).toContain("no address here yet");
});

test("masters page links the ones drawn and marks the rest as still in the urn", () => {
  const h = mastersPage(fakeChain(), new Map(), OK);
  expect(h).toContain('href="/coin/1"');
  expect(h).toContain("still in the urn");
  expect(h).toContain("1 of 50 drawn in series I");
});

test("coins page paginates newest first and says so when nothing is minted", () => {
  const h = coinsPage(fakeChain(), 1, OK);
  expect(h).toContain("Coins 00003 to 00001");
  expect(h).toContain("Page 1 of 1");
  expect(coinsPage(fakeChain({ coins: new Map() }), 1, OK)).toContain("No coins yet");
});

test("the spec holds the tables the generator needs", () => {
  const s = specJson(fakeChain());
  expect(s.seriesSize).toBe(SERIES_SIZE);
  expect(s.foundersPerSeries).toBe(100);
  expect(s.masters.length).toBe(50);
  expect(s.backings).toEqual([5, 10, 25, 50]);
  expect(s.traits.find((t) => t.trait === "Material")!.values.length).toBe(MATERIALS.length);
});

test("every coin image URL names the contract it came from", () => {
  // The tag comes from CONTRACT_ADDRESS, which no test sets, so here it is empty and every URL
  // is bare. What must hold either way: the URL a page emits and the URL the JSON emits agree.
  const c = fakeChain();
  const pages = [homePage(c, OK), coinPage(c, c.coins.get(2)!, new Map(), OK), holderPage(c, B, B, new Map(), OK), coinsPage(c, 1, OK), mastersPage(c, new Map(), OK)];
  const seen: string[] = [];
  for (const h of pages) for (const m of h.matchAll(/\/(?:coin\/\d+(?:\.svg|\.png|-1024\.png)|newest\.(?:svg|png))(\?c=[0-9a-f]{8})?/g)) seen.push(m[1] ?? "");
  expect(seen.length).toBeGreaterThan(15);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe(IMG_Q);
  const j = coinJson(c.coins.get(2)!, c, new Map(), OK);
  for (const u of [j.image, j.png, j.card]) expect(u.endsWith(IMG_Q) || IMG_Q === "").toBe(true);
  expect(j.image).toBe(`https://one.onenft.click/coin/2.svg${IMG_Q}`);
  expect(stateJson(c, undefined, OK).recent[0].image).toBe(`https://one.onenft.click/coin/3.svg${IMG_Q}`);
  expect(holderJson(B, c, new Map(), OK).coins[0].image).toBe(`https://one.onenft.click/coin/3.svg${IMG_Q}`);
  // The tag is the first eight hex of the contract, and the mint script carries the same one.
  expect(homePage(c, OK)).toContain(`"imgq":${JSON.stringify(IMG_Q)}`);
});

test("every inline script parses, so a broken mint button cannot ship", () => {
  const c = fakeChain();
  const pages = [homePage(c, OK), coinPage(c, c.coins.get(2)!, new Map(), OK), coinPage(c, c.coins.get(3)!, new Map(), OK), holderPage(c, B, B, new Map(), OK), yoursPage(c, OK), coinsPage(c, 1, OK)];
  let n = 0;
  for (const html of pages) {
    expect((html.match(/<script/g) ?? []).length).toBe((html.match(/<\/script>/g) ?? []).length);
    for (const m of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!m[1].trim()) continue;
      n++;
      // An opening tag inside a body means a quote escaped an attribute.
      expect(m[1]).not.toContain("<script");
      expect(() => new Function(m[1])).not.toThrow();
    }
  }
  expect(n).toBeGreaterThan(8);
});

test("muted text keeps 4.5:1 and control edges keep 3:1 on every material", () => {
  for (const m of MATERIALS) {
    for (const bg of ["#0d0d10", "#ece8df", m.dark]) {
      const v = cssVars({ bg, fg: m.light });
      const muted = v.match(/--muted:(#[0-9a-f]{6})/)![1], edge = v.match(/--edge:(#[0-9a-f]{6})/)![1], ink = v.match(/--fg:(#[0-9a-f]{6})/)![1];
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, bg)).toBeGreaterThanOrEqual(3);
    }
  }
});
