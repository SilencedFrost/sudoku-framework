import type { Board } from "../../types/board.type.js";
import type { Algorithm } from "../../types/algorithms.type.js";
import { sanitizeCandidates } from "../../utils/board.js";
import {
  solveClaimings,
  solveFullHouses,
  solveHiddenSets,
  solveHiddenSinglesBoxes,
  solveHiddenSinglesLines,
  solveNakedSets,
  solveNakedSingles,
  solvePointingPairs,
} from "./algorithms/board.js";

interface SolveStep {
  readonly alg: Algorithm;
  readonly solve: (board: Board) => Board | null;
}

// Ordered by difficulty after FullHouse, which runs before sanitizing.
const STEPS: readonly SolveStep[] = [
  { alg: "HiddenSingleBox", solve: (board) => solveHiddenSinglesBoxes(board, { first: false }) },
  { alg: "HiddenSingleLine", solve: (board) => solveHiddenSinglesLines(board, { first: false }) },
  { alg: "NakedSingle", solve: (board) => solveNakedSingles(board, { first: false }) },
  { alg: "PointingPairs", solve: (board) => solvePointingPairs(board, { first: true }) },
  { alg: "Claiming", solve: (board) => solveClaimings(board, { first: true }) },
  { alg: "NakedPair", solve: (board) => solveNakedSets(board, { size: 2, first: true }) },
  { alg: "HiddenPair", solve: (board) => solveHiddenSets(board, { size: 2, first: true }) },
  { alg: "NakedTriple", solve: (board) => solveNakedSets(board, { size: 3, first: true }) },
  { alg: "HiddenTriple", solve: (board) => solveHiddenSets(board, { size: 3, first: true }) },
];

// TODO: improve solveAll with bulk actions + stateful skipping (Owns the loop, selective calling, dirty house tracking)
export function solveAll(board: Board): Board {
  let solvingBoard = board;
  let solution = solveStep(solvingBoard, { candidates: "rebuild" });

  while (solution) {
    solvingBoard = solution.board;
    solution = solveStep(solvingBoard, { candidates: "trust" });
  }

  return solvingBoard;
}

export function solveStep(board: Board, { candidates = "sanitize" }: { candidates?: "trust" | "sanitize" | "rebuild" } = {}): { board: Board; alg: Algorithm } | null {
  // Rebuild regardless if explicitly set
  // The solvers create a shallow board copy, therefore solveStep does not need to repeat this work
  let newBoard = candidates === "rebuild" ? sanitizeCandidates(board, true) : board;

  const fullHouse = solveFullHouses(newBoard, { first: false });
  if (fullHouse) return { board: fullHouse, alg: "FullHouse" };

  // Sanitize obvious candidates if untrusted, ready for higher algs
  if (candidates !== "rebuild") newBoard = candidates === "trust" ? newBoard : sanitizeCandidates(newBoard);

  for (const { alg, solve } of STEPS) {
    const solved = solve(newBoard);
    if (solved) return { board: solved, alg };
  }

  // No solution
  return null;
}
