# Tooling and repository layout

Load when changing build config, workspace packages, dependencies, or navigating the repo.

## Layout

```
packages/core/src/
  index.ts                  # public API surface (re-exports only)
  core/
    solver/
      solver.ts             # solveStep(), solveAll()
      algorithms/           # algorithm implementations, split by search unit
        algorithms.ts       # board-wide pairs: claiming, hidden pair
        board.ts            # board-level wrappers/appliers
        box.ts              # box-scoped finder: pointing pairs/triples
        cell.ts             # cell-scoped finder: naked single
        common.ts           # applySimpleModifications + canEliminateCandidates
        house.ts            # house-scoped finders: full house, hidden single, naked sets
        common.test.ts      # batch/dedup applier tests
        house.test.ts       # naked-set finder tests
    generator.ts            # newBoard(hints, seed?): generated boards with known solutions
  constants/
    coordinates.ts          # BOARD + ROWS, COLUMNS, BOXES, LINES, HOUSES, PEERS, *_OF
    bitwise.ts              # FULL_DIGIT_MASK, ROW_MASKS, COL_MASKS, LINE_MASKS
    board.ts                # UNIT_SIZE, HOUSE_SIZE
    algorithms.ts           # ALGORITHM_SCORE registry + difficulty ordering
  types/
    board.type.ts           # Cell, Board, GeneratedBoard
    algorithms.type.ts      # Algorithm, SimpleModification, BasicConfig
    common.type.ts          # Tuple
  classes/errors.ts         # IllegalStateError + error-code registry
  utils/
    bitwise.ts              # mask <-> bit-index helpers, countSetBits, setBitIndices, resolveCandidates
    board.ts                # getUnit, sanitizeCandidates, removeCandidate, candidatesToDigitMasks
    bitwise.test.ts
```

`packages/*/dist` is build output and gitignored. `packages/cli` and `packages/web` are empty placeholders.

## Build and config gotchas

- `packages/core/tsconfig.json` is `noEmit`; `tsconfig.build.json` enables emit to `dist` and excludes tests.
- Root `tsconfig.json` only covers `eslint.config.ts`; `pnpm typecheck` recurses per package.
- `knip.ts` only configures `packages/core`; new packages may need their own Knip workspace entries.
- The public API is only what `packages/core/src/index.ts` exports. Reflect public API changes there.
- `@sudoku/core` ships unbundled per-module `tsc` output on purpose (tree-shaking, chunk splitting). Bundling/minify/inlining experiments and their measurements live in [`performance.md`](performance.md).
