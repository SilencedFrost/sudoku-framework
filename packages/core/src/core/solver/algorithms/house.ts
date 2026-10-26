// Solvers exported by this are run per-house
import { IllegalStateError } from "../../../classes/errors.js";
import { FULL_DIGIT_MASK } from "../../../constants/bitwise.js";
import type { HOUSES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination, SimpleModification } from "../../../types/algorithms.type.js";
import type { Board, Cell } from "../../../types/board.type.js";
import { countSetBits, indexToMask, maskToIndex, setBitIndices } from "../../../utils/bitwise.js";
import { candidatesToDigitMasks, getUnit } from "../../../utils/board.js";
import { canEliminateCandidates } from "./common.js";

type House = (typeof HOUSES)[number];

interface SubsetSearch<T> {
  readonly maskOf: (item: T) => number;
  readonly isMinimal: (picked: readonly T[], union: number) => boolean;
}

interface SetSearch<T> extends SubsetSearch<T> {
  readonly first: boolean;
  readonly searchStart: number;
  readonly nLimit: number;
  readonly enforceMinimality: boolean;
  readonly onSet: (picked: readonly T[], union: number, size: number) => CandidateElimination | null;
}

// Recursive search: pick k pool items whose masks add up to exactly k values.
function findSubset<T>(
  pool: readonly T[],
  k: number,
  search: SubsetSearch<T>,
  enforceMinimality: boolean,
  start = 0,
  picked: number[] = [],
  union = 0,
): number[] | null {
  if (picked.length === k) {
    if (countSetBits(union) !== k) return null;
    if (!enforceMinimality) return picked;
    return search.isMinimal(picked.map((index) => getUnit(pool, index)), union) ? picked : null;
  }

  // Early prune: every (k-1)-subset of a minimal k-set must still span all k
  // digits/cells. If this prefix does not, the omitted item is the sole holder
  // of at least one value, so the final set would contain a smaller set.
  if (enforceMinimality && picked.length === k - 1 && countSetBits(union) !== k) return null;
  if (pool.length - start < k - picked.length) return null;

  for (let i = start; i < pool.length; i++) {
    const nextUnion = union | search.maskOf(getUnit(pool, i));
    if (countSetBits(nextUnion) > k) continue;
    const found = findSubset(pool, k, search, enforceMinimality, i + 1, [...picked, i], nextUnion);
    if (found) return found;
  }
  return null;
}

// Drop pool items whose mask shares no bit with any other item; they cannot
// take part in a minimal set. Repeat until the pool stops shrinking.
function prunePool<T>(pool: readonly T[], maskOf: (item: T) => number, minimum: number): T[] | null {
  let remaining = [...pool];
  let twice = 0;
  let previousLength: number;
  do {
    if (remaining.length < minimum) return null;
    previousLength = remaining.length;

    let once = 0;
    twice = 0;
    for (const item of remaining) {
      const mask = maskOf(item);
      twice |= once & mask;
      once |= mask;
    }
    remaining = remaining.filter((item) => (maskOf(item) & ~twice) === 0);
  } while (remaining.length !== previousLength);

  return countSetBits(twice) < minimum ? null : remaining;
}

