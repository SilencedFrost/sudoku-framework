import { BOARD, BOXES, HOUSES, LINES } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { BasicConfig, CandidateElimination, SimpleModification } from "../../../types/algorithms.type.js";
import { applyEliminations, applySimpleModifications } from "./common.js";
import { findFullHouse, findHiddenSetsInHouse, findHiddenSinglesInHouse, findNakedSetsInHouse } from "./house.js";
import { findNakedSingle } from "./cell.js";
import { findPointingPairsInBox } from "./box.js";
import { findClaimingsInLine } from "./line.js";

// Shared board-level scan: run a finder over every unit, returning the
// first hit or every hit depending on `first`.
function findInUnit<I, T>(unit: readonly I[], finder: (index: I) => T[] | null, first: boolean): T[] | null {
  const results: T[] = [];
  for (const index of unit) {
    const found = finder(index);
    if (!found) continue;
    if (first) return found;
    results.push(...found);
  }
  return results.length ? results : null;
}

function findFullHouses(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  return findInUnit(
    HOUSES,
    (house) => {
      const result = findFullHouse(board, house);
      return result ? [result] : null;
    },
    first,
  );
}

export function solveFullHouses(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findFullHouses(board, config));
}

function findHiddenSinglesInHouses(board: Board, houses: typeof HOUSES, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  return findInUnit(houses, (house) => findHiddenSinglesInHouse(board, house, { first }), first);
}

export function solveHiddenSinglesBoxes(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesInHouses(board, BOXES, config));
}

export function solveHiddenSinglesLines(board: Board, config: BasicConfig = {}): Board | null {
  return applySimpleModifications(board, findHiddenSinglesInHouses(board, LINES, config));
}

function findNakedSingles(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  return findInUnit(
    BOARD,
    (index) => {
      const value = findNakedSingle(board, index);
      return value === null ? null : [{ index, value }];
    },
    first,
  );
}

export function solveNakedSingles(board: Board, config: BasicConfig): Board | null {
  return applySimpleModifications(board, findNakedSingles(board, config));
}

function findPointingPairs(board: Board, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  return findInUnit(BOXES, (box) => findPointingPairsInBox(board, box, { first }), first);
}

export function solvePointingPairs(board: Board, config: BasicConfig = {}): Board | null {
  return applyEliminations(board, findPointingPairs(board, config));
}

function findClaimings(board: Board, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  return findInUnit(LINES, (line) => findClaimingsInLine(board, line, { first }), first);
}

export function solveClaimings(board: Board, config: BasicConfig = {}): Board | null {
  return applyEliminations(board, findClaimings(board, config));
}

function findNakedSets(board: Board, { first = true, size }: BasicConfig & { size?: number } = {}): CandidateElimination[] | null {
  return findInUnit(HOUSES, (house) => findNakedSetsInHouse(board, house, { first, size }), first);
}

export function solveNakedSets(board: Board, config: BasicConfig & { size?: number } = {}): Board | null {
  return applyEliminations(board, findNakedSets(board, config));
}

function findHiddenSets(board: Board, { first = true, size }: BasicConfig & { size?: number } = {}): CandidateElimination[] | null {
  return findInUnit(HOUSES, (house) => findHiddenSetsInHouse(board, house, { first, size }), first);
}

export function solveHiddenSets(board: Board, config: BasicConfig & { size?: number } = {}): Board | null {
  return applyEliminations(board, findHiddenSets(board, config));
}
