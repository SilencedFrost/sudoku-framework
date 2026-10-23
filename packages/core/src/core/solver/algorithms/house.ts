// Solvers exported by this are run per-house
import { IllegalStateError } from "../../../classes/errors.js";
import type { HOUSES } from "../../../constants/coordinates.js";
import type { BasicConfig, SimpleModification } from "../../../types/algorithms.type.js";
import type { Board, Cell } from "../../../types/board.type.js";
import { countSetBits, maskToIndex } from "../../../utils/bitwise.js";
import { getUnit } from "../../../utils/board.js";

type House = (typeof HOUSES)[number];

// Full house: a house with exactly one empty cell -> missing digit = 45 - sum of filled
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

  return { index: missingIndex, value: 45 - sum };
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

/**
 * Find naked sets inside one house.
 *
 * A set counts as "usable" only when it can eliminate a candidate from some
 * other unsolved cell in the same house. Sets that eliminate nothing are
 * skipped.
 *
 * Results are union masks, not cell lists. The members are the cells whose
 * candidates fit inside the mask, so the caller can recover them if it needs
 * them. Keeping the finder mask-only makes it as cheap as possible: it marks a
 * union as soon as it is actionable and leaves everything else to the caller.
 *
 * - Default (no `size`): search every size k up to floor(unsolved / 2) and
 *   return every usable set found. Once cells are used by a set they leave the
 *   pool, so overlapping alternatives are not enumerated — the result is a
 *   maximal collection of disjoint minimal sets. The cap is a speed tradeoff
 *   for unattended full solves (stateful solvers, no user interaction), so it
 *   can miss a larger set in a small house, e.g. a usable triple when only 5
 *   cells are unsolved. Pass `size` to force a size.
 * - `size: n`: return usable sets of size n only. Smaller sizes are not
 *   searched first. For the currently supported sizes (n <= 4), minimality is
 *   enforced on the set itself: every digit must be held by at least two of its
 *   cells, so no smaller naked set can fit inside it.
 * - `first: true`: stop at the first usable set and return it.
 * - Returns `null` when no usable set matches the request.
 * - Throws `IllegalStateError` when a found set's digits enclose more cells
 *   than the set can hold (e.g. three cells sharing the same pair). This is
 *   only detected for sizes the search actually reaches.
 *
 * Generalization notes (the current implementation is 9x9-oriented):
 * - Only `size` 2..4 is accepted; `n > 4` throws. The default search is also
 *   capped at `floor(unsolved / 2)`, which is at most 4 in a 9-cell house.
 * - The forced-size minimality check only rules out an `(n-1)`-subset. That is
 *   enough for n = 4 because pairs are pre-excluded and 3 is the only smaller
 *   size. It is not enough for n >= 5: a 5-set can contain a naked triple while
 *   every digit still appears at least twice. To keep skipping k = 3..n-1 for
 *   larger n, either consume every smaller size first or reject a found set
 *   when any proper subset of size 3..n-1 has a union of exactly that many
 *   digits (at most 2^n subsets; n <= 8 for a 16-cell house).
 * - The `n > 4` guard should become `floor(house.length / 2)` (or a digit-count
 *   limit). The `house` parameter is already `readonly number[]`, so a 16-cell
 *   unit needs no signature change, and bits 1..16 fit in the current 32-bit
 *   candidate masks.
 * - Outside this finder, the 9x9 assumptions live in `constants/coordinates.ts`
 *   (ROWS/COLUMNS/BOXES/PEERS), `constants/bitwise.ts` (FULL_DIGIT_MASK and the
 *   row/column/line masks), `utils/bitwise.ts` (resolveCandidates hardcodes 9),
 *   `utils/board.ts` (sanitizeCandidates hardcodes 81 and PEERS;
 *   candidatesToDigitMasks loops 1..9), and `core/generator.ts`.
 */
