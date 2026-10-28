// Solvers exported by this are run per-house
import { FULL_DIGIT_MASK } from "../../../constants/bitwise.js";
import { HOUSE_DIGIT_SUM, MAX_SET_SIZE } from "../../../constants/board.js";
import type { HOUSES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination, SimpleModification } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { countSetBits, indexToMask, maskToIndex, setBitIndices } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit } from "../../../utils/board.js";
import { canEliminateCandidates, getMinimalHallSets } from "./common.js";

type House = (typeof HOUSES)[number];

// Full house: a house with exactly one empty cell -> missing digit = HOUSE_DIGIT_SUM - sum of filled
export function findFullHouse(board: Board, house: House): SimpleModification | null {
  let sum = 0;
  let missingIndex: number | null = null;

  for (const index of house) {
    const cell = getUnit(board, index);
    if (cell.value) {
      sum += cell.value;
    } else if (missingIndex === null) {
      missingIndex = index;
    } else {
      // More than 1 unknowns
      return null;
    }
  }

  // Fully filled house
  if (missingIndex === null) return null;

  return { index: missingIndex, value: HOUSE_DIGIT_SUM - sum };
}

// Hidden single: Within a unit, a value only appear as a candidate once
export function findHiddenSinglesInHouse(board: Board, house: House, { first = true }: BasicConfig = {}): SimpleModification[] | null {
  let once = 0;
  let twice = 0;
  for (const index of house) {
    const cell = getUnit(board, index);
    // Has value, irrelevant
    if (cell.value) continue;
    twice |= once & cell.candidates;
    once |= cell.candidates;
  }

  const onlyOnce = once & ~twice;
  if (onlyOnce === 0) return null;

  const results: SimpleModification[] = [];

  for (const index of house) {
    const cell = getUnit(board, index);
    // Has value, irrelevant
    if (cell.value) continue;

    const intersect = cell.candidates & onlyOnce;

    if (countSetBits(intersect) !== 1) continue;

    const value = maskToIndex(intersect);
    if (!value) throw new Error("Hidden single finder reached an illegal state where value is falsy");

    const result = { value, index };
    if (first) return [result];
    results.push(result);
  }

  return results.length ? results : null;
}

export function findNakedSetsInHouse(board: Board, house: House, { size: n, first = false }: BasicConfig & { size?: number | undefined } = {}): CandidateElimination[] | null {
  if (n !== undefined && (n < 2 || n > MAX_SET_SIZE)) throw new RangeError(`findNakedSets does not support n=${n.toString()}`);

  let unsolved = 0;
  for (const index of house) if (!getUnit(board, index).value) unsolved++;

  const minSize = n ?? 2;
  // A naked set needs at least one non-member cell to eliminate from.
  if (unsolved <= minSize) return null;

  const nLimit: number = n ?? Math.min(unsolved - 1, MAX_SET_SIZE);

  const collectTargets = (unionMask: number): number[] => {
    const targets: number[] = [];
    for (const index of house) {
      const cell = getUnit(board, index);
      if (!cell.value && (cell.candidates & ~unionMask) !== 0) targets.push(index);
    }
    return targets;
  };

  const usableMasks: number[] = [];
  for (const index of house) {
    const cell = getUnit(board, index);
    if (cell.value) continue;
    const bits = countSetBits(cell.candidates);
    if (bits >= 2 && bits <= nLimit) usableMasks.push(cell.candidates);
  }

  const results: CandidateElimination[] = [];

  for (const unionMask of getMinimalHallSets(usableMasks, { size: n })) {
    const remove = collectTargets(unionMask);
    if (!canEliminateCandidates(board, remove, unionMask)) continue;

    const elimination = { mask: unionMask, remove };
    if (first) return [elimination];
    results.push(elimination);
  }

  return results.length > 0 ? results : null;
}

export function findHiddenSetsInHouse(board: Board, house: House, { size: n, first = false }: BasicConfig & { size?: number | undefined } = {}): CandidateElimination[] | null {
  if (n !== undefined && (n < 2 || n > MAX_SET_SIZE)) throw new RangeError(`findHiddenSets does not support n=${n.toString()}`);

  let unsolved = 0;
  for (const index of house) if (!getUnit(board, index).value) unsolved++;

  const minSize = n ?? 2;
  if (unsolved < minSize) return null;

  const nLimit: number = n ?? Math.min(unsolved, MAX_SET_SIZE);

  const membersOf = (unionMask: number): number[] => setBitIndices(unionMask).map((position) => getUnit(house, position));
  const outsideOf = (digitMask: number): number => FULL_DIGIT_MASK & ~digitMask;
  const hasElimination = (unionMask: number, removeMask: number): boolean => canEliminateCandidates(board, membersOf(unionMask), removeMask);

  const usableDigits: { digit: number; mask: number }[] = [];
  for (const entry of candidatesToDigitMasks(board, house)) {
    const bits = countSetBits(entry.mask);
    if (bits >= 2 && bits <= nLimit) usableDigits.push(entry);
  }

  const results: CandidateElimination[] = [];

  for (const unionMask of getMinimalHallSets(
    usableDigits.map((entry) => entry.mask),
    { size: n },
  )) {
    let digitMask = 0;
    for (const { digit, mask } of usableDigits) if ((mask & ~unionMask) === 0) digitMask |= indexToMask(digit);

    const removeMask = outsideOf(digitMask);
    if (!hasElimination(unionMask, removeMask)) continue;

    const elimination = { mask: removeMask, remove: membersOf(unionMask) };
    if (first) return [elimination];
    results.push(elimination);
  }

  return results.length > 0 ? results : null;
}
