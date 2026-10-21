# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

`sudoku-framework` is a pnpm monorepo for a Sudoku engine, intended to be consumed by a CLI and a web UI.
Only `@sudoku/core` is implemented today; `packages/cli` and `packages/web` are empty placeholders.

- **Runtime/tooling**: Node >= 22.13, pnpm >= 11 (`packageManager: pnpm@11.15.1`), ESM (`"type": "module"`).
- **Language**: TypeScript (ES2025, `NodeNext`), strict settings, no bundler.
- **Tests**: Vitest.
- **Lint/typecheck**: ESLint 10 + typescript-eslint (`strictTypeChecked`, `stylisticTypeChecked`), `tsc --noEmit`.
- **Unused-code check**: Knip.
- No README exists; this file is the primary orientation doc.

## Commands

Run from the repository root:

```bash
pnpm install          # install workspace deps
pnpm test             # vitest run in every package
pnpm typecheck        # tool configs + every package
pnpm lint             # eslint .
pnpm lint:fix         # eslint . --fix
pnpm build            # tsc build in every package
pnpm knip             # unused files/exports/deps
pnpm clean            # remove build output
```

Per-package (e.g. `packages/core`): `pnpm --filter @sudoku/core test`, `... typecheck`, `... build`.

## Repository layout

```
packages/core/src/
  index.ts                  # public API surface (only re-exports)
  core/
    solver.ts               # solveStep() + algorithm find/solve function pairs
    generator.ts            # newBoard(): generated support code for testing the solver
    common.ts               # board/candidate helpers, accessors
  constants/
    cordinates.ts           # precomputed units: ROWS, COLUMNS, BOXES, LINES, HOUSES, PEERS, *_OF
    bitwise.ts              # candidate masks for rows/cols, FULL_CANDIDATE_MASK
    algorithms.ts           # ALGORITHM_SCORE registry + difficulty ordering
  types/                    # board, solver, and utility types
  classes/errors.ts         # IllegalStateError
  utils/bitwise.ts          # mask <-> bit-index helpers (tested in bitwise.test.ts)
```

`packages/*/dist` is build output and is gitignored.

## Domain model and invariants

- A `Board` is `Cell[]` of exactly **81** cells. `Cell = { value: number | null; candidates: number }`.
- **Indexing is 0-based and row-major**: `index = row * 9 + column`.
- **Candidate masks use bits 1..9 for digits 1..9**: `indexToMask(digit) = 1 << digit`. Bit 0 is reserved/normalized off. Do not shift by `digit - 1` in solver-facing code.
- A solved cell normally has `candidates === indexToMask(value)`; `sanitizeCandidates` enforces this.
- `candidates === 0` on an unsolved cell is an illegal state and throws `IllegalStateError` (`NO_CANDIDATES`).
- `ALGORITHM_SCORE` in `constants/algorithms.ts` is the single registry of algorithm names and difficulty scores; the `Algorithm` type is derived from its keys. Add new algorithms there.
- **Hot-path convention**: solvers mutate nothing. They take a `Board`, return a new `Board`, and reuse unchanged `Cell` objects. `applySimpleModification` shallow-copies the board array, replaces the solved cell, and removes the digit from peers.
- `solveStep` tries algorithms in order — FullHouse → HiddenSingleBox → HiddenSingleLine → NakedSingle → PointingPairs — and returns `null` when stuck. `solveAll` loops until `solveStep` returns `null`; it does **not** backtrack, so it may leave a partially solved board.
- Generation (`newBoard` in `core/generator.ts`) *does* backtrack internally. It digs clues from a full solution while a solution counter preserves uniqueness for >= 25 hints; below that it transforms known 17-clue seed puzzles and pads them.
  - `generator.ts` is **generated support code**, not hand-maintained core logic. Its current purpose is to exercise and validate the solver by producing known-solution boards.
  - Once the solver is complete, the generator is intended to be the foundation for uniqueness checking and board difficulty rating. Treat it as a verification tool rather than the final product.
- Generator-internal grids are `Uint16Array` and use a **local** bit convention (`1 << (digit - 1)`) with `0` meaning empty. These masks never cross the public API; `toBoard` converts to the `Cell` representation.

