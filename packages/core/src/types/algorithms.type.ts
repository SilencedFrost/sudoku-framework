import type { ALGORITHM_SCORE } from "../constants/algorithms.js";

export type Algorithm = keyof typeof ALGORITHM_SCORE;

// Simple value assignment algs return the modification to prevent board instance creation, memory allocation and hand more control to caller
export interface SimpleModification {
  index: number;
  value: number;
}

export interface BasicConfig {
  first?: boolean;
}
