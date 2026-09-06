/** The website can resolve a series without changing immutable token metadata. */
export function seriesCoinId(series: string, number: string, size: number): number | null {
  if (!/^[1-9]\d*$/.test(series) || !/^[1-9]\d*$/.test(number)) return null;
  const s = Number(series), n = Number(number);
  if (!Number.isSafeInteger(s) || !Number.isSafeInteger(n) || !Number.isSafeInteger(size) || size < 1 || n > size) return null;
  const id = (s - 1) * size + n;
  return Number.isSafeInteger(id) && id <= 9999999 ? id : null;
}
