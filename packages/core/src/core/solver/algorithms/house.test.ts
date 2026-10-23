import { describe, expect, it } from "vitest";
import { ROWS } from "../../../constants/coordinates.js";
import type { Board } from "../../../types/board.type.js";
import { getUnit } from "../../../utils/board.js";
import { indexToMask } from "../../../utils/bitwise.js";
import { findNakedSetsInHouse } from "./house.js";

const house = getUnit(ROWS, 0);

const popcount = (mask: number): number => {
  let count = 0;
  while (mask !== 0) {
    mask &= mask - 1;
    count++;
  }
  return count;
};

const bits = (...digits: number[]): number => digits.reduce((mask, digit) => mask | indexToMask(digit), 0);

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
    if (popcount(union) !== k) return false;
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
    while (popcount(mask) < size) mask |= indexToMask(1 + Math.floor(random() * 9));
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
    expect(result ?? []).not.toContain(bits(1, 2, 3, 4));
    for (const mask of result ?? []) expect(isMinimal(board, mask, 4)).toBe(true);
  });

  it("returns only minimal sets when size 4 is forced", () => {
    const { random, randomMask } = seededRandom(123456789);
    const violations: string[] = [];

    for (let trial = 0; trial < 2000; trial++) {
      const board = randomBoard(random, randomMask);
      let found: number[] | null;
      try {
        found = findNakedSetsInHouse(board, house, { size: 4 });
      } catch {
        continue; // overfilled house: not relevant to this check
      }
      for (const mask of found ?? []) {
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
      let found: number[] | null;
      try {
        found = findNakedSetsInHouse(board, house);
      } catch {
        continue;
      }
      for (const mask of found ?? []) {
        const size = popcount(mask);
        if (!isMinimal(board, mask, size)) violations.push(`trial=${trial.toString()} mask=${mask.toString(2)} size=${size.toString()}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
