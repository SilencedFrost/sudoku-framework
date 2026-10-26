import { describe, expect, it } from "vitest";
import { IllegalStateError } from "../../../classes/errors.js";
import { FULL_DIGIT_MASK } from "../../../constants/bitwise.js";
import { ROWS } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import { getUnit } from "../../../utils/board.js";
import { indexToMask, countSetBits, setBitIndices } from "../../../utils/bitwise.js";
import { applyEliminations } from "./common.js";
import { findHiddenSetsInHouse, findNakedSetsInHouse } from "./house.js";
import { bits } from "./test-utils.js";

const house = getUnit(ROWS, 0);

const outside = (...digits: number[]): number => FULL_DIGIT_MASK & ~bits(...digits);

const boardFromHouse = (masks: (number | null)[]): Board => {
  const board: Board = Array.from({ length: 81 }, () => ({ value: 9, candidates: indexToMask(9) }));
  masks.forEach((mask, offset) => {
    const index = getUnit(house, offset);
    board[index] = mask === null ? { value: 9, candidates: indexToMask(9) } : { value: null, candidates: mask };
  });
  return board;
};

// All unsolved house cells whose candidates fit inside the result mask.
const members = (board: Board, mask: number): number[] => {
  const out: number[] = [];
  for (const index of house) {
    const cell = getUnit(board, index);
    if (!cell.value && (cell.candidates & ~mask) === 0) out.push(index);
  }
  return out;
};

// A set is minimal when no proper subset is itself a naked set, i.e. every
// (k-1)-subset still spans exactly k digits.
const isMinimal = (board: Board, mask: number, k: number): boolean => {
  const cells = members(board, mask);
  if (cells.length !== k) return false;
  for (let omit = 0; omit < cells.length; omit++) {
    let union = 0;
    cells.forEach((index, position) => {
      if (position !== omit) union |= getUnit(board, index).candidates;
    });
    if (countSetBits(union) !== k) return false;
  }
  return true;
};

// House-relative position mask of every unsolved cell that can still hold `digit`.
const positionsOf = (board: Board, digit: number): number => {
  const digitMask = indexToMask(digit);
  let positions = 0;
  house.forEach((index, offset) => {
    const cell = getUnit(board, index);
    if (!cell.value && (cell.candidates & digitMask) !== 0) positions |= 1 << offset;
  });
  return positions;
};

// A hidden set is minimal when no proper non-empty digit subset is itself hidden.
const isMinimalHidden = (board: Board, mask: number): boolean => {
  const digits = setBitIndices(mask);
  for (let subset = 1; subset < (1 << digits.length) - 1; subset++) {
    let union = 0;
    let size = 0;
    digits.forEach((digit, position) => {
      if ((subset & (1 << position)) === 0) return;
      size++;
      union |= positionsOf(board, digit);
    });
    if (countSetBits(union) === size) return false;
  }
  return true;
};

const seededRandom = (initialSeed: number) => {
  let seed = initialSeed;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const randomMask = (): number => {
    const size = 2 + Math.floor(random() * 3); // 2..4 candidates
    let mask = 0;
    while (countSetBits(mask) < size) mask |= indexToMask(1 + Math.floor(random() * 9));
    return mask;
  };
  return { random, randomMask };
};

const randomBoard = (random: () => number, randomMask: () => number): Board => {
  const unsolved = 4 + Math.floor(random() * 6); // 4..9 unsolved cells
  const masks = Array.from({ length: 9 }, (_, i): number | null => (i < unsolved ? randomMask() : null));
  return boardFromHouse(masks);
};

