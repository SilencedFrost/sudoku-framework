# Domain model, constants, and shared utilities

Load when changing board shape, candidate masks, constants, errors, or `utils/`.

## Board model

- A `Board` is a `Cell[]` of exactly **81** cells; `Cell = { value: number | null; candidates: number }`.
- Indexing is **0-based and row-major**: `index = row * 9 + column`.
- Candidate bits 1..9 represent digits 1..9: `indexToMask(digit) = 1 << digit`. Bit 0 is reserved/normalized off. Do not shift by `digit - 1` in solver-facing code.
- `FULL_DIGIT_MASK` (in `constants/bitwise.ts`) is every candidate bit (bits 1..9).
- In solver-facing boards, a solved cell normally has `candidates === indexToMask(value)`; `sanitizeCandidates` enforces this.
- An unsolved cell with `candidates === 0` is illegal and throws `IllegalStateError` (`NO_CANDIDATES`).
- Generated boards use a different candidate convention; see [generator.md](generator.md).

## Immutability and application helpers

- Solvers, finders, and appliers mutate nothing. They take a `Board`, return a new one, and reuse unchanged `Cell` objects by reference.
- `removeCandidate` returns solved/clean cells unchanged; callers must never leave an unsolved cell with zero candidates.
- Placement and elimination composition rules live in [solver.md](solver.md#placements-and-eliminations).

## Constants

- `constants/coordinates.ts` exports `BOARD` (all 81 indices), unit lists `ROWS`, `COLUMNS`, `BOXES`, `LINES` (rows + columns), `HOUSES` (rows + columns + boxes), `PEERS`, and precomputed cell→unit maps (`ROW_OF`, `BOX_OUTSIDE_ROW_OF`, …).
  - `ROW_OUTSIDE_BOX_OF` / `COLUMN_OUTSIDE_BOX_OF`: outside-box line members used by pointing pairs.
  - `BOX_OUTSIDE_ROW_OF` / `BOX_OUTSIDE_COLUMN_OF`: outside-line box members used by claiming.
- `constants/algorithms.ts`: `ALGORITHM_SCORE` is the single registry of algorithm names and difficulty scores; the `Algorithm` type is derived from its keys.
- `constants/board.ts`: `UNIT_SIZE`, `HOUSE_SIZE`.
- Unit/peer constants are precomputed at module load; prefer them over recomputing row/column/box math. `BOARD` is also the board-level naked-single scan order.
- These lists stay plain `number[]`: `Uint8Array` was measured and is 5–7% slower in the solver's loops. See [`performance.md`](performance.md) before changing their representation.

## Pitfalls

- `ROW_MASKS` / `COL_MASKS` / `LINE_MASKS` are **9-bit positional masks for a box layout**, not 81-cell masks.
- `candidatesToDigitMasks` yields `{ digit, mask }` where `mask` is a **position mask**: bit `j` is the `j`-th index of the supplied list, not a cell index.
- `candidatesToDigitMasks` yields nothing when every digit 1..9 already appears as a value in the unit (`eligible === 0`). Callers must tolerate an empty generator.
- `sanitizeCandidates(board, rebuild = false)` trusts the caller's candidates when `rebuild` is false; pass `true` to rebuild from values. Either mode throws `NO_CANDIDATES` if an unsolved cell ends up empty.
- `getUnit` throws `RangeError` for an out-of-range index. With `noUncheckedIndexedAccess`, use `getUnit` or `??` instead of unchecked indexing.
- `IllegalStateError` carries a code from `IllegalStateError.Code`: `NO_CANDIDATES`, `ILLEGAL_NAKED_COUNT`, `ILLEGAL_HIDDEN_COUNT`. Use `RangeError` for bad indices/lengths/hint counts, not plain `Error`.
- Remaining 9x9 assumptions live in `constants/coordinates.ts`, `constants/bitwise.ts`, `utils/bitwise.ts` (`resolveCandidates` hardcodes 9), `utils/board.ts` (`sanitizeCandidates` hardcodes 81/`PEERS`; `candidatesToDigitMasks` loops 1..9), and `core/generator.ts`.
