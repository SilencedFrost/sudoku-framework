import { IllegalStateError } from "../../../classes/errors.js";
import { LINE_MASKS } from "../../../constants/bitwise.js";
import { BOX_OUTSIDE_COLUMN_OF, BOX_OUTSIDE_ROW_OF, COLUMNS, HOUSES, ROWS } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import { countSetBits, indexToMask, lowestSetIndex, setBitIndices } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit, removeCandidate } from "../../../utils/board.js";

// Claiming helper
function filterCellCandidates(board: Board, cellIndexes: readonly number[], mask: number): number[] | null {
  const result: number[] = [];
  for (const index of cellIndexes) {
    const cell = getUnit(board, index);
    if (!cell.value && (cell.candidates & mask) !== 0) result.push(index);
  }
  return result.length ? result : null;
}

function findClaiming(board: Board): { remove: readonly number[]; value: number } | null {
  // Rows
  for (const row of ROWS) {
    for (const { digit, mask } of candidatesToDigitMasks(board, row)) {
      const trueIndex = getUnit(row, lowestSetIndex(mask) ?? -1);

      if (LINE_MASKS.some((m) => (mask & ~m) === 0)) {
        const rowRemovable = getUnit(BOX_OUTSIDE_ROW_OF, trueIndex);
        const digitMask = indexToMask(digit);
        const removable = filterCellCandidates(board, rowRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }
    }
  }

  // Cols
  for (const column of COLUMNS) {
    for (const { digit, mask } of candidatesToDigitMasks(board, column)) {
      const trueIndex = getUnit(column, lowestSetIndex(mask) ?? -1);

      if (LINE_MASKS.some((m) => (mask & ~m) === 0)) {
        const colRemovable = getUnit(BOX_OUTSIDE_COLUMN_OF, trueIndex);
        const digitMask = indexToMask(digit);
        const removable = filterCellCandidates(board, colRemovable, digitMask);
        if (removable) return { remove: removable, value: digit };
      }
    }
  }

  return null;
}

export function solveClaiming(board: Board): Board | null {
  const solution = findClaiming(board);
  if (!solution) return null;
  const newBoard = [...board];
  const mask = indexToMask(solution.value);
  for (const index of solution.remove) newBoard[index] = removeCandidate(newBoard, index, mask);
  return newBoard;
}

function findHiddenPair(board: Board): { remove: number[]; mask: number } | null {
  for (const house of HOUSES) {
    const digitsOfMask: Record<number, number[]> = {};
    for (const { digit, mask } of candidatesToDigitMasks(board, house)) {
      if (countSetBits(mask) === 2) {
        const digits = digitsOfMask[mask];
        if (digits) {
          digits.push(digit);
        } else {
          digitsOfMask[mask] = [digit];
        }
      }
    }

    for (const [mask, digits] of Object.entries(digitsOfMask)) {
      if (digits.length > 2) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_HIDDEN_COUNT, digits.length);
      if (digits.length !== 2) continue;
      const relativeIndexes = setBitIndices(Number(mask));
      const digitMask = digits.reduce((acc, v) => acc | indexToMask(v), 0);
      for (const index of relativeIndexes) {
        const cell = getUnit(board, house[index] ?? -1);
        if (cell.candidates !== digitMask) return { remove: relativeIndexes.map((i) => house[i] ?? -1), mask: digitMask };
      }
    }
  }

  return null;
}

export function solveHiddenPair(board: Board): Board | null {
  const solution = findHiddenPair(board);
  if (!solution) return null;
  const newBoard = [...board];
  for (const index of solution.remove) newBoard[index] = removeCandidate(newBoard, index, ~solution.mask);
  return newBoard;
}
