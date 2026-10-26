# Solver architecture

Load when changing `packages/core/src/core/solver/` or adding an algorithm.

## Find/apply pattern

Every algorithm is a **find/solve pair**, orchestrated by `core/solver/solver.ts`:

- `findX` is pure. It scans the board, returns a description of the deduction (indices, masks, or placements), and `null` when the pattern is absent. It never builds a board.
- `solveX` is pure too. It calls the finder, applies the result, and returns a **new `Board`**, or `null` when there was nothing to apply. It never mutates the input board or cells.
- Do not collapse the pair: a grader and hint UI need detection separate from application.

Finders split by search unit. A unit finder handles the smallest unit — one cell, one house, or one box — does the cheapest local scan, and returns indices/masks. A board-level wrapper owns the loop over `BOARD` / `HOUSES` / `BOXES` / `LINES` and feeds the applier. Unit finders (`cell.ts`, `house.ts`, `box.ts`) must not import `algorithms/board.ts` or `solver.ts`.

Finder visibility is deliberate: export a finder when tests, a grader, or a hint UI need detection; keep it private when only its applier consumes it. Currently the unit finders and all `solveX` appliers are exported; all board-level wrappers are private. Export a wrapper when a consumer needs one.

## Algorithms and file layout

| Algorithm | Finder → board wrapper | Applier | Deduction |
| --- | --- | --- | --- |
| Full house (`FullHouse`) | `findFullHouse(board, house)` (`house.ts`) → private `findFullHouses` | `solveFullHouses` | The only empty cell in a house gets the missing digit (`45 - sum`). |
| Hidden single (`HiddenSingleBox` / `HiddenSingleLine`) | `findHiddenSinglesInHouse(board, house, config)` (`house.ts`) → private `findHiddenSinglesInHouses`, bound to `BOXES` / `LINES` | `solveHiddenSinglesBoxes` / `solveHiddenSinglesLines` | A digit has exactly one candidate cell in a unit. |
| Naked single (`NakedSingle`) | `findNakedSingle(board, index)` (`cell.ts`) → private `findNakedSingles` | `solveNakedSingles` | An unsolved cell has exactly one candidate. The unit finder returns the digit (or `null`), not a modification. |
| Pointing pairs/triples (`PointingPairs`) | `findPointingPairsInBox(board, box, config)` (`box.ts`) → private `findPointingPairs` | `solvePointingPairs` | A digit in a box is confined to one row/column, so remove it from the rest of that line. Only digits confined to 2 or 3 box cells qualify. Returns `{ mask, remove }[]`, not a placement. |
| Claiming (`Claiming`) | `findClaimingsInLine(board, line, config)` (`line.ts`) → private `findClaimings` | `solveClaimings` | A digit in a line is confined to one box, so remove it from the rest of that box. Returns `{ remove, mask }`. |
| Naked sets (`NakedPair` / `NakedTriple` / `NakedQuad`) | `findNakedSetsInHouse(board, house, config)` (`house.ts`) → private `findNakedSets` | `solveNakedSets` | `n` cells in a house whose combined candidates are exactly `n` digits form a naked set; remove those digits from other cells in the house. `size` is 2..4. House finder returns `{ mask, remove }[]`; wrapper flattens it. |
| Hidden pair (`HiddenPair`) | `findHiddenSetsInHouse(board, house, config)` (`house.ts`) → private `findHiddenSets` | `solveHiddenSets` | Two digits are confined to the same two cells in a house; those cells cannot hold any other candidates. Wired as `size: 2`. |
| Hidden sets (`HiddenPair` / `HiddenTriple` / `HiddenQuad`) | `findHiddenSetsInHouse(board, house, config)` (`house.ts`) → private `findHiddenSets` | `solveHiddenSets` | `n` digits are confined to the same `n` cells in a house; remove every other candidate from those cells. `size` is 2..4. Only size 2 is wired; the finder and applier support sizes 3 and 4. |

File conventions:

- `cell.ts`: cell-scoped finders, `(board, index)`.
- `house.ts`: house-scoped finders, mostly `(board, house, config)`; `findFullHouse` takes `(board, house)`. Must not allocate a board copy.
- `box.ts`: box-scoped finders, `(board, box, config)`.
- `board.ts`: board-level wrappers and appliers. Each applier lives beside the wrapper that produces its input. Hidden-single wrappers bind to `BOXES` or `LINES`; there is no separate `houses.ts`. A pattern that is not unit-scoped keeps its finder and applier together here.
- `common.ts`: `applySimpleModifications`, `applyEliminations`, and `canEliminateCandidates`.
- Add a new unit file only for a genuinely different search shape (for example `chain` or `fish`), not once per algorithm.
- Do not leave half a pair in each file: when touching both finder and applier, move the whole pair into the new layout.

Batching: finders that support it return `X[] | null`; single-pattern finders return one deduction or `null`. The `first` flag (`BasicConfig`) chooses between stopping at the first hit (`true`) and collecting every deduction in scope (`false`). Unit finder shapes are not uniform: `findHiddenSinglesInHouse`, `findNakedSetsInHouse`, `findHiddenSetsInHouse`, and `findPointingPairsInBox` return arrays even when `first` is `true`; `findFullHouse` returns one modification; `findNakedSingle` returns a digit. Board wrappers normalize these into lists.

## Placements and eliminations