// Consume sizes from `searchStart` up to `nLimit`, reporting through `onSet`.
// A pool item belongs to only one set, so found items leave the pool.
function collectSets<T>(initialPool: readonly T[], search: SetSearch<T>): CandidateElimination[] {
  let pool = [...initialPool];
  const results: CandidateElimination[] = [];

  for (let k = search.searchStart; k <= search.nLimit; k++) {
    let indices: number[] | null;
    while (pool.length >= k && (indices = findSubset(pool, k, search, search.enforceMinimality)) !== null) {
      const pickedIndices = new Set(indices);
      const picked = indices.map((index) => getUnit(pool, index));
      const union = picked.reduce((acc, item) => acc | search.maskOf(item), 0);

      pool = pool.filter((_, index) => !pickedIndices.has(index));

      const elimination = search.onSet(picked, union, k);
      if (!elimination) continue;
      if (search.first) return [elimination];
      results.push(elimination);
    }
  }

  return results;
}

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
 * Results pair each usable set's union mask with its removal targets: every
 * unsolved cell in the house that is not a member of the set. That is the whole
 * target set, not only cells that currently share a digit - the applier relies
 * on `removeCandidate` no-opping on clean cells. Members (candidates fully
 * inside the mask) and solved cells are never targets. Keeping the finder to
 * masks plus targets makes it as cheap as possible: it marks a union as soon as
 * it is actionable and leaves board creation to the caller.
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
export function findNakedSetsInHouse(board: Board, house: House, { size: n, first = false }: BasicConfig & { size?: number | undefined } = {}): CandidateElimination[] | null {
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

  // Every unsolved cell that is not a member of the set is a target. Cells
  // holding none of the digits are included too, mirroring the pointing and
  // claiming finders; `removeCandidate` leaves them unchanged.
  const collectTargets = (unionMask: number): number[] => {
    const targets: number[] = [];
    for (const index of house) {
      const cell = getUnit(board, index);
      if (!cell.value && (cell.candidates & ~unionMask) !== 0) targets.push(index);
    }
    return targets;
  };

  // Shared by the pair path and the larger-set path. Targets are every
  // unsolved cell outside the set, including cells already consumed or pruned
  // from the working pool, so a shared digit means the set can remove it.
  const hasElimination = (unionMask: number): boolean => canEliminateCandidates(board, collectTargets(unionMask), unionMask);

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

  const results: CandidateElimination[] = [];

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
    const elimination = { mask, remove: collectTargets(mask) };
    if (first) return [elimination];
    results.push(elimination);
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
  const maskOf = (mask: number): number => mask;
  const pruned = prunePool(usableMasks, maskOf, SEARCH_START);
  if (!pruned) return results.length > 0 ? results : null;
  usableMasks = pruned;

  // With no forced size this runs 3..nLimit; with a forced size it runs only n.
  results.push(
    ...collectSets(usableMasks, {
      first,
      searchStart: SEARCH_START,
      nLimit,
      enforceMinimality,
      maskOf,
      // Minimality: every digit must be held by at least two cells of the set.
      // A digit held by one cell would leave a naked (k-1)-set behind.
      isMinimal: (picked) => {
        let seen = 0;
        let seenTwice = 0;
        for (const mask of picked) {
          seenTwice |= seen & mask;
          seen |= mask;
        }
        return countSetBits(seenTwice) === picked.length;
      },
      onSet: (_picked, unionMask, size) => {
        assertNotOverfilled(unionMask, size);
        if (!hasElimination(unionMask)) return null;
        return { mask: unionMask, remove: collectTargets(unionMask) };
      },
    }),
  );

  return results.length > 0 ? results : null;
}

/**
 * Find hidden sets inside one house.
 *
 * A hidden set is `n` digits that can only occupy the same `n` unsolved cells
 * in a house. Those cells can then drop every candidate outside the set, so a
 * usable set removes the non-set candidates from its member cells. Results
 * pair that removal mask - every candidate outside the set - with the member
 * cells, matching `CandidateElimination` and `applyEliminations`. Clean members
 * are included because the applier no-ops on them.
 *
 * This is the digit-side dual of `findNakedSetsInHouse`. Instead of cells and
 * their candidate masks, the search works on each eligible digit's position
 * mask (the house-relative cells that can still hold it): a hidden set is `n`
 * position masks whose union spans exactly `n` cells.
 *
 * - Default (no `size`): search every size k up to `min(unsolved, 4)` and
 *   return every usable set found. Smaller sizes are consumed first, and once
 *   digits are used by a set they leave the pool, so overlapping alternatives
 *   are not enumerated - the result is a maximal collection of digit-disjoint
 *   minimal sets. The cap is the supported algorithm limit; larger sizes need
 *   a full proper-subset check. Pass `size` to force a size.
 * - `size: n`: return usable sets of size n only. Smaller sizes are not
 *   searched first. Pairs are pre-excluded from the pool; for n = 4 a set is
 *   additionally rejected unless every member cell stays covered after
 *   dropping any one digit, which rules out an enclosed triple.
 * - `first: true`: stop at the first usable set and return it.
 * - Returns `null` when no usable set matches the request.
 * - Throws `IllegalStateError` when more than `n` digits are confined to a
 *   found set's `n` cells (e.g. three digits sharing the same pair of cells).
 *
 * Generalization notes mirror `findNakedSetsInHouse`: only `size` 2..4 is
 * accepted, and a 16-cell house would need the guard raised to
 * `floor(house.length / 2)` plus a full proper-subset check for n >= 5 (a
 * 5-set can contain a hidden triple while every cell is still covered twice).
 */
