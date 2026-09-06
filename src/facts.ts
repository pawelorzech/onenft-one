/**
 * What the chain says about one wallet's coins, as tiles: a figure and a line
 * under it. Every fact is a count or a sum read from the contract; none of
 * them is worth anything and there is nothing to unlock. A wallet with no
 * coins has no facts.
 */
import { coinsOf, type ChainState } from "./contract.ts";
import { usdc, usdcNum, plural } from "./site.ts";

export type Fact = {
  kind: string;
  /** The big figure of the tile. */
  figure: string;
  /** The line under the figure. */
  label: string;
  /** The same fact as one plain sentence, for JSON and screen readers. */
  text: string;
};

export function holderFacts(who: string, chain: ChainState): Fact[] {
  const mine = coinsOf(chain, who);
  if (!mine.length) return [];
  const backing = mine.reduce((a, c) => a + c.principal, 0n);
  const lifetime = mine.reduce((a, c) => a + c.lifetime, 0n);
  const masters = mine.filter((c) => c.master >= 0);
  const founders = mine.filter((c) => c.founder);
  const sealed = mine.filter((c) => c.sealed);
  const facts: Fact[] = [
    { kind: "coins", figure: String(mine.length), label: `${plural(mine.length, "coin", "coins")} held`, text: `Holds ${mine.length} ${plural(mine.length, "coin", "coins")}.` },
    { kind: "backing", figure: usdcNum(backing), label: "USDC of backing under them", text: `Their backing is ${usdc(backing)}.` },
    { kind: "lifetime", figure: usdcNum(lifetime), label: "USDC of yield they have earned", text: `They have earned ${usdc(lifetime)} of yield.` },
  ];
  if (masters.length) facts.push({ kind: "masters", figure: String(masters.length), label: `Master ${plural(masters.length, "Coin", "Coins")}, ${masters.map((c) => `#${c.id}`).join(", ")}`, text: `${masters.length} Master ${plural(masters.length, "Coin", "Coins")}: ${masters.map((c) => `#${c.id}`).join(", ")}.` });
  if (founders.length) facts.push({ kind: "founder", figure: String(founders.length), label: `founder ${plural(founders.length, "coin", "coins")}`, text: `${founders.length} founder ${plural(founders.length, "coin", "coins")}.` });
  if (sealed.length) facts.push({ kind: "sealed", figure: String(sealed.length), label: "sealed, waiting for a seed", text: `${sealed.length} still sealed, waiting for a seed.` });
  return facts;
}
