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

  const hiddenSingleBox = solveHiddenSinglesBoxes(newBoard, { first: false });
  if (hiddenSingleBox) return { board: hiddenSingleBox, alg: "HiddenSingleBox" };

  const hiddenSingleLine = solveHiddenSinglesLines(newBoard, { first: false });
  if (hiddenSingleLine) return { board: hiddenSingleLine, alg: "HiddenSingleLine" };

  const nakedSingle = solveNakedSingles(newBoard, { first: false });
  if (nakedSingle) return { board: nakedSingle, alg: "NakedSingle" };

  const pointingPairs = solvePointingPairs(newBoard, { first: true });
  if (pointingPairs) return { board: pointingPairs, alg: "PointingPairs" };

  const claiming = solveClaimings(newBoard, { first: true });
  if (claiming) return { board: claiming, alg: "Claiming" };

  const nakedPair = solveNakedSets(newBoard, { size: 2, first: true });
  if (nakedPair) return { board: nakedPair, alg: "NakedPair" };

  const hiddenPair = solveHiddenSets(newBoard, { size: 2, first: true });
  if (hiddenPair) return { board: hiddenPair, alg: "HiddenPair" };

  const nakedTriple = solveNakedSets(newBoard, { size: 3, first: true });
  if (nakedTriple) return { board: nakedTriple, alg: "NakedTriple" };

  const hiddenTriple = solveHiddenSets(newBoard, { size: 3, first: true });
  if (hiddenTriple) return { board: hiddenTriple, alg: "HiddenTriple" };

  // No solution
  return null;
}
