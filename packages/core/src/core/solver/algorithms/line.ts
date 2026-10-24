import { LINE_MASKS } from "../../../constants/bitwise.js";
import { BOX_OUTSIDE_ROW_OF, COLUMN_OUTSIDE_BOX_OF, type LINES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { countSetBits, indexToMask, lowestSetIndex } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit } from "../../../utils/board.js";
import { isRow } from "../../../utils/coordinates.js";
import { canEliminateCandidates } from "./common.js";

type Line = (typeof LINES)[number];

export function findClaimingsInLine(board: Board, line: Line, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];
  for (const { digit, mask } of candidatesToDigitMasks(board, line)) {
    // Can only be claiming if less than 4 bits are set
    if (countSetBits(mask) > 3) continue;
    // Box relative -> board relative of first member
    const trueIndex = getUnit(line, lowestSetIndex(mask) ?? -1);

    if (LINE_MASKS.some((m) => (mask & ~m) === 0)) {
      const targetCells = getUnit(isRow(line) ? BOX_OUTSIDE_ROW_OF : COLUMN_OUTSIDE_BOX_OF, trueIndex);
      const digitMask = indexToMask(digit);
      if (!canEliminateCandidates(board, targetCells, digitMask)) continue;
      const result = { remove: targetCells, mask: digitMask };
      if (first) return [result];
      results.push(result);
    }
  }
  return results.length ? results : null;
}
