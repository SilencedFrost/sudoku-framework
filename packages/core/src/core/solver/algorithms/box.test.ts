import { describe, expect, it } from "vitest";
import { BOXES, ROW_OUTSIDE_BOX_OF } from "../../../constants/coordinates.js";
import { getUnit } from "../../../utils/board.js";
import { findPointingPairsInBox } from "./box.js";
import { bits, boardWith, unsolved } from "./test-utils.js";

const box = getUnit(BOXES, 0);
const outsideRow = getUnit(ROW_OUTSIDE_BOX_OF, 0);

describe("findPointingPairsInBox", () => {
  it("removes the digit from the rest of the row when confined to a box row", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      1: unsolved(bits(1, 3)),
      3: unsolved(bits(1, 4)),
    });

    expect(findPointingPairsInBox(board, box)).toEqual([{ mask: bits(1), remove: outsideRow }]);
  });

  it("covers pointing triples", () => {
    const board = boardWith({
      0: unsolved(bits(4, 2)),
      1: unsolved(bits(4, 3)),
      2: unsolved(bits(4, 5)),
      3: unsolved(bits(4, 6)),
    });

    expect(findPointingPairsInBox(board, box)).toEqual([{ mask: bits(4), remove: outsideRow }]);
  });

  it("returns null when the digit is not confined to one row or column", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      10: unsolved(bits(1, 3)),
      3: unsolved(bits(1, 4)),
    });

    expect(findPointingPairsInBox(board, box)).toBeNull();
  });

  it("returns null when the line outside the box has no such candidate", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      1: unsolved(bits(1, 3)),
    });

    expect(findPointingPairsInBox(board, box)).toBeNull();
  });
});
