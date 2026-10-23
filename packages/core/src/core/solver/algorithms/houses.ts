import { BOXES, LINES } from "../../../constants/cordinates.js";
import type { BasicConfig, SimpleModification } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { applySimpleModifications } from "./common.js";
import { findHiddenSinglesInHouse } from "./house.js";

function findHiddenSinglesBoxes(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const box of BOXES) {
    const result = findHiddenSinglesInHouse(board, box, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solveHiddenSinglesBoxes(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesBoxes(board, config));
}

function findHiddenSinglesLines(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const line of LINES) {
    const result = findHiddenSinglesInHouse(board, line, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solveHiddenSinglesLines(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesLines(board, config));
}
