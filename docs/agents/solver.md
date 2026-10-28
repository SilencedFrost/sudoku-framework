# Solver architecture

Load when changing `packages/core/src/core/solver/` or adding an algorithm.

## Find/apply pattern

Every algorithm is a **find/solve pair**, orchestrated by `core/solver/solver.ts`:

- `findX` is pure. It scans the board, returns a description of the deduction (indices, masks, or placements), and `null` when the pattern is absent. It never builds a board.
- `solveX` is pure too. It calls the finder, applies the result, and returns a **new `Board`**, or `null` when there was nothing to apply. It never mutates the input board or cells.
- Do not collapse the pair: a grader and hint UI need detection separate from application.

Finders split by search unit. A unit finder handles the smallest unit — one cell, one house, one line, or one box — does the cheapest local scan, and returns indices/masks. A board-level wrapper owns the loop over `BOARD` / `HOUSES` / `BOXES` / `LINES` and feeds the applier. Unit finders (`cell.ts`, `house.ts`, `box.ts`, `line.ts`) must not import `board.ts` or `solver.ts`.

Visibility is deliberate: export a finder when tests, a grader, or a hint UI need detection; keep it private when only its applier consumes it. Currently every unit finder and every `solveX` applier is exported; every board-level wrapper is private.

## Algorithms and file layout

| Algorithm | Finder → board wrapper | Applier | Deduction |
| --- | --- | --- | --- |
| Full house (`FullHouse`) | `findFullHouse(board, house)` (`house.ts`) → private `findFullHouses` | `solveFullHouses` | The only empty cell in a house gets the missing digit (`HOUSE_DIGIT_SUM - sum`). |
| Hidden single (`HiddenSingleBox` / `HiddenSingleLine`) | `findHiddenSinglesInHouse(board, house, config)` (`house.ts`) → private `findHiddenSinglesInHouses`, bound to `BOXES` / `LINES` | `solveHiddenSinglesBoxes` / `solveHiddenSinglesLines` | A digit has exactly one candidate cell in a house. |
| Naked single (`NakedSingle`) | `findNakedSingle(board, index)` (`cell.ts`) → private `findNakedSingles` | `solveNakedSingles` | An unsolved cell has exactly one candidate. The cell finder returns the digit (or `null`). |
| Pointing pairs/triples (`PointingPairs`) | `findPointingPairsInBox(board, box, config)` (`box.ts`) → private `findPointingPairs` | `solvePointingPairs` | A digit in a box is confined to one row/column, so remove it from the rest of that line. Only digits confined to 2..`UNIT_SIZE` box cells qualify. Returns `{ mask, remove }[]`. |
| Claiming (`Claiming`) | `findClaimingsInLine(board, line, config)` (`line.ts`) → private `findClaimings` | `solveClaimings` | A digit in a line is confined to one box, so remove it from the rest of that box. A single position also qualifies. Returns `{ remove, mask }`. |
| Naked sets (`NakedPair` / `NakedTriple` / `NakedQuad`) | `findNakedSetsInHouse(board, house, config)` (`house.ts`) → private `findNakedSets` | `solveNakedSets` | `n` cells in a house whose candidate union is exactly `n` digits form a naked set; remove those digits from other cells in the house. `size` is 2..`MAX_SET_SIZE`. |
| Hidden sets (`HiddenPair` / `HiddenTriple` / `HiddenQuad`) | `findHiddenSetsInHouse(board, house, config)` (`house.ts`) → private `findHiddenSets` | `solveHiddenSets` | `n` digits are confined to the same `n` cells in a house; remove every other candidate from those cells. `size` is 2..`MAX_SET_SIZE`. |

File conventions:

- `cell.ts`: cell-scoped finders, `(board, index)`.
- `house.ts`: house-scoped finders, `(board, house, config)`; `findFullHouse` takes no config. Must not allocate a board copy.
- `box.ts`: box-scoped finders, `(board, box, config)`.
- `line.ts`: line-scoped finders, `(board, line, config)`.
- `board.ts`: board-level wrappers and appliers. Hidden-single wrappers bind to `BOXES` or `LINES`.
- `common.ts`: `applySimpleModifications`, `applyEliminations`, `canEliminateCandidates`, `findConfinedEliminations` (shared pointing/claiming search), and `getMinimalHallSets` (shared Hall-union search for naked/hidden sets).
- Add a new unit file only for a genuinely different search shape (for example `chain` or `fish`), not once per algorithm.

Batching: finders that support it return `X[] | null`; single-pattern finders return one deduction or `null`. The `first` flag (`BasicConfig`) chooses between stopping at the first hit (`true`) and collecting every deduction in scope (`false`). Unit finder shapes are not uniform: `findHiddenSinglesInHouse`, `findNakedSetsInHouse`, `findHiddenSetsInHouse`, `findPointingPairsInBox`, and `findClaimingsInLine` return arrays even when `first` is `true`; `findFullHouse` returns one modification; `findNakedSingle` returns a digit. Board wrappers normalize these into lists.

## `solveStep` and `solveAll`

`solveStep(board, { candidates = "sanitize" } = {})` runs algorithms in order and returns `{ board, alg }` for the first success, or `null`. `alg` is the `Algorithm` key used for scoring.

Candidate modes:

- `"rebuild"`: `sanitizeCandidates(board, true)` first; no later sanitize pass.
- `"sanitize"` (default): run FullHouse on the input, then `sanitizeCandidates(board)` before the remaining algorithms.
- `"trust"`: use the supplied candidates as-is.

Order (first success wins):

