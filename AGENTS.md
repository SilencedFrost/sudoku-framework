# AGENTS.md

Guidance for AI agents working in this repository.

> **Doc baseline:** `7ea55b6` (`feat: deduplicate cell modifications`). Trace changes to this file with `git diff 7ea55b6 -- AGENTS.md`.

## Project overview

`sudoku-framework` is a pnpm monorepo for a Sudoku engine. Only `packages/core` exists today; there is no README, so this file is the primary orientation doc.

- **Runtime/tooling**: Node >= 22.13, pnpm >= 11 (`packageManager: pnpm@11.15.1`), ESM (`"type": "module"`).
- **Language**: TypeScript ~6.0.3 (ES2025, `NodeNext`), strict settings, no bundler.
- **Tests**: Vitest.
- **Lint/typecheck**: ESLint 10 + typescript-eslint (`strictTypeChecked`, `stylisticTypeChecked`), `tsc --noEmit`.
- **Unused-code check**: Knip.
- **Generator randomness**: `seedrandom` (a `packages/core` runtime dependency).

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
  index.ts                  # public API surface (re-exports only)
  core/
    solver/
      solver.ts             # solveStep(), solveAll()
      algorithms/           # algorithm implementations, split by search unit
        algorithms.ts       # board-wide single/deduction pairs (naked single, pointing, claiming, hidden pair)
        board.ts            # HOUSES/PEERS wrappers: full houses, naked sets (+ appliers)
        common.ts           # applySimpleModifications shared applier
        house.ts            # unit-scoped finders (one row/column/box)
        houses.ts           # hidden-single wrappers over BOXES/LINES
        common.test.ts      # batch/dedup applier tests
        house.test.ts       # naked-set finder tests
    generator.ts            # newBoard(hints, seed?): generated boards with known solutions
  constants/
    cordinates.ts           # precomputed units: ROWS, COLUMNS, BOXES, LINES, HOUSES, PEERS, *_OF
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

`packages/*/dist` is build output and is gitignored. `constants/cordinates.ts` is intentionally spelled that way; do not rename it as a drive-by fix.

## Domain model and invariants

