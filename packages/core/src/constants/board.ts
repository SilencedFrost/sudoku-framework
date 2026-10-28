// Side length of a box. Candidate masks are 32-bit, so the largest supported
// value is 5 (HOUSE_SIZE + 1 = 26 bits). Change this to resize the board.
export const UNIT_SIZE = 3;
export const HOUSE_SIZE = UNIT_SIZE ** 2;
export const BOARD_SIZE = HOUSE_SIZE ** 2;

export const DIGITS = Array.from({ length: HOUSE_SIZE }, (_, i) => i + 1);

// Sum of every digit in a house, used by the full-house deduction.
export const HOUSE_DIGIT_SUM = (HOUSE_SIZE * (HOUSE_SIZE + 1)) / 2;

// Largest useful naked/hidden set: a larger set is the complement of a smaller
// one, so searching past the halfway point only repeats deductions.
export const MAX_SET_SIZE = Math.floor(HOUSE_SIZE / 2);
