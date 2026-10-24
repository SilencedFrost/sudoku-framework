import { BOARD, BOXES, HOUSES, LINES } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { BasicConfig, CandidateElimination, SimpleModification } from "../../../types/algorithms.type.js";
import { applyEliminations, applySimpleModifications } from "./common.js";
import { findFullHouse, findHiddenSinglesInHouse, findNakedSetsInHouse } from "./house.js";
import { findNakedSingle } from "./cell.js";
import { findPointingPairsInBox } from "./box.js";
import { findClaimingsInLine } from "./line.js";

function findFullHouses(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const house of HOUSES) {
    const result = findFullHouse(board, house);

    if (!result) continue;
    if (first) return [result];
    results.push(result);
  }

  return results.length ? results : null;
}

export function solveFullHouses(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findFullHouses(board, config));
}

function findHiddenSinglesInHouses(board: Board, houses: typeof HOUSES, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const box of houses) {
    const result = findHiddenSinglesInHouse(board, box, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solveHiddenSinglesBoxes(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesInHouses(board, BOXES, config));
}

export function solveHiddenSinglesLines(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesInHouses(board, LINES, config));
}

function findNakedSingles(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const index of BOARD) {
    const nakedSingle = findNakedSingle(board, index);
    if (!nakedSingle) continue;
    const result = { index, value: nakedSingle };
    if (first) return [result];
    results.push(result);
  }
  return results.length ? results : null;
}

export function solveNakedSingles(board: Board, config: BasicConfig): Board | null {
  return applySimpleModifications(board, findNakedSingles(board, config));
}

function findPointingPairs(board: Board, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];
  for (const box of BOXES) {
    const result = findPointingPairsInBox(board, box, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solvePointingPairs(board: Board, config: BasicConfig = {}): Board | null {
  return applyEliminations(board, findPointingPairs(board, config));
}

function findClaimings(board: Board, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];
  for (const line of LINES) {
    const result = findClaimingsInLine(board, line, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solveClaimings(board: Board, config: BasicConfig = {}): Board | null {
  return applyEliminations(board, findClaimings(board, config));
}

function findNakedSets(board: Board, { first = true, size }: BasicConfig & { size?: number } = {}): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];
  for (const house of HOUSES) {
    const result = findNakedSetsInHouse(board, house, { first, size });

    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solveNakedSets(board: Board, config: BasicConfig & { size?: number } = {}): Board | null {
  return applyEliminations(board, findNakedSets(board, config));
}