## Solver structure (`core/solver.ts`)

Every algorithm is implemented as a **find/solve pair**:

| Pure finder | Applier | Deduction |
| --- | --- | --- |
| `findFullHouse(board)` | `solveFullHouse(board)` | The only empty cell in a house gets the missing digit (`45 - sum`). |
| `findHiddenSingleUnit(board, units)` | `solveHiddenSingleBox` / `solveHiddenSingleLine` | A digit has exactly one candidate cell in a unit. The shared finder takes the unit list (`BOXES` or `LINES`); the two wrappers bind it. |
| `findNakedSingle(board)` | `solveNakedSingle(board)` | An unsolved cell has exactly one candidate. |
| `findPointingPairs(board)` | `solvePointingPairs(board)` | A digit in a box is confined to one row/column, so remove it from the rest of that line. Returns `{ remove, value }` rather than a placement. |

Rules for the pair pattern:

- **Finders are pure.** `findX` scans the board, returns a description of the deduction, and `null` when the pattern is absent. It never builds a new board.
- **Appliers are pure too.** `solveX(board)` calls its finder, applies the result, and returns a **new `Board`**, or `null` when there was nothing to apply. It never mutates the input board or its cells.
- **Placements** share `applySimpleModification(board, modification)`: it shallow-copies the array, sets the cell to `{ value, candidates: indexToMask(value) }`, and removes that digit from all peers via `removeCandidate`.
- **Eliminations** (like pointing pairs) copy the array and call `removeCandidate` only on the affected cells.
- `SimpleModification` (`{ index, value }`) is the common result shape for single placements.
- `solveStep(board, { candidates })` is the orchestrator: it runs the algorithms in the order listed above and returns `{ board, alg }` for the first success, or `null`. `alg` is the `Algorithm` key used for scoring.
- `solveAll(board)` repeatedly calls `solveStep` and stops when it returns `null`.

To add an algorithm: write `findX`/`solveX` following these rules, add the name to `ALGORITHM_SCORE`, wire it into `solveStep` in difficulty order, and add tests. Keep the finder separate from the applier — the split exists so a scorer or hint UI can use deductions without mutating a board.

## Code conventions

- Use ESM imports with explicit `.js` extensions (`NodeNext`), even from `.ts` files.
- Use `import type` / separate type imports (`verbatimModuleSyntax`, `consistent-type-imports`).
- Exported functions need explicit return types (`explicit-module-boundary-types`).
- Prefer `readonly` arrays/params where values are not mutated; preserve the existing immutability style.
- Keep the **find/apply split** described in [Solver structure](#solver-structure-coresolvets): a pure `findX` returns a description of the deduction (or `null`), and `solveX` applies it. This supports scoring and step-by-step hints. Do not collapse these into one function.
- Throw `RangeError` for bad indices/lengths and `IllegalStateError` for contradictory boards; avoid plain `Error` for these cases.
- Follow the file layout: algorithm logic in `core/solver.ts` (or a new module), constants in `constants/`, generic helpers in `utils/`.
- Public API changes must be reflected in `src/index.ts`. Note that `solveAll` is **not** exported from `index.ts`, even though `solveStep` is.

## Testing

- Vitest tests are colocated as `src/**/*.test.ts`; they are excluded from the build.
- Prefer table-driven `it.each` with explicit expected values (see `utils/bitwise.test.ts`).
- Add tests for any new bitwise helper, solver algorithm, or generator change. Verify solver results against `newBoard(...).solution`.
- `generator.ts` is currently the main source of known-solution boards for solver verification; broader uniqueness/difficulty checks will build on it later.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before finishing.

## Known gotchas

- `packages/core/tsconfig.json` is `noEmit`; `tsconfig.build.json` enables emit to `dist` and excludes tests.
- Root `tsconfig.json` only covers tool config files (`eslint.config.ts`); package typecheck is recursive.
- `knip.ts` only configures `packages/core`; new packages may need their own Knip workspace entries.
- Peer/unit constants are precomputed at module load; prefer them over recomputing row/column/box math.
