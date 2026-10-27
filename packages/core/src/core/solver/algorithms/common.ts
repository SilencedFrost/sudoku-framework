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

// Sizes to search, smallest first. A forced `size` consumes every smaller size
// up to `size - 2` so results stay minimal, then searches `size` itself. The
// `size - 1` pass is skipped: the requested pass rejects a union that still
// encloses a set of that size, which is cheaper than searching it explicitly.
// The default reports every supported size, so no pass is skipped.
function searchSizes(size?: number): number[] {
  if (size === undefined) return [2, 3, 4];

  const sizes: number[] = [];
  for (let k = 2; k <= size - 2; k++) sizes.push(k);
  sizes.push(size);
  return sizes;
}

// A size-2 union is exactly two identical two-value masks. Counting them is
// cheaper than the recursive search for the tiny pools a house produces, and
// keeping it out of `getMinimalHallSets` avoids growing that function's hot
// larger-size path.
function findPairUnions(candidates: readonly number[]): number[] {
  const unions: number[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const mask = getUnit(candidates, i);
    if (countSetBits(mask) !== 2) continue;

    // Count all occurrences and report each mask once, from its first position.
    // A mask seen three times is not a pair: it would put three items in a
    // two-value union.
    let count = 0;
    let first = -1;
    for (let j = 0; j < candidates.length; j++) {
      if (getUnit(candidates, j) !== mask) continue;
      if (first === -1) first = j;
      count++;
    }

    if (count === 2 && first === i) unions.push(mask);
  }

  return unions;
}

/**
 * Find Hall unions among item masks.
 *
 * A Hall union of size `k` is a union of item masks that spans exactly `k`
 * values and contains exactly `k` item masks from the pool. Those items are
 * confined to the union, so they form a naked set when the masks are cell
 * candidates, or a hidden set when they are digit positions.
 *
 * Masks with fewer than two values are ignored: a single-value item cannot be
 * part of a set. Items consumed by a union leave the pool, so larger passes do
 * not report a superset of a set already found.
 *
 * Size 2 is found by counting identical two-value masks; larger sizes use the
 * recursive search.
 *
 * - `size`: return only unions of that size. Sizes 2..`size - 2` are consumed
 *   first so results stay minimal, then the requested pass rejects a union that
 *   still contains a set of size `size - 1`. This covers size 3 as well, where
 *   the rejected subset is a pair.
 * - Returns an empty array when no union matches.
 */
export function getMinimalHallSets(masks: readonly number[], { size }: { size?: number | undefined } = {}): number[] {
  let pool = masks.filter((mask) => countSetBits(mask) >= 2);
  const sizes = searchSizes(size);
  const results: number[] = [];

  for (let pass = 0; pass < sizes.length; pass++) {
    const k = getUnit(sizes, pass);
    const candidates = pool.filter((mask) => countSetBits(mask) <= k);
    if (candidates.length < k) continue;

    // A forced size above 2 skips its `size - 1` pass, so reject a union that
    // still encloses a set of that size. Size 2 has no smaller set to reject
    // (single-value masks are filtered out above).
    const rejectNested = size !== undefined && size > 2 && pass === sizes.length - 1;
    const unions: number[] = k === 2 ? findPairUnions(candidates) : [];

    if (k !== 2) {
      // Duplicate masks are separate members ("twins"): both may belong to the
      // same union, so count every contained mask rather than distinct values.
      const countContained = (union: number): number => {
        let contained = 0;
        for (const mask of candidates) if ((mask & ~union) === 0) contained++;
        return contained;
      };

      const verify = (union: number): void => {
        if (unions.includes(union) || countContained(union) !== k) return;

        if (rejectNested) {
          // Dropping any one value must leave fewer than k - 1 contained items;
          // otherwise the union encloses a smaller set.
          for (let bits = union; bits !== 0; bits &= bits - 1) {
            const bit = bits & -bits;
            if (countContained(union & ~bit) >= k - 1) return;
          }
        }

        unions.push(union);
      };

      const search = (start: number, union: number): void => {
        for (let i = start; i < candidates.length; i++) {
          const nextUnion = union | getUnit(candidates, i);
          const values = countSetBits(nextUnion);
          if (values > k) continue; // a union larger than k cannot be a k-set
          if (values === k) verify(nextUnion);
          else search(i + 1, nextUnion);
        }
      };

      search(0, 0);
    }

    if (unions.length) {
      // Smaller sizes are consumed to keep larger results minimal, but only
      // the requested size is reported.
      if (size === undefined || k === size) results.push(...unions);
      pool = pool.filter((mask) => !unions.some((union) => (mask & ~union) === 0));
    }
  }

  return results;
}
