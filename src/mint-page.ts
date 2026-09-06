/** Family API v1: a stable, contract-scoped cursor over minted ids, not a recent window. */
export function mintPage<T>(contract: { address: string; chainId: number }, ids: number[], query: URLSearchParams, render: (id: number) => T) {
  const sorted = ids.filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b);
  const head = sorted.at(-1) ?? 0;
  const raw = query.get("after") ?? "0", size = query.get("limit") ?? "100";
  if ((raw !== "latest" && !/^\d{1,12}$/.test(raw)) || !/^\d{1,3}$/.test(size) || +size < 1 || +size > 100) return { error: "invalid cursor or limit" };
  const after = raw === "latest" ? head : Number(raw);
  const selected = sorted.filter((id) => id > after).slice(0, Number(size));
  const nextCursor = selected.at(-1) ?? after;
  return { version: 1, namespace: `${contract.chainId}:${contract.address.toLowerCase()}`, head, nextCursor, hasMore: sorted.some((id) => id > nextCursor), items: selected.map(render) };
}
