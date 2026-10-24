import { IllegalStateError } from "../../../classes/errors.js";
import { HOUSES } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import { countSetBits, indexToMask, setBitIndices } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit, removeCandidate } from "../../../utils/board.js";

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
