export const ALGORITHM_SCORE = {
  // --- Beginner (1-10) ---
  FullHouse: 1,
  HiddenSingleBox: 3,
  HiddenSingleLine: 5, // covers both row and column
  NakedSingle: 8,

  // --- Easy (11-25) ---
  PointingPairs: 14, // also covers pointing triples
  Claiming: 17,
  NakedPair: 22,
  HiddenPair: 25,

  // --- Medium (26-45) ---
  NakedTriple: 28,
  XWing: 32,
  HiddenTriple: 35,
  Skyscraper: 38,
  TwoStringKite: 38,
  EmptyRectangle: 40,
  Swordfish: 42,

  // --- Hard (46-65) ---
  XYWing: 48,
  XYZWing: 51,
  WWing: 53,
  UniqueRectangle: 55, // Types 1-2 (basic uniqueness)
  SimpleColoring: 56,
  UniqueRectangleAdvanced: 58, // Types 3-6 / Hidden UR
  BugPlusOne: 58,
  FinnedXWing: 60,
  RemotePairs: 60,
  FinnedSwordfish: 63, // a.k.a. Sashimi variants

  // --- Expert (66-85) ---
  NakedQuad: 66,
  FinnedSwordfishComplex: 68,
  MultiColoring: 68,
  HiddenQuad: 70,
  Jellyfish: 70,
  WXYZWing: 72,
  XYChain: 72,
  Medusa3D: 76,
  AlternatingInferenceChain: 76,
  AlsXz: 78,
  SueDeCoq: 80,
  AlsXyWing: 82,
  AlignedPairExclusion: 83,
  DeathBlossom: 85,

  // --- Extreme (86-100) ---
  ForcingChains: 88,
  Nishio: 90,
  KrakenFish: 93, // a.k.a. Mutant Fish
  DynamicForcingChains: 95,
  NestedForcingChains: 98,
  BowmanBingo: 100,
} as const;
