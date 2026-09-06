import { expect, test } from "bun:test";
import { seriesCoinId } from "./series.ts";
test("series links resolve global ids across boundaries and reject ambiguous input", () => {
  expect(seriesCoinId("1", "1", 25000)).toBe(1);
  expect(seriesCoinId("1", "25000", 25000)).toBe(25000);
  expect(seriesCoinId("2", "1", 25000)).toBe(25001);
  expect(seriesCoinId("3", "1", 25000)).toBe(50001);
  for (const s of ["0", "-1", "1e2", "1.5", "Infinity", "999999999999999999"]) expect(seriesCoinId(s, "1", 25000)).toBeNull();
  expect(seriesCoinId("2", "25001", 25000)).toBeNull();
});
