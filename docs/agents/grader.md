# Grader (not implemented)

Load when designing or implementing difficulty rating. No `core/grader.ts` exists yet.

## Contracts to preserve

- Drive `solveStep` in a loop: once with `{ candidates: "rebuild" }`, then with `{ candidates: "trust" }`. This mirrors `solveAll` but preserves the per-step `alg`. Do **not** grade with `solveAll`, which discards the algorithm key.
- Aggregate `ALGORITHM_SCORE[alg]` and keep the step sequence for hints/explanations. Whether difficulty is a sum, max, or step count is a grader policy decision; `alg` is already the exact `Algorithm` key.
- Call the exported unit finders (`findNakedSetsInHouse`, `findPointingPairsInBox`, `findNakedSingle`, …) when the grader needs to detect or explain a pattern without applying it. Do not duplicate the unit loops.
- `solveStep` may report several placements under one `alg` (full houses, hidden singles, naked singles are batched). Pointing pairs, claiming, and sets run with `first: true`, so they report one deduction per step. Score the step, or decide explicitly how to weight bulk placements.
- Use `GeneratedBoard.solution` from `newBoard` to validate generated puzzles. Generated puzzle candidates are untrusted; rebuild before grading.
- Re-export the grader from `src/index.ts` only if it becomes public API.
