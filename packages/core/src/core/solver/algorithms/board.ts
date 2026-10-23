import { BOARD, BOXES, HOUSES, LINES } from "../../../constants/cordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { BasicConfig, SimpleModification } from "../../../types/algorithms.type.js";
import { getUnit, removeCandidate } from "../../../utils/board.js";
import { applySimpleModifications } from "./common.js";
import { findFullHouse, findHiddenSinglesInHouse, findNakedSetsInHouse } from "./house.js";
import { findNakedSingle } from "./cell.js";
import { findPointingPairsInBox } from "./box.js";

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

function findPointingPairs(board: Board, { first = true }: BasicConfig = {}): { mask: number; remove: readonly number[] }[] | null {
  const results: { mask: number; remove: readonly number[] }[] = [];
  for (const box of BOXES) {
    const result = findPointingPairsInBox(board, box, { first });
    if (!result) continue;
    if (first) return result;
    results.push(...result);
  }
  return results.length ? results : null;
}

export function solvePointingPairs(board: Board, config: BasicConfig = {}): Board | null {
  const results = findPointingPairs(board, config);
  if (!results) return null;
  const newBoard = [...board];
  for (const { remove, mask } of results) {
    for (const index of remove) newBoard[index] = removeCandidate(board, index, mask);
  }
  return newBoard;
}

function findNakedSets(board: Board, { first = true, size }: BasicConfig & { size?: number } = {}): { masks: number[]; house: (typeof HOUSES)[number] }[] | null {
  const results: { masks: number[]; house: (typeof HOUSES)[number] }[] = [];
  for (const house of HOUSES) {
    const masks = findNakedSetsInHouse(board, house, { first, size });

    if (!masks) continue;
    const result = { masks, house };
    if (first) return [result];
    results.push(result);
  }
  return results.length ? results : null;
}

export function solveNakedSets(board: Board, config: BasicConfig & { size?: number } = {}): Board | null {
  const results = findNakedSets(board, config);
  if (!results) return null;
  const newBoard = [...board];
  for (const { masks, house } of results) {
    for (const index of house) {
      const cell = getUnit(newBoard, index);
      if (cell.value) continue;
      let toRemove = 0;
      for (const mask of masks) {
        // Member of the mask
        if ((cell.candidates & ~mask) === 0) continue;
        toRemove |= mask;
      }
      if (toRemove) {
        const newCandidates = cell.candidates & ~toRemove;
        newBoard[index] = cell.candidates === newCandidates ? cell : { ...cell, candidates: newCandidates };
      }
    }
  }
  return newBoard;
}
