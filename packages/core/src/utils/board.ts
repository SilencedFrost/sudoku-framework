import { IllegalStateError } from "../classes/errors.js";
import { FULL_DIGIT_MASK } from "../constants/bitwise.js";
import { PEERS } from "../constants/cordinates.js";
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

  for (let i = 0; i < 81; i++) {
    // Get peer indices
    const peers = PEERS[i];
    if (!peers) throw new RangeError(`Peers is falsy with index ${i.toString()}`);

    // Extract cell data
    const cell = getUnit(board, i);

    // Early exit for solved cells: reuse the original object if the mask is already normalized
    if (cell.value) {
      const solvedMask = indexToMask(cell.value);
      newBoard[i] = cell.candidates === solvedMask ? cell : { ...cell, candidates: solvedMask };
      continue;
    }

    let used = 0;
    for (const index of peers) {
      const peer = getUnit(board, index);
      if (peer.value) used |= indexToMask(peer.value);
    }

    const candidates = (rebuild ? FULL_DIGIT_MASK : cell.candidates) & ~used;
    if (candidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES);
    newBoard[i] = cell.candidates === candidates ? cell : { ...cell, candidates };
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

  for (let i = 1; i <= 9; i++) {
    if (!isBitSet(eligible, i)) continue;
    const digitMask = indexToMask(i);
    const positionMask = candidates.reduce((mask, candidate, j) => ((candidate & digitMask) !== 0 ? mask | (1 << j) : mask), 0);
    yield { digit: i, mask: positionMask };
  }
}