export function findNakedSetsInHouse(board: Board, house: House, { size: n, first = false }: BasicConfig & { size?: number | undefined } = {}): number[] | null {
  if (n !== undefined && (n < 2 || n > 4)) throw new RangeError(`findNakedSets does not support n=${n.toString()}`);

  const unsolvedCells: Cell[] = [];
  for (const index of house) {
    const cell = getUnit(board, index);
    if (!cell.value) unsolvedCells.push(cell);
  }

  const unsolved = unsolvedCells.length;
  const nClamp = n ?? 2; // smallest size we are allowed to report: n, or 2 when no size was asked for
  if (unsolved <= nClamp) return null;

  const nLimit: number = n ?? Math.max(Math.floor(unsolved / 2), 2);

  // Shared by the pair path and the larger-set path. We check against every
  // unsolved cell, not just the working pool, because cells already consumed
  // or pruned can still be elimination targets.
  const hasElimination = (unionMask: number): boolean => unsolvedCells.some((c) => (c.candidates & unionMask) !== 0 && (c.candidates & ~unionMask) !== 0);

  // A k-cell set can only absorb k digits. If more than k cells are confined
  // to those digits, the house can never be filled and the board is broken.
  // We only run this on unions the search actually produced, so it stays cheap.
  const assertNotOverfilled = (unionMask: number, size: number): void => {
    let enclosed = 0;
    for (const cell of unsolvedCells) if ((cell.candidates & ~unionMask) === 0) enclosed++;
    if (enclosed > size) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_NAKED_COUNT, enclosed);
  };

  // --- Collect candidates: bivalue cells are counted by mask, all other cells go straight into the pool ---
  let usableMasks: number[] = [];
  const bivalueCount = new Map<number, number>();

  for (const cell of unsolvedCells) {
    const bits = countSetBits(cell.candidates);
    if (bits < 2 || bits > nLimit) continue;
    if (bits === 2) {
      bivalueCount.set(cell.candidates, (bivalueCount.get(cell.candidates) ?? 0) + 1);
      continue; // decided below: a bivalue cell joins the pool only if it appears exactly once
    }
    usableMasks.push(cell.candidates);
  }

  const results: number[] = [];

  for (const [mask, count] of bivalueCount) {
    // Two digits may only be confined to exactly two cells. This also catches
    // the three-identical-bivalue-cells case, and is checked for lone bivalue
    // cells too because a naked single inside the mask would overfill it.
    assertNotOverfilled(mask, 2);

    // Seen once: keep it as a normal candidate for sets of size 3 or more.
    if (count === 1) {
      usableMasks.push(mask);
      continue;
    }
    // Seen twice: this is a naked pair. Keep it out of the pool so a larger
    // set can never absorb it, which keeps the results minimal. Report it only
    // when pairs were requested (no size given, or size 2).
    if (!(nClamp === 2 && hasElimination(mask))) continue;
    if (first) return [mask];
    results.push(mask);
  }

  // If size 2 was the whole request, we are done.
  if (n === 2) return results.length > 0 ? results : null;

  // Pairs are finished. Without a forced size, start at 3 and consume smaller
  // sizes so reported sets stay minimal. With a forced size, skip straight to
  // it and enforce minimality in `findSubset` instead.
  const SEARCH_START = n ?? 3;
  if (nLimit < SEARCH_START) return results.length > 0 ? results : null;

  // Only forced sizes above 3 skip the smaller consume passes, so only they
  // need the explicit minimality checks in `findSubset`. The default path (and
  // size 3) already gets minimality from pair exclusion plus consuming every
  // smaller size before trying a larger one.
  const enforceMinimality = SEARCH_START > 3;

  // --- Prune until nothing changes ---
  // A mask with a candidate that no other mask shares cannot be part of a set,
  // so drop it. This also enforces a necessary condition for minimality: in a
  // minimal k-set every digit appears in at least two of its cells.
  let twice = 0;
  let prevLength: number;
  do {
    if (usableMasks.length < SEARCH_START) return results.length > 0 ? results : null;
    prevLength = usableMasks.length;

    let once = 0;
    twice = 0;
    for (const m of usableMasks) {
      twice |= once & m;
      once |= m;
    }
    usableMasks = usableMasks.filter((m) => (m & ~twice) === 0);
  } while (usableMasks.length !== prevLength);

  if (countSetBits(twice) < SEARCH_START) return results.length > 0 ? results : null;

  // --- Recursive search: pick k pool cells whose candidates add up to exactly k values ---
  const findSubset = (pool: number[], k: number, start = 0, picked: number[] = [], union = 0): number[] | null => {
    if (picked.length === k) {
      if (countSetBits(union) !== k) return null;
      if (!enforceMinimality) return picked;

      // Minimality: every digit must be held by at least two cells of the set.
      // A digit held by one cell would leave a naked (k-1)-set behind.
      let seen = 0;
      let seenTwice = 0;
      for (const index of picked) {
        const mask = pool[index] ?? 0;
        seenTwice |= seen & mask;
        seen |= mask;
      }
      return countSetBits(seenTwice) === k ? picked : null;
    }

    // Early prune: every (k-1)-subset of a minimal k-set must still span all k
    // digits. If this prefix does not, the omitted cell is the sole holder of
    // at least one digit, so the final set would contain a smaller naked set.
    if (enforceMinimality && picked.length === k - 1 && countSetBits(union) !== k) return null;
    if (pool.length - start < k - picked.length) return null;

    for (let i = start; i < pool.length; i++) {
      const nextUnion = union | (pool[i] ?? 0);
      if (countSetBits(nextUnion) > k) continue;
      const found = findSubset(pool, k, i + 1, [...picked, i], nextUnion);
      if (found) return found;
    }
    return null;
  };

  // With no forced size this runs 3..nLimit; with a forced size it runs only n.
  for (let k = SEARCH_START; k <= nLimit; k++) {
    let indices: number[] | null;
    while (usableMasks.length >= k && (indices = findSubset(usableMasks, k)) !== null) {
      const picked = new Set(indices);

      // Build the union before filtering: the indices point into the current pool.
      const unionMask = indices.reduce((acc, i) => acc | (usableMasks[i] ?? 0), 0);

      usableMasks = usableMasks.filter((_, i) => !picked.has(i)); // a cell belongs to only one naked set

      assertNotOverfilled(unionMask, k);

      if (!hasElimination(unionMask)) continue;
      if (first) return [unionMask];
      results.push(unionMask);
    }
  }

  return results.length > 0 ? results : null;
}
