import { fullMask, indexToMask } from "../utils/bitwise.js";

export const FULL_DIGIT_MASK = fullMask(10) & ~indexToMask(0); // All 9 digits 1-9 are true, bit 0 is set to false

// Boxes
export const ROW_MASKS = [0b000000111, 0b000111000, 0b111000000];
export const COL_MASKS = [0b001001001, 0b010010010, 0b100100100];

// Lines
export const LINE_MASKS = ROW_MASKS;