describe("findNakedSetsInHouse", () => {
  it("does not report a size-4 set that contains a size-3 set", () => {
    // A = {1,2,4} is the only non-bivalue, so it is pool index 0.
    // B,C,D = {1,2},{1,3},{2,3} form the triple {1,2,3}.
    // The quad A,B,C,D spans {1,2,3,4} and its depth-3 prefix A,B,C also spans
    // four digits, so the prefix guard alone cannot reject it.
    const board = boardFromHouse([bits(1, 2, 4), bits(1, 2), bits(1, 3), bits(2, 3), bits(4, 5), bits(1, 5), null, null, null]);

    const result = findNakedSetsInHouse(board, house, { size: 4 });
    expect((result ?? []).map(({ mask }) => mask)).not.toContain(bits(1, 2, 3, 4));
    for (const { mask } of result ?? []) expect(isMinimal(board, mask, 4)).toBe(true);
  });

  it("returns only minimal sets when size 4 is forced", () => {
    const { random, randomMask } = seededRandom(123456789);
    const violations: string[] = [];

    for (let trial = 0; trial < 2000; trial++) {
      const board = randomBoard(random, randomMask);
      let found: ReturnType<typeof findNakedSetsInHouse>;
      try {
        found = findNakedSetsInHouse(board, house, { size: 4 });
      } catch {
        continue; // overfilled house: not relevant to this check
      }
      for (const { mask } of found ?? []) {
        if (!isMinimal(board, mask, 4)) violations.push(`trial=${trial.toString()} mask=${mask.toString(2)}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("returns only minimal sets when no size is forced", () => {
    const { random, randomMask } = seededRandom(987654321);
    const violations: string[] = [];

    for (let trial = 0; trial < 2000; trial++) {
      const board = randomBoard(random, randomMask);
      let found: ReturnType<typeof findNakedSetsInHouse>;
      try {
        found = findNakedSetsInHouse(board, house);
      } catch {
        continue;
      }
      for (const { mask } of found ?? []) {
        const size = countSetBits(mask);
        if (!isMinimal(board, mask, size)) violations.push(`trial=${trial.toString()} mask=${mask.toString(2)} size=${size.toString()}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("reports every non-member unsolved cell as a removal target", () => {
    // Pair {1,2} in cells 0-1. Cell 2 shares 1, cell 3 shares nothing but is
    // still a target, mirroring the pointing/claiming target lists.
    const board = boardFromHouse([bits(1, 2), bits(1, 2), bits(1, 3), bits(3, 4), null, null, null, null, null]);

    const result = findNakedSetsInHouse(board, house, { size: 2 });

    expect(result).toEqual([{ mask: bits(1, 2), remove: [getUnit(house, 2), getUnit(house, 3)] }]);
  });

  it("skips a set that eliminates nothing", () => {
    const board = boardFromHouse([bits(1, 2), bits(1, 2), bits(3, 4), bits(4, 5), null, null, null, null, null]);

    expect(findNakedSetsInHouse(board, house, { size: 2 })).toBeNull();
  });
});

describe("findHiddenSetsInHouse", () => {
  it("reports a hidden pair and its member cells", () => {
    // 1 and 2 only appear in cells 0-1, so those cells cannot hold 3 or 4.
    const board = boardFromHouse([bits(1, 2, 3), bits(1, 2, 4), bits(3, 4, 5), bits(3, 4, 5), null, null, null, null, null]);

    expect(findHiddenSetsInHouse(board, house, { size: 2 })).toEqual([{ mask: outside(1, 2), remove: [getUnit(house, 0), getUnit(house, 1)] }]);
  });

  it("returns a removal mask that applyEliminations can use directly", () => {
    const board = boardFromHouse([bits(1, 2, 3), bits(1, 2, 4), bits(3, 4, 5), bits(3, 4, 5), null, null, null, null, null]);
    const applied = applyEliminations(board, findHiddenSetsInHouse(board, house, { size: 2 }));

    expect(applied).not.toBeNull();
    expect(getUnit(applied ?? board, getUnit(house, 0)).candidates).toBe(bits(1, 2));
    expect(getUnit(applied ?? board, getUnit(house, 1)).candidates).toBe(bits(1, 2));
    // Non-members are untouched.
    expect(getUnit(applied ?? board, getUnit(house, 2)).candidates).toBe(bits(3, 4, 5));
  });

  it("reports a hidden triple whose digits use different position masks", () => {
    // 1 -> {0,1}, 2 -> {1,2}, 3 -> {0,2}; together they use only cells 0-2.
    const board = boardFromHouse([
      bits(1, 3, 4),
      bits(1, 2, 5),
      bits(2, 3, 6),
      bits(4, 5, 6),
      bits(4, 5),
      bits(4, 6),
      null,
      null,
      null,
    ]);

    expect(findHiddenSetsInHouse(board, house, { size: 3, first: true })).toEqual([
      { mask: outside(1, 2, 3), remove: [getUnit(house, 0), getUnit(house, 1), getUnit(house, 2)] },
    ]);
  });

  it("reports a hidden quad when every member cell stays covered", () => {
    // 1 -> {0,1}, 2 -> {0,2}, 3 -> {1,3}, 4 -> {2,3}: each cell is covered twice.
    const board = boardFromHouse([bits(1, 2, 5), bits(1, 3), bits(2, 4), bits(3, 4), bits(5), null, null, null, null]);

    expect(findHiddenSetsInHouse(board, house, { size: 4 })).toEqual([
      { mask: outside(1, 2, 3, 4), remove: [getUnit(house, 0), getUnit(house, 1), getUnit(house, 2), getUnit(house, 3)] },
    ]);
  });

  it("does not report a size-4 set that contains a size-3 set", () => {
    // 1,2,3 form a hidden triple in cells 0-2; 4 adds cell 3, but cell 3 is
    // covered only by 4, so dropping 4 leaves the triple behind.
    const board = boardFromHouse([bits(1, 2), bits(1, 3), bits(2, 3, 4), bits(4, 5), bits(5), null, null, null, null]);

    expect(findHiddenSetsInHouse(board, house, { size: 4 })).toBeNull();
  });

  it("skips a set that eliminates nothing", () => {
    // Both pairs already sit in cells whose candidates are exactly the set.
    const board = boardFromHouse([bits(1, 2), bits(1, 2), bits(3, 4), bits(3, 4), null, null, null, null, null]);

    expect(findHiddenSetsInHouse(board, house, { size: 2 })).toBeNull();
  });

  it("throws when three digits share the same pair of cells", () => {
    const board = boardFromHouse([bits(1, 2, 3), bits(1, 2, 3), null, null, null, null, null, null, null]);

    expect(() => findHiddenSetsInHouse(board, house, { size: 2 })).toThrow(IllegalStateError);
  });

  it("returns only minimal sets", () => {
    const { random, randomMask } = seededRandom(246813579);
    const violations: string[] = [];
    let foundCount = 0;

    for (let trial = 0; trial < 2000; trial++) {
      const board = randomBoard(random, randomMask);
      let found: ReturnType<typeof findHiddenSetsInHouse>;
      try {
        found = findHiddenSetsInHouse(board, house);
      } catch {
        continue; // overfilled house: not relevant to this check
      }
      foundCount += found?.length ?? 0;
      for (const { mask, remove } of found ?? []) {
        const digitMask = FULL_DIGIT_MASK & ~mask;
        const digits = setBitIndices(digitMask);
        const union = digits.reduce((acc, digit) => acc | positionsOf(board, digit), 0);
        const expectedRemove = setBitIndices(union).map((position) => getUnit(house, position));
        const removeMatches = remove.length === expectedRemove.length && remove.every((index, position) => index === expectedRemove[position]);
        if (countSetBits(union) !== digits.length || !removeMatches || !isMinimalHidden(board, digitMask)) {
          violations.push(`trial=${trial.toString()} mask=${mask.toString(2)}`);
        }
      }
    }

    expect(foundCount).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
