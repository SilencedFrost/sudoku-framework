import { describe, expect, it } from "vitest";
import { BOX_OUTSIDE_COLUMN_OF, BOX_OUTSIDE_ROW_OF, COLUMNS, ROWS } from "../../../constants/coordinates.js";
import { getUnit } from "../../../utils/board.js";
import { findClaimingsInLine } from "./line.js";
import { bits, boardWith, unsolved } from "./test-utils.js";

const row = getUnit(ROWS, 0);
const column = getUnit(COLUMNS, 0);

describe("findClaimingsInLine", () => {
  it("removes the digit from the rest of the box when confined to a box row", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      1: unsolved(bits(1, 3)),
      2: unsolved(bits(1, 4)),
      9: unsolved(bits(1, 5)),
    });

    expect(findClaimingsInLine(board, row)).toEqual([{ mask: bits(1), remove: getUnit(BOX_OUTSIDE_ROW_OF, 0) }]);
  });

  it("uses the column direction for a column line", () => {
    const board = boardWith({
      0: unsolved(bits(2, 3)),
      9: unsolved(bits(2, 4)),
      18: unsolved(bits(2, 5)),
      1: unsolved(bits(2, 6)),
    });

    expect(findClaimingsInLine(board, column)).toEqual([{ mask: bits(2), remove: getUnit(BOX_OUTSIDE_COLUMN_OF, 0) }]);
  });

  it("returns null when the digit is not confined to one box", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      3: unsolved(bits(1, 3)),
      9: unsolved(bits(1, 4)),
    });

    expect(findClaimingsInLine(board, row)).toBeNull();
  });

  it("returns null when the rest of the box has no such candidate", () => {
    const board = boardWith({
      0: unsolved(bits(1, 2)),
      1: unsolved(bits(1, 3)),
      2: unsolved(bits(1, 4)),
    });

    expect(findClaimingsInLine(board, row)).toBeNull();
  });
});
