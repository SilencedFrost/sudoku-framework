import { describe, expect, it } from "vitest";
import { getUnit } from "../../../utils/board.js";
import { indexToMask } from "../../../utils/bitwise.js";
import { applySimpleModifications, getMinimalHallSets } from "./common.js";
import { bits, boardWith, unsolved } from "./test-utils.js";

describe("applySimpleModifications", () => {
  it("composes the peer eliminations of every placement in the batch", () => {
    // 0, 1 and 2 share a row, so 2 is a peer of both placements and must lose
    // both placed digits. Reading peer candidates from the stale input board
    // instead of the partially updated copy keeps 1 in cell 2.
    const board = boardWith({ 0: unsolved(bits(1, 2, 3)), 1: unsolved(bits(1, 2, 3)), 2: unsolved(bits(1, 2, 3)) });

    const next = applySimpleModifications(board, [
      { index: 0, value: 1 },
      { index: 1, value: 2 },
    ]);

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 0)).toEqual({ value: 1, candidates: indexToMask(1) });
    expect(getUnit(next ?? [], 1)).toEqual({ value: 2, candidates: indexToMask(2) });
    expect(getUnit(next ?? [], 2).candidates).toBe(indexToMask(3));
  });

  it("leaves the input board untouched", () => {
    const board = boardWith({ 0: unsolved(bits(1, 2)), 1: unsolved(bits(1, 2)) });
    const before = [...board];

    applySimpleModifications(board, [{ index: 0, value: 1 }]);

    board.forEach((cell, index) => {
      expect(cell).toBe(before[index]);
    });
  });

  it("returns null when there is nothing to apply", () => {
    expect(applySimpleModifications(boardWith({ 0: unsolved(bits(1, 2)) }), null)).toBeNull();
  });

  it("applies a cell reported by several units only once", () => {
    // A full house is the only empty cell of its row, column and box, so the
    // finder reports the same placement once per unit.
    const board = boardWith({ 0: unsolved(bits(1, 2, 3)), 1: unsolved(bits(1, 2, 3)) });
    const single = applySimpleModifications(board, [{ index: 0, value: 1 }]);

    const repeated = applySimpleModifications(board, [
      { index: 0, value: 1 },
      { index: 0, value: 1 },
      { index: 0, value: 1 },
    ]);

    expect(repeated).toEqual(single);
  });

  it("keeps the first placement when a cell is reported with conflicting digits", () => {
    // Applying the second placement would also remove 2 from cell 1, leaving it
    // with no candidates; the duplicate is skipped instead.
    const board = boardWith({ 0: unsolved(bits(1, 2)), 1: unsolved(bits(1, 2)) });

    const next = applySimpleModifications(board, [
      { index: 0, value: 1 },
      { index: 0, value: 2 },
    ]);

    expect(next).not.toBeNull();
    expect(getUnit(next ?? [], 0)).toEqual({ value: 1, candidates: indexToMask(1) });
    expect(getUnit(next ?? [], 1).candidates).toBe(indexToMask(2));
  });
});

describe("hallUnions", () => {
  it("reports a union for every set of duplicate masks", () => {
    // Single-value masks cannot form a set; each repeated pair is its own union.
    const masks = [bits(1), bits(2), bits(1, 2), bits(1, 2), bits(3, 4), bits(3, 4)];

    expect(getMinimalHallSets(masks)).toEqual([bits(1, 2), bits(3, 4)]);
  });

  it("does not treat three identical masks as a pair", () => {
    // Three items confined to two values do not fit in a size-2 union.
    const masks = [bits(1, 2), bits(1, 2), bits(1, 2)];

    expect(getMinimalHallSets(masks, { size: 2 })).toEqual([]);
  });

  it("reports a union spanning several pair masks", () => {
    const masks = [bits(1, 2), bits(2, 3), bits(1, 3)];

    expect(getMinimalHallSets(masks)).toEqual([bits(1, 2, 3)]);
  });

  it("rejects a union that contains more masks than its size", () => {
    // {1,2,3} contains four masks, so those masks are not confined to three values.
    const masks = [bits(1, 2), bits(2, 3), bits(1, 3), bits(1, 2, 3)];

    expect(getMinimalHallSets(masks)).toEqual([]);
  });

  it.each([
    { size: 2, expected: [] },
    { size: 3, expected: [bits(1, 2, 3)] },
    { size: 4, expected: [] },
  ])("searches only size $size", ({ size, expected }) => {
    const masks = [bits(1, 2), bits(2, 3), bits(1, 3)];

    expect(getMinimalHallSets(masks, { size })).toEqual(expected);
  });

  it("returns only the requested size when a smaller union is present", () => {
    const masks = [bits(1, 2), bits(1, 2), bits(2, 3), bits(3, 4), bits(2, 4)];

    // The duplicate pair lies outside the triple, so it is not reported.
    expect(getMinimalHallSets(masks, { size: 3 })).toEqual([bits(2, 3, 4)]);
  });

  it("rejects a triple that encloses a pair at an explicit size 3", () => {
    // The two {1,2} masks already form a pair, so the triple is not minimal.
    const masks = [bits(1, 2), bits(1, 2), bits(1, 3)];

    expect(getMinimalHallSets(masks, { size: 3 })).toEqual([]);
  });

  it("consumes pairs before a forced quad search", () => {
    const masks = [bits(5, 6), bits(5, 6), bits(1, 2), bits(1, 3), bits(2, 4), bits(3, 4)];

    expect(getMinimalHallSets(masks, { size: 4 })).toEqual([bits(1, 2, 3, 4)]);
  });

  it.each([
    {
      label: "accepts a quad without a nested triple",
      // 1 -> {0,1}, 2 -> {0,2}, 3 -> {1,3}, 4 -> {2,3}: no 3-value subset
      // contains three of the masks, so the quad is minimal.
      masks: [bits(1, 2), bits(1, 3), bits(2, 4), bits(3, 4)],
      expected: [bits(1, 2, 3, 4)],
    },
    {
      label: "rejects a quad that contains a triple",
      // {1,2}, {1,3}, {2,3} already form a triple, so adding 4 is not minimal.
      masks: [bits(1, 2), bits(1, 3), bits(2, 3), bits(1, 4)],
      expected: [],
    },
  ])("$label at an explicit size 4", ({ masks, expected }) => {
    expect(getMinimalHallSets(masks, { size: 4 })).toEqual(expected);
  });
});
