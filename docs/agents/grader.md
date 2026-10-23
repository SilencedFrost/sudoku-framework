# Grader (planned)

Load when designing or implementing difficulty rating. The grader will rate a puzzle by replaying deductions, not by re-scanning candidates on its own.

## Contracts to preserve

- Drive `solveStep` in a loop: once with `{ candidates: "rebuild" }`, then with `{ candidates: "trust" }`. This mirrors `solveAll` but preserves the per-step `alg`. Do **not** grade with `solveAll`, which discards the algorithm key.
- Aggregate `ALGORITHM_SCORE[alg]` and keep the step sequence for hints/explanations. Whether difficulty is a sum, max, or step count is a grader policy decision; `alg` is already the exact `Algorithm` key.
- Call the exported unit finders (`findNakedSetsInHouse`, `findPointingPairsInBox`, `findNakedSingle`, …) when the grader needs to detect or explain a pattern without applying it. Export a board-level wrapper if a board-scoped entry point is needed; do not duplicate the unit loops.
- `solveStep` may report several placements or eliminations under one `alg` (full houses, hidden singles, naked singles, and pointing pairs are batched). Score the step, not the number of cells changed, or decide explicitly how to weight bulk steps.
- Use `GeneratedBoard.solution` from `newBoard` to validate generated puzzles. Generated puzzle candidates are untrusted; rebuild before grading.
- Intended home: `core/grader.ts` (not created yet). Re-export it from `src/index.ts` only if it becomes public API.
