# Testing

Load when adding or updating tests.

## Conventions

- Vitest tests are colocated as `src/**/*.test.ts` and excluded from the build. Shared test builders (`bits`, `boardWith`, `solved`, `unsolved`) live in `algorithms/test-utils.ts`, which is also excluded from the build.
- Prefer table-driven `it.each` with explicit expected values (see `utils/bitwise.test.ts`).
- Test finder and applier separately:
  - Finders: `null` on absent patterns and concrete masks/indices.
  - Appliers: board immutability, elimination/placement effects, and `IllegalStateError` on contradictory input.
- Add tests for any new bitwise helper, solver algorithm, or generator change.
- Verify solver results against `newBoard(...).solution`, and pass a seed (`newBoard(hints, "seed")`) so failures reproduce.
- Cover `applySimpleModifications` when changing placement/batch behavior: duplicate indices, conflicting digits (first wins), and peer-removal composition.
- Mirror the source scope: `algorithms/house.test.ts` for house finders, `algorithms/box.test.ts` for the box finder, `algorithms/cell.test.ts` for the cell finder, `algorithms/board.test.ts` for board wrappers/appliers, and `solver.test.ts` for ordering and `alg` keys.

## Current coverage

- `utils/bitwise.test.ts`
- `algorithms/common.test.ts` (batch applier/dedup/immutability, Hall unions)
- `algorithms/house.test.ts` (naked- and hidden-set minimality, including randomized cases)
- `algorithms/box.test.ts` (pointing pairs/triples)
- `algorithms/line.test.ts` (claiming, row and column directions)
- `algorithms/board.test.ts` (naked- and hidden-set board wrappers/appliers)

Gaps: `canEliminateCandidates` is untested, and there is no `cell.test.ts`, `solver.test.ts`, or generator test yet. Add those when touching the corresponding code.

## Commands

`pnpm test`, `pnpm typecheck`, and `pnpm lint` from the repo root before finishing. Per package: `pnpm --filter @sudoku/core test`.
