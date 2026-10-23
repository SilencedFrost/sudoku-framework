export function indexToMask(digit: number): number {
  return 1 << digit;
}

export function lowestSetIndex(mask: number): number | null {
  if (mask === 0) return null;
  return 31 - Math.clz32(mask & -mask);
}

export function maskToIndex(mask: number): number | null {
  if (mask === 0 || (mask & (mask - 1)) !== 0) return null;
  return 31 - Math.clz32(mask);
}

export function isBitSet(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

export function fullMask(n: number): number {
  if (n < 0 || n > 32) throw new RangeError("n must be between 0 and 32");
  return n === 0 ? 0 : (-1 >>> (32 - n)) | 0; // NOSONAR: intentional uint32 -> int32 coercion
}

export function countSetBits(mask: number): number {
  let count = 0;
  while (mask !== 0) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

export function setBitIndices(mask: number): number[] {
  const indices: number[] = [];
  while (mask !== 0) {
    const low = mask & -mask;
    indices.push(31 - Math.clz32(low));
    mask ^= low;
  }
  return indices;
}

// Overloads: the return type is narrowed by the `output` argument,
// so callers get boolean[] or number[] without casting.
export function resolveCandidates(mask: number, output: "boolean"): boolean[];
export function resolveCandidates(mask: number, output: "number"): number[];
export function resolveCandidates(mask: number, output: "boolean" | "number"): boolean[] | number[] {
  const bools: boolean[] = [];
  const numbers: number[] = [];
  for (let i = 0; i < 9; i++) {
    const isSet = isBitSet(mask, i + 1);
    bools[i] = isSet;
    if (isSet) numbers.push(i + 1);
  }

  return output === "boolean" ? bools : numbers;
}
