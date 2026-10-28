import { LINE_MASKS } from "../../../constants/bitwise.js";
import { BOX_OUTSIDE_COLUMN_OF, BOX_OUTSIDE_ROW_OF, type LINES } from "../../../constants/coordinates.js";
import type { BasicConfig, CandidateElimination } from "../../../types/algorithms.type.js";
import type { Board } from "../../../types/board.type.js";
import { isRow } from "../../../utils/coordinates.js";
import { findConfinedEliminations, type ConfinementDirection } from "./common.js";

type Line = (typeof LINES)[number];

const ROW_CLAIMING: readonly ConfinementDirection[] = [{ alignments: LINE_MASKS, outside: BOX_OUTSIDE_ROW_OF }];
const COLUMN_CLAIMING: readonly ConfinementDirection[] = [{ alignments: LINE_MASKS, outside: BOX_OUTSIDE_COLUMN_OF }];

export function findClaimingsInLine(board: Board, line: Line, { first = true }: BasicConfig = {}): CandidateElimination[] | null {
  return findConfinedEliminations(board, line, isRow(line) ? ROW_CLAIMING : COLUMN_CLAIMING, { first });
}
