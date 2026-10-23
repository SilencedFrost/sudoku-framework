import seedrandom from "seedrandom";
import type { Board, Cell, GeneratedBoard } from "../types/board.type.js";
import { PEERS } from "../constants/coordinates.js";

const CELL_COUNT = PEERS.length;
const DIGIT_COUNT = 9;
const MIN_HINTS = 17;
const MAX_HINTS = 81;
const SOLUTION_LIMIT = 2;
// Random digging practically never reaches the low teens/20s, so use seed puzzles there.
const DIG_MIN_HINTS = 25;
const DIG_ATTEMPTS = 10;

// Bit `digit - 1` represents `digit`, matching the solver's candidate masks.
const ALL_DIGITS = 0b111111111;
const ALL_INDICES: readonly number[] = PEERS.map((_peers, index) => index);

// Known 17-clue puzzles from Gordon Royle's collection. Used as starting points
// for low hint counts, then randomly transformed and padded with clues.
const SEED_PUZZLES: readonly string[] = [
  "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
  "000000012000035000000600070700000300000400800100000000000120000080000040050000600",
  "000000012003600000000007000410020000000500300700000600280000040000300500000000000",
  "000000012008030000000000040120500000000004700060000000507000300000620000000100000",
  "000000012400090000000000050070200000600000400000108000018000000000030700502000000",
  "000000014000000203800050000000207000031000000000000650600000700000140000000300000",
  "000000021000030070040080000100207000050000400000000003200100000000040500000600000",
  "000000021000083000000040000500200070080000400030900000000060800100500000200000000",
];

interface Choice {
  readonly index: number;
  readonly candidates: number;
}

interface GridTransform {
  readonly rowMap: readonly number[];
  readonly columnMap: readonly number[];
  readonly digitMap: readonly number[];
  readonly transposed: boolean;
}

const SOLVED: Choice = { index: -1, candidates: 0 };

const digitBit = (digit: number): number => 1 << (digit - 1);
const gridAt = (grid: Uint16Array, index: number): number => grid[index] ?? 0;

const candidatesAt = (grid: Uint16Array, index: number): number => {
  let candidates = ALL_DIGITS;
  for (const peer of PEERS[index] ?? []) {
    const digit = gridAt(grid, peer);
    if (digit !== 0) candidates &= ~digitBit(digit);
  }
  return candidates;
};

const place = (grid: Uint16Array, index: number, digit: number): void => {
  grid[index] = digit;
};

const clear = (grid: Uint16Array, index: number): void => {
  grid[index] = 0;
};

const popcount = (mask: number): number => {
  let remaining = mask;
  let count = 0;
  while (remaining !== 0) {
    remaining &= remaining - 1;
    count += 1;
  }
  return count;
};

const shuffleNumbers = (items: number[], random: () => number): number[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = items[i] ?? 0;
    items[i] = items[j] ?? 0;
    items[j] = swap;
  }
  return items;
};

const digitsOf = (mask: number): number[] => {
  const digits: number[] = [];
  for (let digit = 1; digit <= DIGIT_COUNT; digit += 1) {
    if ((mask & digitBit(digit)) !== 0) digits.push(digit);
  }
  return digits;
};

// Pick the empty cell with the fewest candidates, or null when it is already
// contradictory. SOLVED means the grid is complete.
const chooseCell = (grid: Uint16Array): Choice | null => {
  let choice = SOLVED;
  let fewestCandidates = DIGIT_COUNT + 1;

  for (const index of ALL_INDICES) {
    if (gridAt(grid, index) !== 0) continue;
    const candidates = candidatesAt(grid, index);
    const count = popcount(candidates);
    if (count === 0) return null;
    if (count < fewestCandidates) {
      fewestCandidates = count;
      choice = { index, candidates };
      if (count === 1) break;
    }
  }
  return choice;
};

// Fill every empty cell, branching on the most constrained cell first.
const fillSolution = (grid: Uint16Array, random: () => number): boolean => {
  const choice = chooseCell(grid);
  if (choice === null) return false;
  if (choice.index === -1) return true;

  for (const digit of shuffleNumbers(digitsOf(choice.candidates), random)) {
    place(grid, choice.index, digit);
    if (fillSolution(grid, random)) return true;
    clear(grid, choice.index);
  }
  return false;
};

// Count solutions up to `limit`, so uniqueness checks can stop at the second one.
const countSolutions = (grid: Uint16Array, limit: number): number => {
  const choice = chooseCell(grid);
  if (choice === null) return 0;
  if (choice.index === -1) return 1;

  let total = 0;
  for (const digit of digitsOf(choice.candidates)) {
    place(grid, choice.index, digit);
    total += countSolutions(grid, limit);
    clear(grid, choice.index);
    if (total >= limit) break;
  }
  return total;
};

// Leave the grid fully solved on success.
const solveOne = (grid: Uint16Array): boolean => {
  const choice = chooseCell(grid);
  if (choice === null) return false;
  if (choice.index === -1) return true;

  for (const digit of digitsOf(choice.candidates)) {
    place(grid, choice.index, digit);
    if (solveOne(grid)) return true;
    clear(grid, choice.index);
  }
  return false;
};