1. `FullHouse` — `{ first: false }`
2. `HiddenSingleBox` — `{ first: false }`
3. `HiddenSingleLine` — `{ first: false }`
4. `NakedSingle` — `{ first: false }`
5. `PointingPairs` — `{ first: true }`
6. `Claiming` — `{ first: true }`
7. `NakedPair` — `{ size: 2, first: true }`
8. `HiddenPair` — `{ size: 2, first: true }`
9. `NakedTriple` — `{ size: 3, first: true }`
10. `HiddenTriple` — `{ size: 3, first: true }`

`solveAll(board)` loops `solveStep` starting with `{ candidates: "rebuild" }`, then `{ candidates: "trust" }`, until `null`. It does **not** backtrack, so it may leave a partially solved board, and it discards the algorithm trace.

`NakedQuad` and `HiddenQuad` are in `ALGORITHM_SCORE` and supported by the finders/appliers, but are **not wired into `solveStep`**. Other registry entries (`XWing`, `Swordfish`, …) are future algorithms; only the ten names above are currently reachable.

## Placements and eliminations

- Placements share `applySimpleModifications(board, modifications | null)`: shallow-copies the board, deduplicates repeated indices (first wins), sets `{ value, candidates: indexToMask(value) }`, and removes the digit from peers against the partially updated copy. Passing `[]` returns a copied board, not `null`; pass `null` to signal "nothing to apply".
- Eliminations share `applyEliminations(board, results | null)` (`common.ts`): returns `null` for `null`, otherwise shallow-copies the board and calls `removeCandidate` for every cell/mask pair against the accumulating copy, so eliminations from several cells or patterns compose instead of overwriting each other against the stale input. Pointing pairs, claiming, and naked/hidden sets all use it.
- Never let an elimination leave a cell with zero candidates; `removeCandidate` (and therefore `applyEliminations`) throws `IllegalStateError`.
- Use `canEliminateCandidates` to skip patterns that would remove nothing.
- `SimpleModification` (`{ index, value }`), `CandidateElimination` (`{ mask, remove }`), `BasicConfig` (`{ first?: boolean }`), and `Algorithm` live in `types/algorithms.type.ts`.

## Adding an algorithm

1. Implement `findX` in the unit file matching its search shape (`cell.ts`, `house.ts`, `box.ts`, `line.ts`) or in `board.ts` if it has no natural unit. Keep it pure, support `first` when it can report several deductions, and return `null` when the pattern is absent.
2. Implement the board-level wrapper and `solveX` applier in `board.ts` beside the corresponding finder; copy the board and reuse unchanged `Cell` objects.
3. Add the name to `ALGORITHM_SCORE` in `constants/algorithms.ts`; that object is the single source of truth for `Algorithm`.
4. Wire it into `STEPS` in `solver.ts` in difficulty order. Always pass an explicit config (for example `size: 3`) when one algorithm family can report multiple names, so `alg` matches the deduction.
5. Add finder, applier, and where relevant `solveStep` tests; verify results against `newBoard(hints, seed).solution`.

## Pitfalls

- `solveNakedSets` accepts `size` 2..`MAX_SET_SIZE` (`Math.floor(HOUSE_SIZE / 2)`; 4 on 9x9). The default search (no `size`) mixes sizes and reports a maximal collection of disjoint sets; solver wiring passes an explicit size so the returned `alg` matches the deduction.
- `findNakedSetsInHouse` throws `RangeError` for `size` outside 2..`MAX_SET_SIZE`. Its default search consumes every size and caps at `min(unsolved - 1, MAX_SET_SIZE)`; at least one non-member cell is required so the set can eliminate something. `first` defaults to `false`.
- `findHiddenSetsInHouse` throws `RangeError` for `size` outside 2..`MAX_SET_SIZE`. Its default search consumes every size and caps at `min(unsolved, MAX_SET_SIZE)`. It skips sets that would remove nothing, and an overfilled house that never forms a union returns `null` (it does not throw). `first` defaults to `false`.
- Sets larger than `MAX_SET_SIZE` are not searched: a naked set of size `k` is equivalent to a hidden set of size `HOUSE_SIZE - k`, and vice versa, so the complement covers the same deduction.
- Both set finders use `getMinimalHallSets` (`common.ts`). A forced `size` consumes smaller sizes up to `size - 2`, then rejects a union that still encloses a set of `size - 1`, so a forced 3/4 never leaks a pair. Size 2 is a dedicated count of identical two-value masks; larger sizes use a recursive search.
- `findPointingPairsInBox` only accepts digits confined to 2..`UNIT_SIZE` box cells, so it covers pointing pairs and triples on 9x9 and wider confinements on larger boards. Its `remove` list is the whole outside-box line, not just cells that currently hold the digit; the applier relies on `removeCandidate` returning solved/clean cells unchanged, and `canEliminateCandidates` prevents reporting a pattern that would eliminate nothing.
- `findClaimingsInLine` shares `findConfinedEliminations` with pointing pairs but allows a single confined position (`minPositions: 1`), so it can report a hidden-single-strength elimination.
- `findNakedSetsInHouse` returns `{ mask, remove }[]`. Its `mask` is the set's digit union and its `remove` list is every non-member unsolved cell in the house, including cells that currently hold none of those digits; set members are excluded and `canEliminateCandidates` prevents reporting a set that eliminates nothing.
- `findHiddenSetsInHouse` is the digit-side dual: it searches digit position masks and returns `{ mask: outsideMask, remove: memberCells }[]`, where `outsideMask` is `FULL_DIGIT_MASK & ~digitMask`, so the result feeds `applyEliminations` directly.
- `solveNakedSingles(board, config)` requires an explicit config; pass `{}` or `{ first: ... }`.
- `findHiddenSinglesInHouse` still throws a plain `Error` when `maskToIndex` returns null. That is an internal invariant check, not user-facing validation.
- `solveStep` returns after the first successful algorithm. A grader needing the applied step must loop `solveStep` itself; `solveAll` only returns the final board.