export function findHiddenSetsInHouse(board: Board, house: House, { size: n, first = false }: BasicConfig & { size?: number | undefined } = {}): CandidateElimination[] | null {
  if (n !== undefined && (n < 2 || n > 4)) throw new RangeError(`findHiddenSets does not support n=${n.toString()}`);

  let unsolved = 0;
  for (const index of house) {
    if (!getUnit(board, index).value) unsolved++;
  }

  const nClamp = n ?? 2; // smallest size we are allowed to report: n, or 2 when no size was asked for
  if (unsolved < nClamp) return null;

  const nLimit: number = n ?? Math.min(unsolved, 4);

  // A digit's mask is the set of house-relative positions that can still hold
  // it. Digits already placed in the house are omitted by the generator.
  const digitMasks: { digit: number; mask: number }[] = [];
  for (const { digit, mask } of candidatesToDigitMasks(board, house)) {
    // No position means the house is already contradictory; it is not a set.
    if (mask === 0) continue;
    digitMasks.push({ digit, mask });
  }

  const membersOf = (unionMask: number): number[] => setBitIndices(unionMask).map((position) => getUnit(house, position));
  const outsideOf = (digitMask: number): number => FULL_DIGIT_MASK & ~digitMask;

  // Shared by the pair path and the larger-set path. A hidden set removes the
  // candidates outside its digit mask from every member cell.
  const hasElimination = (unionMask: number, removeMask: number): boolean => canEliminateCandidates(board, membersOf(unionMask), removeMask);

  // A k-digit hidden set can only live in k cells. If more than k digits are
  // confined to those cells, the house can never be filled and the board is
  // broken. We only run this on unions the search actually produced, so it
  // stays cheap.
  const assertNotOverfilled = (unionMask: number, size: number): void => {
    let enclosed = 0;
    for (const { mask } of digitMasks) if ((mask & ~unionMask) === 0) enclosed++;
    if (enclosed > size) throw new IllegalStateError(IllegalStateError.Code.ILLEGAL_HIDDEN_COUNT, enclosed);
  };

  // --- Collect candidates: digits confined to exactly two cells are counted by position mask, all other digits go straight into the pool ---
  let usableDigits: { digit: number; mask: number }[] = [];
  const pairDigits = new Map<number, number[]>();

  for (const entry of digitMasks) {
    const bits = countSetBits(entry.mask);
    // <2 means a hidden single, >nLimit cannot fit in a supported set.
    if (bits < 2 || bits > nLimit) continue;
    if (bits === 2) {
      const digits = pairDigits.get(entry.mask);
      if (digits) {
        digits.push(entry.digit);
      } else {
        pairDigits.set(entry.mask, [entry.digit]);
      }
      continue; // decided below: a pair-position digit joins the pool only if it appears exactly once
    }
    usableDigits.push(entry);
  }

  const results: CandidateElimination[] = [];

  for (const [mask, digits] of pairDigits) {
    // Two digits may only be confined to exactly two cells. This catches the
    // three-identical-pair-mask case and lone pair-position digits too.
    assertNotOverfilled(mask, 2);

    // Seen once: keep it as a normal candidate for sets of size 3 or more.
    if (digits.length === 1) {
      usableDigits.push({ digit: getUnit(digits, 0), mask });
      continue;
    }
    // Seen twice: this is a hidden pair. Keep both digits out of the pool so a
    // larger set can never absorb them, which keeps the results minimal.
    // Report it only when pairs were requested (no size given, or size 2).
    if (nClamp !== 2) continue;
    const digitMask = digits.reduce((acc, digit) => acc | indexToMask(digit), 0);
    const removeMask = outsideOf(digitMask);
    if (!hasElimination(mask, removeMask)) continue;
    const elimination = { mask: removeMask, remove: membersOf(mask) };
    if (first) return [elimination];
    results.push(elimination);
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
  // A digit occupying a cell no other digit can occupy cannot be part of a
  // minimal hidden set: dropping that digit would leave a smaller set behind.
  const maskOf = (entry: { readonly mask: number }): number => entry.mask;
  const pruned = prunePool(usableDigits, maskOf, SEARCH_START);
  if (!pruned) return results.length > 0 ? results : null;
  usableDigits = pruned;

  // With no forced size this runs 3..nLimit; with a forced size it runs only n.
  results.push(
    ...collectSets(usableDigits, {
      first,
      searchStart: SEARCH_START,
      nLimit,
      enforceMinimality,
      maskOf,
      // Minimality: every cell must stay covered after dropping any one digit,
      // so neither the set nor any (k-1)-subset has a smaller hidden set.
      isMinimal: (picked, union) => {
        let seen = 0;
        let seenTwice = 0;
        for (const entry of picked) {
          seenTwice |= seen & entry.mask;
          seen |= entry.mask;
        }
        return seenTwice === union;
      },
      onSet: (picked, unionMask, size) => {
        let digitMask = 0;
        for (const entry of picked) digitMask |= indexToMask(entry.digit);

        assertNotOverfilled(unionMask, size);

        const removeMask = outsideOf(digitMask);
        if (!hasElimination(unionMask, removeMask)) return null;
        return { mask: removeMask, remove: membersOf(unionMask) };
      },
    }),
  );

  return results.length > 0 ? results : null;
}
