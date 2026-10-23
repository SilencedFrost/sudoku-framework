import { BOARD, HOUSES } from "../../../constants/cordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { BasicConfig, SimpleModification } from "../../../types/algorithms.type.js";
import { getUnit } from "../../../utils/board.js";
import { applySimpleModifications } from "./common.js";
import { findFullHouse, findNakedSetsInHouse } from "./house.js";
import { findNakedSingle } from "./cell.js";

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

function findNakedSingles(board: Board, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  const results: SimpleModification[] = [];
  for (const index of BOARD) {
    const result = findNakedSingle(board, index);
    if (!result) continue;
    if (first) return [{ index, value: result }];
    results.push({ index, value: result });
  }
  return results.length ? results : null;
}

export function solveNakedSingles(board: Board, config: BasicConfig): Board | null {
  return applySimpleModifications(board, findNakedSingles(board, config));
}

function findNakedSets(board: Board, { first = true, size }: BasicConfig & { size?: number } = {}): { masks: number[]; house: (typeof HOUSES)[number] }[] | null {
  const results: { masks: number[]; house: (typeof HOUSES)[number] }[] = [];
  for (const house of HOUSES) {
    const result = findNakedSetsInHouse(board, house, { first, size });

    if (!result) continue;
    if (first) return [{ masks: result, house }];
    results.push({ masks: result, house });
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
