import { IllegalStateError } from "../classes/errors.js";
import { FULL_CANDIDATE_MASK } from "../constants/bitwise.js";
import { PEERS } from "../constants/cordinates.js";
import type { Board, Cell } from "../types/board.type.js";
import { indexToMask } from "../utils/bitwise.js";

export function getCell(board: Board, index: number): Cell {
  const cell = board[index];
  if (!cell) throw new RangeError(`Cell is falsy with index ${index.toString()}`);
  return cell;
}

export function getPeers(index: number): readonly number[] {
  const peers = PEERS[index];
  if (!peers) throw new RangeError(`Peers is falsy with index ${index.toString()}`);
  return peers;
}

// Trust caller candidates if rebuild = false
export function sanitizeCandidates(board: Board, rebuild = false): Board {
  const newBoard: Board = [];

  for (let i = 0; i < 81; i++) {
    // Get peer indices
    const peers = PEERS[i];
    if (!peers) throw new RangeError(`Peers is falsy with index ${i.toString()}`);

    // Extract cell data
    const cell = getCell(board, i);

    // Early exit for solved cells: reuse the original object if the mask is already normalized
    if (cell.value) {
      const solvedMask = indexToMask(cell.value);
      newBoard[i] = cell.candidates === solvedMask ? cell : { ...cell, candidates: solvedMask };
      continue;
    }

    let used = 0;
    for (const peer of peers) {
      const peerValue = board[peer]?.value ?? null;
      if (peerValue) {
        used |= indexToMask(peerValue);
      }
    }

    const candidates = (rebuild ? FULL_CANDIDATE_MASK : cell.candidates) & ~used;
    if (candidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES);
    newBoard[i] = cell.candidates === candidates ? cell : { ...cell, candidates };
  }
  return newBoard;
}

export function removeCandidate(board: Board, index: number, mask: number): Cell {
  const cell = getCell(board, index);
  const newCandidates = cell.candidates & ~mask;
  if (newCandidates === 0) throw new IllegalStateError(IllegalStateError.Code.NO_CANDIDATES);
  return cell.candidates === newCandidates ? cell : { ...cell, candidates: newCandidates };
}