const parseGrid = (puzzle: string): Uint16Array => {
  const grid = new Uint16Array(CELL_COUNT);
  for (const index of ALL_INDICES) {
    grid[index] = Number(puzzle[index] ?? "0");
  }
  return grid;
};

const createTransform = (random: () => number): GridTransform => {
  const units = (): number[] => shuffleNumbers([0, 1, 2], random).flatMap((unit) => shuffleNumbers([0, 1, 2], random).map((offset) => unit * 3 + offset));

  return {
    rowMap: units(),
    columnMap: units(),
    digitMap: shuffleNumbers(
      Array.from({ length: DIGIT_COUNT }, (_, index) => index + 1),
      random,
    ),
    transposed: random() < 0.5,
  };
};

const applyTransform = (grid: Uint16Array, transform: GridTransform): Uint16Array => {
  const result = new Uint16Array(CELL_COUNT);
  for (let row = 0; row < DIGIT_COUNT; row += 1) {
    for (let column = 0; column < DIGIT_COUNT; column += 1) {
      const sourceRow = transform.rowMap[transform.transposed ? column : row] ?? 0;
      const sourceColumn = transform.columnMap[transform.transposed ? row : column] ?? 0;
      const digit = gridAt(grid, sourceRow * DIGIT_COUNT + sourceColumn);
      result[row * DIGIT_COUNT + column] = digit === 0 ? 0 : (transform.digitMap[digit - 1] ?? 0);
    }
  }
  return result;
};

const toBoard = (grid: Uint16Array): Board =>
  Array.from({ length: CELL_COUNT }, (_, index): Cell => {
    const value = gridAt(grid, index);
    return value === 0 ? { value: null, candidates: candidatesAt(grid, index) } : { value, candidates: 0 };
  });

const digBoard = (hints: number, random: () => number): GeneratedBoard | null => {
  for (let attempt = 0; attempt < DIG_ATTEMPTS; attempt += 1) {
    const grid = new Uint16Array(CELL_COUNT);
    if (!fillSolution(grid, random)) continue;

    // Snapshot the completed grid before digging, since digging empties cells.
    const solution = new Uint16Array(grid);
    const order = shuffleNumbers(ALL_INDICES.slice(), random);
    let clues = CELL_COUNT;

    for (const index of order) {
      if (clues <= hints) break;
      const digit = gridAt(grid, index);
      if (digit === 0) continue;

      clear(grid, index);
      if (countSolutions(grid, SOLUTION_LIMIT) === 1) {
        clues -= 1;
      } else {
        place(grid, index, digit);
      }
    }

    if (clues === hints) return { puzzle: toBoard(grid), solution: toBoard(solution) };
  }
  return null;
};

const seedBoard = (hints: number, random: () => number): GeneratedBoard => {
  const seed = SEED_PUZZLES[Math.floor(random() * SEED_PUZZLES.length)] ?? SEED_PUZZLES[0] ?? "";
  const puzzle = parseGrid(seed);
  const solution = new Uint16Array(puzzle);
  if (!solveOne(solution)) throw new Error("Invalid seed puzzle");

  const transform = createTransform(random);
  const grid = applyTransform(puzzle, transform);
  const solved = applyTransform(solution, transform);

  const emptyCells = shuffleNumbers(
    ALL_INDICES.filter((index) => gridAt(grid, index) === 0),
    random,
  );
  let clues = CELL_COUNT - emptyCells.length;

  for (const index of emptyCells) {
    if (clues >= hints) break;
    place(grid, index, gridAt(solved, index));
    clues += 1;
  }
  return { puzzle: toBoard(grid), solution: toBoard(solved) };
};

/**
 * Generates a random Sudoku puzzle with exactly `hints` clues and a unique solution.
 *
 * For larger clue counts a full solution is built and clues are removed in random
 * order while a solution counter confirms uniqueness. Very low clue counts cannot
 * realistically be reached that way, so a known 17-clue puzzle is randomly
 * transformed and padded with solution clues instead (also used as a fallback).
 *
 * Returns the puzzle together with its unique, fully filled solution. Empty puzzle
 * cells carry a candidate bitmask where bit `n - 1` stands for digit `n`; filled
 * puzzle cells and every solution cell have no candidates (`0`).
 *
 * Pass `seed` to make generation deterministic: the same hints and seed always
 * produce the same puzzle and solution. Omit it for a randomly seeded board.
 */
export function newBoard(hints: number, seed?: string): GeneratedBoard {
  if (!Number.isInteger(hints) || hints < MIN_HINTS || hints > MAX_HINTS) throw new RangeError(`Invalid hint count`);

  const random = seed === undefined ? seedrandom() : seedrandom(seed);
  if (hints >= DIG_MIN_HINTS) {
    const board = digBoard(hints, random);
    if (board !== null) return board;
  }
  return seedBoard(hints, random);
}
