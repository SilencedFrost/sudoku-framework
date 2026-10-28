# Generator

Load when changing `core/generator.ts`, generated-board shape, or uniqueness behavior.

## `newBoard(hints, seed?)`

- Returns `GeneratedBoard` (`{ puzzle, solution }`). `hints` must be an integer in **17..81**, otherwise `RangeError`. Passing `seed` makes the result deterministic.
- At 25 or more hints: build a full solution, dig clues in random order while a solution counter preserves uniqueness; fall back to the seed-puzzle path if digging fails after 10 attempts.
- Below 25 hints: randomly transform known 17-clue seed puzzles and pad them with solution clues.

## Candidate convention (important)

- Internal grids are `Uint16Array` and use a **local** bit convention: `1 << (digit - 1)`, with `0` meaning empty.
- `toBoard` copies those masks into `Cell.candidates` for unsolved puzzle cells instead of converting them. Filled puzzle cells and every solution cell get `candidates: 0`.
- Generated candidate masks are therefore **untrusted for the solver**. Call `sanitizeCandidates(board, true)` or run `solveStep`/`solveAll` with `"rebuild"` before treating a generated puzzle as a solver board.
- Use `GeneratedBoard.solution` to validate generated puzzles and solver results. Pass a seed in tests so failures reproduce.
- This file is the remaining 9x9-specific area: it hardcodes the digit count, hint bounds, and seed transforms, so it does not follow `UNIT_SIZE`. Generalizing the board elsewhere does not change `newBoard`.
