import { PEERS } from "../../../constants/cordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { SimpleModification } from "../../../types/algorithms.type.js";
import { indexToMask } from "../../../utils/bitwise.js";
import { getUnit, removeCandidate } from "../../../utils/board.js";

export function applySimpleModifications(board: Board, modifications: SimpleModification[] | null): Board | null {
  if (modifications === null) return null;
  const newBoard = [...board];

  const placed: number[] = [];

  for (const modification of modifications) {
    if (placed.includes(modification.index)) continue;
    placed.push(modification.index);

    const cell = getUnit(newBoard, modification.index);
    const mask = indexToMask(modification.value);

    // Modify cell
    newBoard[modification.index] = { ...cell, value: modification.value, candidates: mask };

    // Modify peers
    const peers = getUnit(PEERS, modification.index);
    for (const peer of peers) newBoard[peer] = removeCandidate(newBoard, peer, mask);
  }

  return newBoard;
}

// Pointing pairs helper
export function canEliminateCandidates(board: Board, indexes: readonly number[], mask: number): boolean {
  return indexes.some((i) => {
    const cell = getUnit(board, i);
    return !cell.value && (cell.candidates & mask) !== 0;
  });
}
