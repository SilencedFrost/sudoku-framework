# Domain model and shared utilities

Load when changing board shape, candidate masks, constants, errors, or `utils/`.

## Board model

- A `Board` is a `Cell[]` of exactly **`BOARD_SIZE`** cells (`HOUSE_SIZE ** 2`; 81 at `UNIT_SIZE = 3`); `Cell = { value: number | null; candidates: number }`.
- Indexing is **0-based and row-major**: `index = row * HOUSE_SIZE + column`.
- Candidate bits 1..`HOUSE_SIZE` represent digits 1..`HOUSE_SIZE`: `indexToMask(digit) = 1 << digit`. Bit 0 is reserved and normalized off. Do not shift by `digit - 1` in solver-facing code.
- `FULL_DIGIT_MASK` (`constants/bitwise.ts`) contains every candidate bit (bits 1..`HOUSE_SIZE`).
- In solver-facing boards, a solved cell normally has `candidates === indexToMask(value)`; `sanitizeCandidates` enforces this.
- An unsolved cell with `candidates === 0` is illegal and throws `IllegalStateError` (`NO_CANDIDATES`).
- Generated boards use a different candidate convention; see [generator.md](generator.md).

## Immutability

- Solvers, finders, and appliers mutate nothing. They take a `Board`, return a new one, and reuse unchanged `Cell` objects by reference.
- `removeCandidate` returns solved/clean cells unchanged; callers must never leave an unsolved cell with zero candidates.
- Placement and elimination composition rules live in [solver.md](solver.md#placements-and-eliminations).

## Constants

- `constants/coordinates.ts` exports `BOARD` (all `BOARD_SIZE` indices), unit lists `ROWS`, `COLUMNS`, `BOXES`, `LINES` (rows + columns), `HOUSES` (rows + columns + boxes), `PEERS` (self excluded), and precomputed cell→unit maps (`ROW_OF`, `COLUMN_OF`, `BOX_OF`, …).
  - `ROW_OUTSIDE_BOX_OF` / `COLUMN_OUTSIDE_BOX_OF`: outside-box line members used by pointing pairs.
  - `BOX_OUTSIDE_ROW_OF` / `BOX_OUTSIDE_COLUMN_OF`: outside-line box members used by claiming.
- `constants/algorithms.ts`: `ALGORITHM_SCORE` is the single registry of algorithm names and scores; the `Algorithm` type is derived from its keys.
- `constants/board.ts`: `UNIT_SIZE`, `HOUSE_SIZE`, `BOARD_SIZE`, `DIGITS`, `HOUSE_DIGIT_SUM`, `MAX_SET_SIZE`. Change `UNIT_SIZE` to resize the whole solver board; candidate masks cap it at 5. `MAX_SET_SIZE` is `Math.floor(HOUSE_SIZE / 2)` (4 on 9x9).
- `utils/coordinates.ts`: `isRow(line)` distinguishes a line's orientation.
- Unit/peer constants are precomputed at module load; prefer them over recomputing row/column/box math. `BOARD` is also the board-level naked-single scan order.
- These lists stay plain `number[]`: `Uint8Array` was measured and is 5–7% slower in the solver's loops. See [`performance.md`](performance.md) before changing their representation.

## Pitfalls

- `ROW_MASKS` / `COL_MASKS` / `LINE_MASKS` are **positional masks over a unit's `HOUSE_SIZE` cells**, not `BOARD_SIZE`-cell masks. `ROW_MASKS` / `COL_MASKS` select one box row/column (`UNIT_SIZE` bits); `LINE_MASKS` aliases `ROW_MASKS` and selects one box-sized segment of a line.
- `candidatesToDigitMasks` yields `{ digit, mask }` where `mask` is a **position mask**: bit `j` is the `j`-th index of the supplied list, not a cell index. `transpose` builds that mask.
- `candidatesToDigitMasks` yields nothing when every digit 1..`HOUSE_SIZE` already appears as a value in the unit (`eligible === 0`). Callers must tolerate an empty generator.
- `sanitizeCandidates(board, rebuild = false)` trusts the caller's candidates when `rebuild` is false; pass `true` to rebuild from values. Either mode throws `NO_CANDIDATES` if an unsolved cell ends up empty.
- `getUnit` throws `RangeError` for an out-of-range index. With `noUncheckedIndexedAccess`, use `getUnit` or `??` instead of unchecked indexing.
- `IllegalStateError` carries a code from `IllegalStateError.Code`. Only `NO_CANDIDATES` is thrown today; `ILLEGAL_NAKED_COUNT` and `ILLEGAL_HIDDEN_COUNT` are defined but unused. Use `RangeError` for bad indices/lengths/hint counts, not plain `Error`.
- Board shape is derived from `UNIT_SIZE`: coordinates, candidate masks, `sanitizeCandidates`, `findFullHouse` (`HOUSE_DIGIT_SUM`), and the pointing/claiming position cap all follow it. `core/generator.ts` is the remaining 9x9-specific area (hardcoded digit count, hint bounds, and seed transforms).
