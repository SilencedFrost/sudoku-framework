import { COL_MASKS, ROW_MASKS } from "../../../constants/bitwise.js";
import { COLUMN_OUTSIDE_BOX_OF, ROW_OUTSIDE_BOX_OF, type BOXES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { findConfinedEliminations, type ConfinementDirection } from "./common.js";

type Box = (typeof BOXES)[number];

const POINTING_DIRECTIONS: readonly ConfinementDirection[] = [
  { alignments: ROW_MASKS, outside: ROW_OUTSIDE_BOX_OF },
  { alignments: COL_MASKS, outside: COLUMN_OUTSIDE_BOX_OF },
];

export function findPointingPairsInBox(board: Board, box: Box, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  return findConfinedEliminations(board, box, POINTING_DIRECTIONS, { first, minPositions: 2 });
}
