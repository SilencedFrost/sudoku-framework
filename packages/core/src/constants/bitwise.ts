import { fullMask, indexToMask } from "../utils/bitwise.js";

export const FULL_CANDIDATE_MASK = fullMask(10) & ~indexToMask(0); // All 9 candidates are true, bit 0 is set to 0

export const ROW_MASKS = [0b000000111, 0b000111000, 0b111000000];
export const COL_MASKS = [0b001001001, 0b010010010, 0b100100100];
