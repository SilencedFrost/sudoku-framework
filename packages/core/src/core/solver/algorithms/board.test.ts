import { describe, expect, it } from "vitest";
import { getUnit } from "../../../utils/board.js";
import { solveHiddenSets, solveNakedSets } from "./board.js";
import { bits, boardWith } from "./test-utils.js";

describe("solveNakedSets", () => {
  it("removes the set's candidates from non-member cells", () => {
    // Row 0 siblings: pair {1,2} in cells 0-1, cell 2 holds {1,2,3}.
    const board = boardWith({
      0: { value: null, candidates: bits(1, 2) },
      1: { value: null, candidates: bits(1, 2) },
      2: { value: null, candidates: bits(1, 2, 3) },
    });

    const next = solveNakedSets(board, { size: 2, first: true });

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 2)).toEqual({ value: null, candidates: bits(3) });
    expect(getUnit(next ?? [], 0)).toBe(getUnit(board, 0));
    expect(getUnit(next ?? [], 1)).toBe(getUnit(board, 1));
    expect(getUnit(board, 2).candidates).toBe(bits(1, 2, 3));
  });

  it("returns null when no naked set eliminates anything", () => {
    const board = boardWith({
      0: { value: null, candidates: bits(1, 2) },
      1: { value: null, candidates: bits(1, 2) },
    });

    expect(solveNakedSets(board, { size: 2, first: true })).toBeNull();
  });
});

describe("solveHiddenSets", () => {
  it("removes non-set candidates from the hidden set's member cells", () => {
    // Row 0: digits 1 and 2 only appear in cells 0-1, so they form a hidden
    // pair and those cells cannot hold 3 or 4.
    const board = boardWith({
      0: { value: null, candidates: bits(1, 2, 3) },
      1: { value: null, candidates: bits(1, 2, 4) },
      2: { value: null, candidates: bits(3, 4, 5) },
      3: { value: null, candidates: bits(3, 4, 5) },
    });

    const next = solveHiddenSets(board, { size: 2, first: true });

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 0)).toEqual({ value: null, candidates: bits(1, 2) });
    expect(getUnit(next ?? [], 1)).toEqual({ value: null, candidates: bits(1, 2) });
    expect(getUnit(next ?? [], 2)).toBe(getUnit(board, 2));
    expect(getUnit(board, 0).candidates).toBe(bits(1, 2, 3));
  });

  it("returns null when no hidden set eliminates anything", () => {
    const board = boardWith({
      0: { value: null, candidates: bits(1, 2) },
      1: { value: null, candidates: bits(1, 2) },
    });

    expect(solveHiddenSets(board, { size: 2, first: true })).toBeNull();
  });

  it("supports forced hidden triples", () => {
    // Row 0: 1 -> {0,1}, 2 -> {1,2}, 3 -> {0,2}, so cells 0-2 can drop 4-6.
    const board = boardWith({
      0: { value: null, candidates: bits(1, 3, 4) },
      1: { value: null, candidates: bits(1, 2, 5) },
      2: { value: null, candidates: bits(2, 3, 6) },
      3: { value: null, candidates: bits(4, 5, 6) },
      4: { value: null, candidates: bits(4, 5) },
      5: { value: null, candidates: bits(4, 6) },
    });

    const next = solveHiddenSets(board, { size: 3, first: true });

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 0).candidates).toBe(bits(1, 3));
    expect(getUnit(next ?? [], 1).candidates).toBe(bits(1, 2));
    expect(getUnit(next ?? [], 2).candidates).toBe(bits(2, 3));
  });
});
