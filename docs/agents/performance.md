# Performance

Load when profiling solver throughput, touching hot paths, or changing packaging. Measure before optimizing: the solver is scan-bound, not allocation- or storage-bound.

## Harness

- `debug.mjs` (repo root, gitignored scratch file) imports the **built** `packages/core/dist`, generates `newBoard(27, "probe-50")`, runs `solveAll` `WARMUP = 5000` + `MEASURED = 1000` times, and reports the average of the measured runs plus board/solution checks.
- `BENCH_DIST` selects the build root: `$env:BENCH_DIST="./packages/core/dist-esbuild"; node debug.mjs`.
- Always `clean` before `build`: `tsc` does not delete stale output, so a removed or renamed source file leaves an orphaned module in `dist`.
- Numbers are from Node 24.22 on the development machine. Drift is ±1–2 µs between sessions, so compare variants **interleaved and in randomized order**, with a control copy in every session.

## Baseline

27-hint `probe-50`, fully warmed: **~59 µs per `solveAll`** (54 empty cells). Workload: 36 `solveStep` calls — 16 HiddenSingleBox, 13 FullHouse, 5 HiddenSingleLine, 1 NakedSingle, 1 PointingPairs.

## Profile

Self time on `probe-50` (20 000 solves; includes one startup `newBoard` call, which is ~3% of samples and not steady state):

| Function | Self |
| --- | --- |
| `solveStep` (includes the inlined full-house scan) | 30.8% |
| `findHiddenSinglesInHouse` | 19.2% |
| `applySimpleModifications` | 13.5% |
| `sanitizeCandidates` | 6.1% |
| `findHiddenSetsInHouse` | 3.3% |
| GC | 3.2% |
| `candidatesToDigitMasks` | 2.0% |
| `findNakedSetsInHouse` | 1.8% |
| `findConfinedEliminations` | 1.5% |

What this says:

- **The win is in scan shape.** About half the profile is the full-house and hidden-single scans; `solveStep` re-scans all 27 houses for full house on every step even when another algorithm wins.
- **Allocation is secondary.** GC is ~3%; `applySimpleModifications` is mostly object spread plus peer walks per placement.
- Sets and claiming only run on late/unsuccessful steps, so their cost is low here.

## Decisions

- **Ship unbundled per-module `tsc` output.** Bundling measured ~4–7% faster and minifying was neutral, but the gain is from flattening modules, not compilation. Consumers bundle anyway (Nuxt/Vite treats `@sudoku/core` as source), so a bundled entry would lose tree-shaking and chunk splitting. Static inlining was ~3% *slower* than the same bundle.
- **Keep the `countSetBits` bit-clearing loop.** A `0..1023` lookup table only wins unguarded; the guard/fallback needed for general masks costs more than the loop. The theoretical ceiling is <1% of a solve.
- **Keep coordinate lists and scratch lists as plain `number[]`.** `Uint8Array` was 5–7% slower for 9–20-element index lists read through a `Cell[]`; packed SMI arrays are already unboxed. A structure-of-arrays `Board` would be a separate contract change, not a micro-optimization.
- **Hidden sets share `getMinimalHallSets`.** Size 2 uses a dedicated identical-mask count; a forced size 3 skips the pair pass and relies on `rejectNested`, which measured cheaper than searching pairs first.
- Nitro externalizes dependencies in production server builds. If server-side solve throughput matters, inline core there (`nitro.externals.inline`) rather than changing the package layout.

## Next candidates

- Run `--trace-opt` / `--trace-deopt` on the top three functions and check whether `Cell` objects stay monomorphic.
- Skip the 27-house full-house scan on steps where it cannot win; avoid the `{ ...cell }` spread in `applySimpleModifications`; reduce per-step board copies.
- Measure each against a control copy of `dist` in the same session.

## Reproduce

```bash
pnpm --filter @sudoku/core run clean
pnpm --filter @sudoku/core run build
node debug.mjs
```

Profiling (warm first, or the profile is mostly `newBoard`):

```js
// profile-target.mjs, run with: node --cpu-prof --cpu-prof-dir=%TEMP%\prof profile-target.mjs
// Use the absolute path to packages/core/dist/index.js.
const DIST = "<repo>/packages/core/dist";
const { newBoard, solveAll } = await import(`file:///${DIST.replaceAll("\\", "/")}/index.js`);
const { puzzle } = newBoard(27, "probe-50");
for (let i = 0; i < 2000; i++) solveAll(puzzle);
for (let i = 0; i < 20000; i++) solveAll(puzzle);
```

Aggregate `samples` by `callFrame` and sort by self time.