- A `Board` is `Cell[]` of exactly **81** cells. `Cell = { value: number | null; candidates: number }`.
- **Indexing is 0-based and row-major**: `index = row * 9 + column`.
- **Candidate masks use bits 1..9 for digits 1..9**: `indexToMask(digit) = 1 << digit`. Bit 0 is reserved/normalized off. Do not shift by `digit - 1` in solver-facing code.
- `FULL_DIGIT_MASK` is every candidate bit (bits 1..9) and is defined in `constants/bitwise.ts`.
- In solver-facing boards a solved cell normally has `candidates === indexToMask(value)`; `sanitizeCandidates` enforces this.
- **Generated boards are the exception** (see [Known gotchas](#known-gotchas)): `newBoard` fills solved cells with `candidates: 0` and unsolved puzzle cells with generator-local `1 << (digit - 1)` masks. Rebuild/sanitize before feeding generated candidates to the solver.
- `candidates === 0` on an unsolved cell is an illegal state and throws `IllegalStateError` (`NO_CANDIDATES`).
- `ALGORITHM_SCORE` in `constants/algorithms.ts` is the single registry of algorithm names and difficulty scores; the `Algorithm` type is derived from its keys. Add new algorithms there.
- **Hot-path convention**: solvers mutate nothing. They take a `Board`, return a new `Board`, and reuse unchanged `Cell` objects.
- `applySimpleModifications` (in `algorithms/common.ts`) applies a batch of placements: it shallow-copies the board array, sets each placed cell to `{ value, candidates: indexToMask(value) }`, and removes that digit from all peers. Repeated cell indices are deduplicated and the first placement wins. Peer removals are read from the partially updated copy, so batch removals compose.
- Eliminations copy the board and call `removeCandidate` or update cells directly. Do not let an elimination leave a cell with zero candidates; throw `IllegalStateError` instead.
- `solveStep` tries algorithms in order and returns `null` when stuck. `solveAll` loops until `solveStep` returns `null`; it does **not** backtrack, so it may leave a partially solved board.
- Generation (`newBoard` in `core/generator.ts`) _does_ backtrack internally. `newBoard(hints, seed?)` requires an integer `hints` in **17..81**; at 25 or more hints it digs clues from a full solution while a solution counter preserves uniqueness, falling back to the seed-puzzle path if digging fails. Below that it transforms known 17-clue seed puzzles and pads them. Passing `seed` makes the result deterministic.
  - `generator.ts` is **generated support code**, not hand-maintained core logic. Its current purpose is to exercise and validate the solver by producing known-solution boards.
  - Once the solver is complete, the generator is intended to be the foundation for uniqueness checking and board difficulty rating. Treat it as a verification tool rather than the final product.
- Generator-internal grids are `Uint16Array` and use a **local** bit convention (`1 << (digit - 1)`) with `0` meaning empty. `toBoard` currently copies those masks into `Cell.candidates` for unsolved cells rather than converting them; treat generated candidate masks as untrusted (see gotchas).

## Solver structure (`core/solver/`)

Every algorithm is implemented as a **find/solve pair**, with orchestration in `core/solver/solver.ts`. Algorithms are split by the unit they reason over into the `algorithms/` directory:

| Finder | Applier | Deduction |
| --- | --- | --- |
| `findFullHouse(board, house)` (per house) → `findFullHouses(board, config)` | `solveFullHouses(board, config)` | The only empty cell in a house gets the missing digit (`45 - sum`). |
| `findHiddenSinglesInHouse(board, house, config)` → `findHiddenSinglesBoxes` / `findHiddenSinglesLines` | `solveHiddenSinglesBoxes` / `solveHiddenSinglesLines` | A digit has exactly one candidate cell in a unit. Each wrapper binds the shared finder to `BOXES` or `LINES`. |
| `findNakedSingle(board)` (private) | `solveNakedSingle(board)` | An unsolved cell has exactly one candidate. |
| `findPointingPairs(board)` (private) | `solvePointingPairs(board)` | A digit in a box is confined to one row/column, so remove it from the rest of that line. Returns `{ remove, value }`, not a placement. Covers pointing triples. |
| `findClaiming(board)` (private) | `solveClaiming(board)` | A digit in a row/column is confined to one box, so remove it from the rest of that box. Returns `{ remove, value }`. |
| `findNakedSetsInHouse(board, house, config)` → `findNakedSets(board, config)` | `solveNakedSets(board, config)` | `n` cells in a house whose combined candidates are exactly `n` digits form a naked set; remove those digits from other cells in the house. House finder returns union masks; board finder returns `{ masks, house }[]`. `size` is 2..4. |
| `findHiddenPair(board)` (private) | `solveHiddenPair(board)` | Two digits are confined to the same two cells in a house; those cells cannot hold any other candidates. Returns `{ remove, mask }`. |

Finders that support batching return `X[] | null`; single-pattern finders return one deduction or `null`. The `first` flag (`BasicConfig`) chooses between stopping at the first hit (`true`) and collecting every deduction in the scope (`false`).

The modular examples are `findNakedSetsInHouse` in `algorithms/house.ts`, wrapped by `findNakedSets`/`solveNakedSets` in `algorithms/board.ts`, plus the shared batch applier in `algorithms/common.ts`.

Rules for the find/solve pattern:

- **Finders are pure.** `findX` scans the board, returns a description of the deduction, and `null` when the pattern is absent. It never builds a new board.
- **Split by search unit.** A unit finder (for example `findNakedSetsInHouse`) takes one house or unit list, does the cheapest local scan, and returns indices/masks rather than board copies. A board finder (`findNakedSets`) owns the loop over `HOUSES`/`PEERS` and is the stable entry point for a grader or hint UI.
- **Finder visibility is deliberate.** Export a finder when tests, a grader, or a hint UI need detection; keep it private when only its applier consumes it (the current single-valued algorithms do this).
- **Appliers are pure too.** `solveX(board)` calls its finder, applies the result, and returns a **new `Board`**, or `null` when there was nothing to apply. It never mutates the input board or its cells.
- **Placements** share `applySimpleModifications(board, modifications | null)`. It shallow-copies the array, deduplicates repeated cell indices (first wins), sets each cell, and removes the placed digit from peers against the partially updated board.
- **Eliminations** (pointing pairs/claiming/naked sets/hidden pairs) copy the array and call `removeCandidate` or directly update cells. Do not let an elimination leave a cell with zero candidates; throw `IllegalStateError` instead.
- `SimpleModification` (`{ index, value }`), `BasicConfig` (`{ first?: boolean }`), and `Algorithm` live in `types/algorithms.type.ts`.
- `solveStep(board, { candidates })` is the orchestrator: it runs the algorithms in the order listed below and returns `{ board, alg }` for the first success, or `null`. `alg` is the `Algorithm` key used for scoring.
- `solveAll(board)` repeatedly calls `solveStep` starting with `candidates: "rebuild"`, then `candidates: "trust"`, and stops when it returns `null`. It does **not** backtrack, so it may leave a partially solved board.

### `solveStep` candidate handling and order

`solveStep(board, { candidates = "sanitize" } = {})`:

- `"rebuild"`: `sanitizeCandidates(board, true)` first; no later sanitize pass is needed.
- `"sanitize"` (default): run FullHouse on the input, then `sanitizeCandidates(board)` before the remaining algorithms.
- `"trust"`: use the supplied candidates as-is.

Order (first success wins):

1. `FullHouse` — batched with `{ first: false }`
2. `HiddenSingleBox` — batched with `{ first: false }`
3. `HiddenSingleLine` — batched with `{ first: false }`
4. `NakedSingle`
5. `PointingPairs`
6. `Claiming`
7. `NakedPair` — `solveNakedSets(..., { size: 2, first: true })`
8. `HiddenPair`
9. `NakedTriple` — `solveNakedSets(..., { size: 3, first: true })`

`NakedQuad` is in `ALGORITHM_SCORE` but is **not wired into `solveStep`** yet. Other registry entries (`XWing`, `Swordfish`, …) are future algorithms; only the nine names above are currently reachable.

## Algorithm file convention

- `algorithms/house.ts` holds unit-scoped finders. A unit finder takes `(board, unit, config)`, returns a deduction description or `null`, and must not allocate a board copy.
- `algorithms/houses.ts` holds wrappers that loop over a unit list (`BOXES`, `LINES`) and bind a house finder.
- `algorithms/board.ts` holds board-scoped finders/appliers that loop over `HOUSES`/`PEERS`. Appliers live with the board-level finder that produces their input.
- `algorithms/common.ts` holds shared applier machinery (currently `applySimpleModifications`).
- `algorithms/algorithms.ts` holds board-wide pairs that are not naturally unit-scoped: naked single, pointing pairs, claiming, and hidden pair. Their finders are private.
- Unit finders must not import `algorithms/board.ts` or `solver.ts`.
- Add a new unit file only for a genuinely different search shape (for example `chain` or `fish`), not once per algorithm.
- Do not leave half a pair in each file: when a change already touches both finder and applier, move the whole pair into the new layout.

## Adding an algorithm

1. Implement `findX` in the appropriate `algorithms/*.ts`; keep it pure, support `first`, and return `null` when the pattern is absent.
2. Implement `solveX` beside the corresponding board-level finder; copy the board and reuse unchanged `Cell` objects.
3. Add the name to `ALGORITHM_SCORE` in `constants/algorithms.ts`; that object is the single source of truth for the `Algorithm` type.
4. Wire it into `solveStep` in score/difficulty order. Always pass explicit config (for example `size: 3`) when one algorithm family can report multiple names, so `alg` matches the deduction.
5. Add finder, applier, and where relevant `solveStep` tests; verify solver results against `newBoard(hints, seed).solution`.

## Grader (planned)

The grader will rate a puzzle by replaying deductions, not by re-scanning candidates on its own. Keep these contracts stable:

- Drive `solveStep` in a loop: once with `{ candidates: "rebuild" }`, then with `{ candidates: "trust" }`. This mirrors `solveAll` but preserves the per-step `alg`. Do not grade with `solveAll`, which discards the algorithm key.
- Aggregate `ALGORITHM_SCORE[alg]` and keep the step sequence for hints/explanations. Whether difficulty is a sum, max, or step count is a grader policy decision; `alg` is already the exact `Algorithm` key.
- Call board-level finders (`findX`) directly when the grader needs to detect or explain a pattern without applying it. Do not duplicate the house loops.
- `solveStep` may report several placements under one `alg` (full houses and hidden singles are batched). Score the step, not the number of cells changed, or decide explicitly how to weight bulk steps.
- Use `GeneratedBoard.solution` from `newBoard` to validate generated puzzles. Generated puzzle candidates are untrusted; rebuild before grading.
- Intended home: `core/grader.ts` (not created yet). Re-export it from `src/index.ts` only if it becomes public API.

## Code conventions

- Use ESM imports with explicit `.js` extensions (`NodeNext`), even from `.ts` files.
- Use `import type` / separate type imports (`verbatimModuleSyntax`, `consistent-type-imports`).
- Exported functions need explicit return types (`explicit-module-boundary-types`).
- Prefer `readonly` arrays/params where values are not mutated; preserve the existing immutability style.
- Keep the **find/apply split** described in [Solver structure](#solver-structure-coresolvets): a pure `findX` returns a description of the deduction (or `null`), and `solveX` applies it. This supports scoring and step-by-step hints. Do not collapse these into one function.
- Throw `RangeError` for bad indices/lengths/hint counts and `IllegalStateError` for contradictory boards; avoid plain `Error` for these cases.
  - `IllegalStateError` carries a code from `IllegalStateError.Code`: `NO_CANDIDATES`, `ILLEGAL_NAKED_COUNT`, `ILLEGAL_HIDDEN_COUNT`.
  - `getUnit` throws `RangeError` for an out-of-range index; with `noUncheckedIndexedAccess`, use `getUnit` or `??` rather than unchecked indexing.
- Follow the file layout: algorithm logic in `core/solver/algorithms/*.ts`, orchestration in `core/solver/solver.ts`, constants in `constants/`, generic helpers in `utils/`.
- The public API is only what `src/index.ts` exports: `resolveCandidates`, `solveStep`, `solveAll`, `newBoard`, `sanitizeCandidates`, and the `Cell`/`Board` types. Reflect public API changes there.

## Testing

- Vitest tests are colocated as `src/**/*.test.ts`; they are excluded from the build.
- Current coverage is: `utils/bitwise.test.ts`, `algorithms/common.test.ts` (batch applier/dedup/immutability), and `algorithms/house.test.ts` (naked-set minimality, including randomized cases). There is no `algorithms/board.test.ts`, `solver.test.ts`, or generator test yet — add those when touching the corresponding code.
- Mirror the source scope: `algorithms/house.test.ts` for unit finders, `algorithms/board.test.ts` for board wrappers/appliers, and `solver.test.ts` for ordering and `alg` keys.
- Prefer table-driven `it.each` with explicit expected values (see `utils/bitwise.test.ts`).
- Add tests for any new bitwise helper, solver algorithm, or generator change. Verify solver results against `newBoard(...).solution`, and pass a seed (`newBoard(hints, "seed")`) so failures reproduce.
- Test finder and applier separately. Finders should be checked for `null` on absent patterns and for concrete masks/indices; appliers should be checked for board immutability, elimination effects, and `IllegalStateError` on contradictory input.
- Cover `applySimpleModifications` when changing placement/batch behavior: duplicate indices, conflicting digits (first wins), and peer-removal composition.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before finishing.

## Known gotchas

- `packages/core/tsconfig.json` is `noEmit`; `tsconfig.build.json` enables emit to `dist` and excludes tests.
- Root `tsconfig.json` only covers `eslint.config.ts`; package typecheck is recursive. `knip.ts` only configures `packages/core`; new packages may need their own Knip workspace entries.
- Peer/unit constants are precomputed at module load; prefer them over recomputing row/column/box math.
- `constants/cordinates.ts` exports both unit lists (`ROWS`, `COLUMNS`, `BOXES`, `LINES`, `HOUSES`) and precomputed cell→unit maps (`ROW_OF`, `BOX_OUTSIDE_ROW_OF`, etc.). `HOUSES` is rows + columns + boxes; `LINES` is rows + columns.
- `ROW_MASKS`/`COL_MASKS` in `constants/bitwise.ts` are **9-bit position masks for a box layout**, not 81-cell masks (and `LINE_MASKS = ROW_MASKS`). `candidatesToDigitMasks` likewise yields a position mask where bit `j` is the `j`-th index of the supplied list, not a cell index.
- `sanitizeCandidates(board, rebuild = false)` trusts the caller's candidates when `rebuild` is false; pass `true` to rebuild from values. Either mode throws `NO_CANDIDATES` if an unsolved cell ends up empty.
- **`newBoard` candidate convention differs from the solver's.** Filled puzzle/solution cells get `candidates: 0`, and unsolved puzzle cells get `1 << (digit - 1)` masks. Call `sanitizeCandidates(board, true)` (or `solveStep`/`solveAll` with `"rebuild"`) before treating a generated puzzle as a solver board.
- `solveNakedSets` accepts `size` 2..4. The default search (no `size`) mixes sizes and reports a maximal collection of disjoint sets; solver wiring must pass an explicit size so the returned `alg` name matches the deduction (`NakedPair`, `NakedTriple`, `NakedQuad`).
- `findNakedSetsInHouse` throws `RangeError` for `size` outside 2..4. Its default search is capped at `floor(unsolved / 2)` (at most 4 in a 9-cell house), so it can miss a larger usable set in a nearly full house. A forced size does not consume smaller sizes first: size 3 relies on bivalue/pair pre-exclusion for minimality, and size 4 additionally rejects sets in which a digit is held by only one member.
- The remaining 9x9 assumptions live in `constants/cordinates.ts` (`ROWS`/`COLUMNS`/`BOXES`/`PEERS`), `constants/bitwise.ts` (`FULL_DIGIT_MASK`, row/column/line masks), `utils/bitwise.ts` (`resolveCandidates` hardcodes 9), `utils/board.ts` (`sanitizeCandidates` hardcodes 81 and `PEERS`; `candidatesToDigitMasks` loops 1..9), and `core/generator.ts`.
- `solveStep` returns after the first successful algorithm. A grader needing the applied step must loop `solveStep` itself; `solveAll` only returns the final board and loses the algorithm trace.
- `applySimpleModifications(board, [])` returns a copied board, not `null`; pass `null` to signal "nothing to apply". Finders already return `null` for that case.
- `NakedQuad` is registered and supported by `findNakedSetsInHouse`/`solveNakedSets`, but it is not reachable through `solveStep` yet.
