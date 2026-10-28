import { fullMask, indexToMask } from "../utils/bitwise.js";
import { HOUSE_SIZE, UNIT_SIZE } from "./board.js";

export const FULL_DIGIT_MASK = fullMask(HOUSE_SIZE + 1) & ~indexToMask(0);

// Box layout: UNIT_SIZE cells wide/tall, as bits within a HOUSE_SIZE-bit unit.
const ROW_BASE = (1 << UNIT_SIZE) - 1; // 0b111

const COL_BASE = Array.from({ length: UNIT_SIZE }, (_, i) => 1 << (i * UNIT_SIZE)).reduce((a, b) => a | b, 0); // 0b001001001

export const ROW_MASKS = Array.from({ length: UNIT_SIZE }, (_, i) => ROW_BASE << (i * UNIT_SIZE)); // [0b000000111, 0b000111000, 0b111000000]

export const COL_MASKS = Array.from({ length: UNIT_SIZE }, (_, i) => COL_BASE << i); // [0b001001001, 0b010010010, 0b100100100]

// Lines
/** @alias */
export const LINE_MASKS = ROW_MASKS;
