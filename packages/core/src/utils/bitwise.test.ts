import { describe, expect, it } from "vitest";

import { fullMask, indexToMask, isBitSet, maskToIndex, resolveCandidates } from "./bitwise.js";

// Digits 1..9 live in bits 1..9; bit 0 is reserved for the "no digit" placeholder.
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const ALL_CANDIDATE_BITS = 0b1111111110;

describe("indexToMask", () => {
  it.each([
    { digit: 0, mask: 0b1 },
    { digit: 1, mask: 0b10 },
    { digit: 2, mask: 0b100 },
    { digit: 3, mask: 0b1000 },
    { digit: 4, mask: 0b10000 },
    { digit: 5, mask: 0b100000 },
    { digit: 6, mask: 0b1000000 },
    { digit: 7, mask: 0b10000000 },
    { digit: 8, mask: 0b100000000 },
    { digit: 9, mask: 0b1000000000 },
  ])("maps digit $digit to a mask with only bit $digit set", ({ digit, mask }) => {
    expect(indexToMask(digit)).toBe(mask);
  });

  it("maps digits 1..9 to the nine candidate bits without overlap", () => {
    const combined = DIGITS.reduce((acc, digit) => acc | indexToMask(digit), 0);
    expect(combined).toBe(ALL_CANDIDATE_BITS);
  });
});

describe("maskToIndex", () => {
  it.each([0, ...DIGITS])("round-trips digit %i", (digit) => {
    expect(maskToIndex(indexToMask(digit))).toBe(digit);
  });

  it("returns null for an empty mask", () => {
    expect(maskToIndex(0)).toBeNull();
  });

  it.each([
    { mask: 0b11, label: "two adjacent bits" },
    { mask: 0b100000001, label: "bits 1 and 9" },
    { mask: 0b111111111, label: "all nine bits" },
    { mask: 0b101010101, label: "every other bit" },
  ])("returns null for a mask with $label", ({ mask }) => {
    expect(maskToIndex(mask)).toBeNull();
  });

  it("returns the bit index for single-bit masks outside the digit range", () => {
    expect(maskToIndex(1 << 10)).toBe(10);
    expect(maskToIndex(1 << 31)).toBe(31);
  });
});

describe("isBitSet", () => {
  it.each(DIGITS)("reports true for the bit set by digit %i", (digit) => {
    expect(isBitSet(indexToMask(digit), digit)).toBe(true);
  });

  it.each(DIGITS)("reports false for a digit other than %i", (digit) => {
    const other = digit === 1 ? 2 : 1;
    expect(isBitSet(indexToMask(digit), other)).toBe(false);
  });

  it("probes the reserved bit 0", () => {
    expect(isBitSet(indexToMask(0), 0)).toBe(true);
    expect(isBitSet(indexToMask(1), 0)).toBe(false);
  });

  it("reports false for indexes above the highest set bit", () => {
    expect(isBitSet(indexToMask(9), 10)).toBe(false);
    expect(isBitSet(0b1, 31)).toBe(false);
  });

  it("reports true for every bit covered by a full mask", () => {
    const mask = fullMask(3);
    expect(isBitSet(mask, 0)).toBe(true);
    expect(isBitSet(mask, 1)).toBe(true);
    expect(isBitSet(mask, 2)).toBe(true);
    expect(isBitSet(mask, 3)).toBe(false);
  });
});

describe("fullMask", () => {
  it.each([
    { n: 0, mask: 0b0 },
    { n: 1, mask: 0b1 },
    { n: 9, mask: 0b111111111 },
    { n: 10, mask: 0b1111111111 },
    { n: 31, mask: 0x7fffffff },
    { n: 32, mask: -1 },
  ])("sets the lowest $n bits", ({ n, mask }) => {
    expect(fullMask(n)).toBe(mask);
  });

  it("throws for a negative size", () => {
    expect(() => fullMask(-1)).toThrow(RangeError);
  });

  it("throws for a size wider than 32 bits", () => {
    expect(() => fullMask(33)).toThrow(RangeError);
  });

  it("masks out the reserved bit 0 to leave the nine candidate bits", () => {
    expect(fullMask(10) & ~indexToMask(0)).toBe(ALL_CANDIDATE_BITS);
  });
});

describe("resolveCandidates", () => {
  describe('with output "boolean"', () => {
    it("returns all false for an empty mask", () => {
      expect(resolveCandidates(0, "boolean")).toEqual(Array<boolean>(9).fill(false));
    });

    it("returns all true for the mask with all nine candidate bits set", () => {
      expect(resolveCandidates(ALL_CANDIDATE_BITS, "boolean")).toEqual(Array<boolean>(9).fill(true));
    });

    it.each(DIGITS)("flags only the position of digit %i", (digit) => {
      const flags = resolveCandidates(indexToMask(digit), "boolean");
      expect(flags.filter((isSet) => isSet)).toHaveLength(1);
      expect(flags[digit - 1]).toBe(true);
    });

    it("ignores bits outside the nine candidate positions", () => {
      expect(resolveCandidates(0b1 | (1 << 10), "boolean")).toEqual(Array<boolean>(9).fill(false));
      expect(resolveCandidates(indexToMask(9) | 0b1 | (1 << 10), "boolean")).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ]);
    });
  });

  describe('with output "number"', () => {
    it("returns an empty array for an empty mask", () => {
      expect(resolveCandidates(0, "number")).toEqual([]);
    });

    it.each(DIGITS)("returns only digit %i", (digit) => {
      expect(resolveCandidates(indexToMask(digit), "number")).toEqual([digit]);
    });

    it("returns every digit in ascending order for the mask with all nine candidate bits set", () => {
      expect(resolveCandidates(ALL_CANDIDATE_BITS, "number")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("returns digits in ascending order regardless of bit layout", () => {
      expect(resolveCandidates(0b1010101010, "number")).toEqual([1, 3, 5, 7, 9]);
      expect(resolveCandidates(0b0101010100, "number")).toEqual([2, 4, 6, 8]);
    });

    it("ignores bits outside the nine candidate positions", () => {
      expect(resolveCandidates(0b1 | (1 << 10), "number")).toEqual([]);
      expect(resolveCandidates(indexToMask(9) | 0b1 | (1 << 10), "number")).toEqual([9]);
    });
  });

  it("keeps boolean and number outputs consistent for every mask", () => {
    // Bits 0..10 cover the reserved bit 0, the nine candidate bits and one bit above them.
    for (let mask = 0; mask <= 0b11111111111; mask++) {
      const flags = resolveCandidates(mask, "boolean");
      const digits = resolveCandidates(mask, "number");
      expect(digits).toEqual(DIGITS.filter((digit) => flags[digit - 1]));
    }
  });
});
