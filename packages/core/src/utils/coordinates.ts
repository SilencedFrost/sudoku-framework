import type { LINES } from "../constants/coordinates.js";
import { getUnit } from "./board.js";

export function isRow(line: (typeof LINES)[number]): boolean {
  return getUnit(line, 1) - getUnit(line, 0) === 1;
}