- Placements share `applySimpleModifications(board, modifications | null)`: shallow-copies the board, deduplicates repeated indices (first wins), sets `{ value, candidates: indexToMask(value) }`, and removes the digit from peers against the partially updated copy. Passing `[]` returns a copied board, not `null`; pass `null` to signal "nothing to apply".
- Eliminations share `applyEliminations(board, results | null)` (`common.ts`): returns `null` for `null`, otherwise shallow-copies the board and calls `removeCandidate` for every cell/mask pair against the accumulating copy, so eliminations from several cells or patterns compose instead of overwriting each other against the stale input. Pointing pairs, claiming, and naked/hidden sets all use it.
- Never let an elimination leave a cell with zero candidates; `removeCandidate` (and therefore `applyEliminations`) throws `IllegalStateError`.
- Use `canEliminateCandidates` to skip patterns that would remove nothing.
- `SimpleModification` (`{ index, value }`), `CandidateElimination` (`{ mask, remove }`), `BasicConfig` (`{ first?: boolean }`), and `Algorithm` live in `types/algorithms.type.ts`.

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
4. `NakedSingle` — `solveNakedSingles(..., { first: false })`
5. `PointingPairs` — `{ first: false }`
6. `Claiming`
7. `NakedPair` — `solveNakedSets(..., { size: 2, first: true })`
8. `HiddenPair` — `solveHiddenSets(..., { size: 2, first: true })`
9. `NakedTriple` — `solveNakedSets(..., { size: 3, first: true })`

`solveAll(board)` loops `solveStep` starting with `{ candidates: "rebuild" }`, then `{ candidates: "trust" }`, until `null`. It does **not** backtrack, so it may leave a partially solved board, and it discards the algorithm trace.

`NakedQuad` and `HiddenTriple` / `HiddenQuad` are in `ALGORITHM_SCORE` but are **not wired into `solveStep`** yet. `solveNakedSets` and `solveHiddenSets` already accept those sizes. Other registry entries (`XWing`, `Swordfish`, …) are future algorithms; only the nine names above are currently reachable.

## Adding an algorithm

1. Implement `findX` in the unit file matching its search shape (`cell.ts`, `house.ts`, `box.ts`) or in `algorithms.ts` if it has no natural unit. Keep it pure, support `first` when it can report several deductions, and return `null` when the pattern is absent.
2. Implement the board-level wrapper and `solveX` applier in `algorithms/board.ts` beside the corresponding finder; copy the board and reuse unchanged `Cell` objects. Non-unit patterns keep the pair together in `algorithms.ts`.
3. Add the name to `ALGORITHM_SCORE` in `constants/algorithms.ts`; that object is the single source of truth for `Algorithm`.
4. Wire it into `solveStep` in score/difficulty order. Always pass explicit config (for example `size: 3`) when one algorithm family can report multiple names, so `alg` matches the deduction.
5. Add finder, applier, and where relevant `solveStep` tests; verify results against `newBoard(hints, seed).solution`.

## Pitfalls

- `solveNakedSets` accepts `size` 2..4. The default search (no `size`) mixes sizes and reports a maximal collection of disjoint sets; solver wiring must pass an explicit size so the returned `alg` matches the deduction.
- `findNakedSetsInHouse` throws `RangeError` for `size` outside 2..4. Its default search is capped at `floor(unsolved / 2)` (at most 4 in a 9-cell house), so it can miss a larger usable set in a nearly full house. A forced size does not consume smaller sizes first: size 3 relies on bivalue/pair pre-exclusion for minimality, and size 4 additionally rejects sets in which a digit is held by only one member. Its `first` default is `false` (unlike the other config-taking unit finders), so it may return several eliminations; wrappers pass `first` explicitly.
- `findPointingPairsInBox` only accepts digits confined to 2 or 3 box cells, so it covers pointing pairs and triples. Its `remove` list is the whole outside-box line, not just cells that currently hold the digit; the applier relies on `removeCandidate` returning solved/clean cells unchanged, and `canEliminateCandidates` prevents reporting a pattern that would eliminate nothing.
- `findNakedSetsInHouse` returns `{ mask, remove }[]`. Its `remove` list is every non-member unsolved cell in the house, including cells that currently hold none of the digits; set members are excluded and `hasElimination` prevents reporting a set that eliminates nothing. The applier shares `applyEliminations` with pointing pairs and claiming.
- `findHiddenSetsInHouse` is the digit-side dual of `findNakedSetsInHouse`: it searches digit position masks and returns `{ mask: outsideMask, remove: memberCells }[]`, where `outsideMask` is `FULL_DIGIT_MASK & ~digitMask`, so the result feeds `applyEliminations` directly. It skips sets that would remove nothing. Its default search consumes smaller sizes and caps at `min(unsolved, 4)`; forced sizes 2..4 are supported, with pairs pre-excluded and a coverage check for size 4. The board wrapper is `solveHiddenSets`; `solveStep` currently wires only `size: 2` for `HiddenPair`. Sizes 3 and 4 are supported but deliberately unwired: on `probe-26` a wired hidden triple added a solve step without progress and cost about +65 µs/solve, and it solved no additional seed across `probe-00`..`probe-999`.
- `solveHiddenSets` replaces the old private `findHiddenPair`; it normalizes every hidden set to the same `{ mask: outsideMask, remove: memberCells }` shape, so there is no complement step in the applier.
- `solveNakedSingles(board, config)` requires an explicit config (unlike the other config-taking appliers); pass `{}` or `{ first: ... }`.
- `findHiddenSinglesInHouse` still throws a plain `Error` when `maskToIndex` returns null. That is an internal invariant check, not user-facing validation.
- `solveStep` returns after the first successful algorithm. A grader needing the applied step must loop `solveStep` itself; `solveAll` only returns the final board.
