import { PEERS } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import type { BasicConfig, CandidateElimination, SimpleModification } from "../../../types/algorithms.type.js";
import { countSetBits, indexToMask, lowestSetIndex } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit, removeCandidate } from "../../../utils/board.js";

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

export function applyEliminations(board: Board, eliminations: readonly CandidateElimination[] | null): Board | null {
  if (eliminations === null) return null;
  const newBoard = [...board];

  for (const { remove, mask } of eliminations) {
    for (const index of remove) newBoard[index] = removeCandidate(newBoard, index, mask);
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

// One way a unit's digit positions can be confined: `alignments` are position
// masks inside the unit, `outside` maps a cell index to the cells that should
// lose the digit.
export interface ConfinementDirection {
  readonly alignments: readonly number[];
  readonly outside: readonly (readonly number[])[];
}

/**
 * Shared search for pointing pairs (`box.ts`) and claiming (`line.ts`).
 *
 * Scans a unit's digit position masks and, when a mask fits inside one of the
 * supplied `directions`, removes that digit from the direction's outside cells.
 * Callees only differ in the unit they iterate, the alignment masks, and which
 * outside map each alignment uses.
 */
export function findConfinedEliminations(
  board: Board,
  unit: readonly number[],
  directions: readonly ConfinementDirection[],
  { first = true, minPositions = 1 }: BasicConfig & { minPositions?: number } = {},
): CandidateElimination[] | null {
  const results: CandidateElimination[] = [];

  for (const { digit, mask } of candidatesToDigitMasks(board, unit)) {
    // Pointing needs a pair or triple; claiming also allows a single position
    // (a hidden-single-strength elimination).
    const positions = countSetBits(mask);
    if (positions < minPositions || positions > 3) continue;

    let targetCells: readonly number[] | null = null;
    for (const direction of directions) {
      if (!direction.alignments.some((alignment) => (mask & ~alignment) === 0)) continue;
      // Unit-relative -> board-relative of the first member.
      targetCells = getUnit(direction.outside, getUnit(unit, lowestSetIndex(mask) ?? -1));
      break;
    }
    if (!targetCells) continue;

    const digitMask = indexToMask(digit);
    if (!canEliminateCandidates(board, targetCells, digitMask)) continue;

    const result = { remove: targetCells, mask: digitMask };
    if (first) return [result];
    results.push(result);
  }

  return results.length ? results : null;
}
