import type { Board, Cell } from "../../../types/board.type.js";
import { indexToMask } from "../../../utils/bitwise.js";

export const solved: Cell = { value: 9, candidates: indexToMask(9) };

export const unsolved = (candidates: number): Cell => ({ value: null, candidates });

export const bits = (...digits: number[]): number => digits.reduce((mask, digit) => mask | indexToMask(digit), 0);

export const boardWith = (overrides: Record<number, Cell>): Board => {
  const board: Board = Array.from({ length: 81 }, () => solved);
  for (const [index, cell] of Object.entries(overrides)) board[Number(index)] = cell;
  return board;
};
