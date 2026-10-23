import type { Board } from "../../../types/board.type.js";
import { maskToIndex } from "../../../utils/bitwise.js";
import { getUnit } from "../../../utils/board.js";

export function findNakedSingle(board: Board, index: number): number | null {
  const cell = getUnit(board, index);
  if (cell.value) return null;
  const value = maskToIndex(cell.candidates);
  if (value) return value;
  return null;
}
