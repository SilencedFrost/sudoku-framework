import { COL_MASKS, ROW_MASKS } from "../../../constants/bitwise.js";
import { COLUMN_OUTSIDE_BOX_OF, ROW_OUTSIDE_BOX_OF, type BOXES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { countSetBits, indexToMask, lowestSetIndex } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit } from "../../../utils/board.js";
import { canEliminateCandidates } from "./common.js";

type Box = (typeof BOXES)[number];

export function findPointingPairsInBox(board: Board, box: Box, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];
  for (const { digit, mask } of candidatesToDigitMasks(board, box)) {
    const setBitsCount = countSetBits(mask);
    // Can only be pointing if only 2 or 3 bits are set
    if (setBitsCount > 3 || setBitsCount < 2) continue;
    // Box relative -> board relative of first member
    const trueIndex = getUnit(box, lowestSetIndex(mask) ?? -1);

    let targetCells: readonly number[] | null = null;
    if (ROW_MASKS.some((m) => (mask & ~m) === 0)) {
      targetCells = getUnit(ROW_OUTSIDE_BOX_OF, trueIndex);
    } else if (COL_MASKS.some((m) => (mask & ~m) === 0)) {
      targetCells = getUnit(COLUMN_OUTSIDE_BOX_OF, trueIndex);
    }

    if (!targetCells) continue;

    const digitMask = indexToMask(digit);
    if (!canEliminateCandidates(board, targetCells, digitMask)) continue;
    const result = { remove: targetCells, mask: digitMask };
    if (first) return [result];
    results.push(result);
  }

  return results.length ? results : null;
}
