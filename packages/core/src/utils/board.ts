import { IllegalStateError } from "../classes/errors.js";
import { FULL_DIGIT_MASK } from "../constants/bitwise.js";
import { DIGITS } from "../constants/board.js";
import { BOARD, PEERS } from "../constants/coordinates.js";
import type { Board, Cell } from "../types/board.type.js";
import { indexToMask, isBitSet } from "./bitwise.js";

export function getUnit<T>(unit: readonly T[], index: number): T {
  const value = unit[index];
  if (value == null) throw new RangeError(`Unit is nullish with index ${index.toString()}`);
  return value;
}

// Trust caller candidates if rebuild = false
export function sanitizeCandidates(board: Board, rebuild = false): Board {
  const newBoard: Board = [];

  for (const index of BOARD) {
    // Get peer indices
    const peers = getUnit(PEERS, index);

    // Extract cell data
    const cell = getUnit(board, index);

    // Early exit for solved cells: reuse the original object if the mask is already normalized
    if (cell.value) {
      const solvedMask = indexToMask(cell.value);
      newBoard[index] = cell.candidates === solvedMask ? cell : { ...cell, candidates: solvedMask };
      continue;
    }

    let used = 0;
    for (const peerIndex of peers) {
      const peer = getUnit(board, peerIndex);
      if (peer.value) used |= indexToMask(peer.value);
    }

    const candidates = (rebuild ? FULL_DIGIT_MASK : cell.candidates) & ~used;
    if (candidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES);
    newBoard[index] = cell.candidates === candidates ? cell : { ...cell, candidates };
  }
  return newBoard;
}

export function removeCandidate(board: Board, index: number, mask: number): Cell {
  const cell = getUnit(board, index);
  if (cell.value) return cell;
  const newCandidates = cell.candidates & ~mask;
  if (newCandidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES, index);
  return cell.candidates === newCandidates ? cell : { ...cell, candidates: newCandidates };
}

export function transpose(candidates: readonly number[], digit: number): number {
  return candidates.reduce((mask, candidate, j) => ((candidate & indexToMask(digit)) !== 0 ? mask | (1 << j) : mask), 0);
}

export function* candidatesToDigitMasks(board: Board, indexes: readonly number[]): Generator<{ digit: number; mask: number }> {
  let eligible = FULL_DIGIT_MASK;
  const candidates: number[] = [];
  for (const index of indexes) {
    const cell = getUnit(board, index);
    if (cell.value) {
      eligible &= ~indexToMask(cell.value);
      candidates.push(0);
    } else {
      candidates.push(cell.candidates);
    }
  }

  if (eligible === 0) return;

  for (const digit of DIGITS) if (isBitSet(eligible, digit)) yield { digit, mask: transpose(candidates, digit) };
}
