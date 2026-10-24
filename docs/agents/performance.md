# Performance

Load when profiling solver throughput, touching the build/packaging pipeline, or re-running a benchmark. Records what has already been tried so it is not repeated blindly.

## Harness

- `debug.mjs` (repo root, gitignored scratch file) imports the **built** `packages/core/dist`, generates `newBoard(27, "probe-50")`, runs `solveAll` `WARMUP = 5000` + `MEASURED = 1000` times, and reports the average of the measured runs plus board/solution checks.
- `BENCH_DIST` selects the build root, so any candidate build can be measured without editing the probe: `$env:BENCH_DIST="./packages/core/dist-esbuild"; node debug.mjs`.
- Always `clean` before `build`: `tsc` does not delete stale output, so removing or renaming a source file leaves an orphaned module in `dist` that imports can still resolve to.
- Numbers below are from Node 24.22 on the development machine. Machine drift is ±1–2 µs between sessions, so compare variants **interleaved and in randomized order**, using a copy of the plain `dist` as a control in every session.

## Baseline

27-hint `probe-50`, fully warmed: **~58 µs per `solveAll`** (54 empty cells). The 2026-10 profile/typed-array session measured 60–61 µs for the same probe on the same machine, so treat a few µs of drift between sessions as normal and always compare against a control in the same session.

## Tried: esbuild bundling (2026-10)

Bundling the built `dist` JS (not the TS), 8–10 interleaved rounds per variant. Two sessions were run; every session included a copy of the plain `dist` as a control so drift is visible, and only comparisons **within** a session are meaningful.

| Variant                                                      | Median (µs) | vs control     |
| ------------------------------------------------------------ | ----------- | -------------- |
| `tsc` dist (control copy, identical files)                    | 58.2 – 59.5 | —              |
| `tsc` dist                                                    | 58.2 – 59.5 | 0              |
| esbuild `--bundle --splitting`, no minify                     | 55.1 – 55.8 | −4% to −7%     |
| esbuild `--bundle`, single file, no minify                    | 55.9        | −6%            |
| esbuild `--bundle --splitting --minify`                       | 54.7        | −6%            |
| single file + terser `passes=3,inline=3,reduce_funcs`         | 57.5        | −3%            |

Size: `tsc` 44.5 KB of JS → bundle 51.5 KB → minified 20.7 KB.

Conclusions:

- **The gain is packaging, not compilation.** esbuild performs no function inlining; flattening ~19 ESM modules into one scope removes cross-module indirection and shares monomorphic feedback/IC sites.
- **Minify is neutral** (+0–2%, inside noise). Identifier mangling also changes `fn.name` and stack traces, so it is not free.
- **Static inlining hurts.** Terser `inline=3` was ~3% *slower* than the identical bundle without inlining: V8 already inlines small functions, and larger functions consume its inlining budget and add deopt points.
- **Not adopted.** `@sudoku/core` keeps shipping per-module `tsc` output so consumers can tree-shake and chunk. Bundling belongs to the consuming app; a bundled subpath export is only justified for a non-bundling consumer (CLI, standalone script).

## Consumer context: Nuxt

- Nuxt/Vite (client, SSR render) treats `@sudoku/core` as source and bundles it, so a pre-bundled entry would be re-bundled and would lose tree-shaking and per-feature chunk splitting for no gain.
- Nitro externalizes dependencies in the production server build. If server-side solve/generate throughput ever matters, inline core there (`nitro.externals.inline`) instead of changing the package layout.
- `target: ES2025` output is downlevelled by Vite in `build`, but not in dev.

## Tried: `countSetBits` lookup table (2026-10)

Goal: replace the bit-clearing loop in `utils/bitwise.ts` with a precomputed count table for masks `0..1023` (candidate bits are 1..9, so the largest legal mask is `0b1111111110 = 1022`), falling back to the loop for longer masks. `Array`, `Uint8Array`, `Map`, and a Set-per-popcount encoding were compared.

### What the workload looks like

Instrumented built `countSetBits`, then ran `debug.mjs` on several probes (temporary copies with `HINTS`/`SEED` replaced; `debug.mjs` hardcodes both):

| Probe | Hints | Calls/solve | Max mask | Masks ≥ 1024 | Distinct masks | Max popcount | `mask === 0` |
| ----- | ----- | ----------- | -------- | ------------ | -------------- | ------------ | ------------ |
| probe-00 | 21 | 180 | 512 | 0 | 10 | 1 | 76% |
| probe-03 | 23 | 389 | 842 | 0 | 103 | 8 | 34% |
| probe-04 | 20 | 248 | 512 | 0 | 50 | 8 | 59% |
| probe-50 | 27 | 177 | 512 | 0 | 34 | 4 | 64% |

- The fallback never executes on any probe: masks are candidate/union masks over digits 1..9, capped at 1022 by `FULL_DIGIT_MASK`.
- The mask mix is sparse and low-popcount, and a third to three quarters of calls are `mask === 0`, which the current loop returns from immediately.

### Isolated op cost

Popcount inlined into the hot loop so call overhead does not hide the difference; 63.2M operations over the observed mask mix, median of 15 interleaved rounds:

| Implementation | ns/op | vs loop |
| -------------- | ----- | ------- |
| current bit-clearing loop | 1.147 | — |
| `Array(1024)`, no guard (invalid >1022) | 0.707 | −38% |
| `Uint8Array(1024)`, no guard (invalid >1022) | 0.701 | −39% |
| SWAR popcount | 1.306 | +14% |
| `Array(512)` with `mask >> 1` | 1.716 | +50% |
| `Uint8Array(1024)`, bounds check + fallback | 1.798 | +57% |
| `Array(1024)`, bounds check + fallback | 2.446 | +113% |
| `Map(1024)` | 4.763 | +315% |

A table only wins **unguarded**; the guard/fallback required for general 32-bit masks costs more than the loop it replaces. Halving the table with `mask >> 1` does not help.

### End-to-end

`debug.mjs` (6000 solves per run), paired per-round sampling so drift cancels; 120 rounds on probe-50, 80 on probe-03. Deltas are µs per `solveAll` ± 95% CI.

| Variant | probe-50 (base 58.8 µs) | probe-03 (base 71.4 µs) |
| ------- | ----------------------- | ----------------------- |
| `Array(1024)` guarded | −0.17 ± 0.27 (−0.29%, 60/120 faster) | **+0.76 ± 0.56 (+1.07%, 33/80 faster)** |
| `Uint8Array(1024)` guarded | +0.05 ± 0.39 (+0.09%) | — |
| `Uint8Array`, `hit === undefined` guard | +0.03 ± 0.36 (+0.06%, 58/120) | +0.13 ± 0.74 (+0.18%, 47/80) |
| `Array`, `hit === undefined` guard | +0.20 ± 0.38 (+0.34%, 57/120) | — |
| SWAR | −0.04 ± 0.32 (−0.08%, 65/120) | −0.14 ± 0.39 (−0.20%, 46/80) |
| `Uint8Array` pure, no guard (upper-bound control) | — | +0.05 ± 0.51 (+0.07%, 42/80) |
| `Array` pure, no guard (upper-bound control) | — | +0.36 ± 0.76 (+0.51%, 32/80) |

Even the unguarded upper-bound control shows no gain, and the guarded `Array` is significantly *slower* on probe-03. A `Set` cannot map mask → count at all; the only encoding is one Set per popcount, which needs up to 10 `has()` calls (≈ +1.7% end-to-end). `Map` is the worst of the real options.

Why there is nothing to win: at most 389 calls/solve × ~1.2 ns ≈ 0.5 µs out of 71 µs (≈ 0.7%), and the table access is not cheaper than the loop once the fallback guard exists.

**Not adopted.** Keep the loop. If it is ever revisited, use `Uint8Array(1024)` with `const hit = TABLE[mask]; return hit === undefined ? slow(mask) : hit` (typed arrays return `undefined` out of bounds, which also covers negative masks); that was the only neutral form. Do not use a plain `Array` with an explicit bounds check.

### Method notes

- `debug.mjs` prints whole µs (`formatDuration` uses `toFixed(0)`), so sub-percent deltas are invisible: run a temporary copy with `.toFixed(3)` µs, and always compare paired interleaved rounds.
- To iterate on one function, swap the compiled `countSetBits` inside `packages/core/dist/utils/bitwise.js` between runs instead of rebuilding `tsc` each time; restore the original (or run `clean` + `build`) afterwards.
- Reference harness: `variant-bench.mjs` and `micro-countsetbits-inlined.mjs` in the session temp directory (`%TEMP%\opencode`), not committed.

## Profiling the steady state (2026-10)

Method: a temp script imports the built `dist`, calls `newBoard(27, "probe-50")` once, warms 2 000 `solveAll` calls, then runs 20 000 more under `node --cpu-prof`. Self times below are from that run (20 000 solves ≈ 1.58 s, i.e. ~79 µs/solve with profiler overhead). `findFullHouse` does not appear separately because V8 inlined it into its wrapper.

| Function | Self | Share |
| -------- | ---- | ----- |
| `findFullHouses` (full-house scan over all 27 houses) | 488 ms | 30.9% |
| `findHiddenSinglesInHouse` | 268 ms | 16.9% |
| `applySimpleModifications` | 221 ms | 14.0% |
| `sanitizeCandidates` | 85 ms | 5.4% |
| `candidatesToDigitMasks` | 82 ms | 5.2% |
| `solveStep` (algorithm dispatcher) | 69 ms | 4.3% |
| `solveAll` (outer loop) | 57 ms | 3.6% |
| garbage collector | 45 ms | 2.8% |
| `findNakedSetsInHouse` | 38 ms | 2.4% |
| `findNakedSingles` | 33 ms | 2.1% |
| `findHiddenSinglesInHouses` (wrapper) | 33 ms | 2.1% |
| `findPointingPairsInBox` | 32 ms | 2.0% |

Everything else is < 1% each. Workload shape for this seed: 36 `solveStep` calls per solve (17 HiddenSingleBox, 13 FullHouse, 4 HiddenSingleLine, 1 NakedSingle, 1 PointingPairs). Claiming runs on the 35 steps where pointing pairs find nothing (0.4% of the profile); NakedSets and HiddenPair are only reached on the final, unsuccessful step, so their cost here is the one exhaustive pass, not steady work.

What this says:

- **The win is in scan shape, not storage.** ~50% of the profile is three hand-written per-house/per-cell scans (`findFullHouses` + `findHiddenSinglesInHouse` + its wrapper). `findFullHouses` alone re-scans all 27 houses on every step, even though steps that end in a different algorithm cannot benefit from the result.
- **Allocation is secondary.** GC is 2.8%, and `applySimpleModifications` (14%) is mostly object spread + 20-peer walks per placement rather than allocation pressure from small arrays.
- Only ~7% sits in the two generator paths (`candidatesToDigitMasks`, `findPointingPairsInBox`), which is why optimizing them (below) moved nothing.

## Tried: `Uint8Array` for index/mask storage (2026-10)

Motivation: every index list (`BOARD`, `ROWS`, `HOUSES`, `PEERS`, …) and every temporary scratch list holds values that fit in a byte, so typed arrays looked like free memory/cache wins. They are not.

### Locations reviewed

| Location | Contents | Verdict |
| -------- | -------- | ------- |
| `constants/coordinates.ts` — `BOARD`, `ROWS`, `COLUMNS`, `BOXES`, `LINES`, `HOUSES`, `PEERS`, `*_OF` | cell indices 0–80 | **tested: 5–7% slower** |
| `utils/board.ts` — `candidatesToDigitMasks` per-call `number[]` of candidate masks | 0–511 | **tested: neutral** |
| `utils/bitwise.ts` — `setBitIndices` result | bit positions 0–8 | not on this path (HiddenPair only); same shape as tested code, expect the same |
| `algorithms.ts` — `filterCellCandidates` result | cell indices | not on this path (Claiming only) |
| `common.ts` — `placed: number[]` | ≤ 9 entries, needs `includes()` | poor fit (no `includes` on typed arrays) |
| `core/generator.ts` — `ALL_INDICES`, `digitsOf`, `shuffleNumbers` | 0–80 / 1–9 | not measured by `debug.mjs` (generation happens once, outside the timed loop) |
| `utils/bitwise.ts` — `resolveCandidates` outputs | public API, render-only | out of scope: exported API |

### Stage 1 — all coordinate lists → `Uint8Array`

`type Indices = Uint8Array`, builders rewritten with `Array.from`/`TypedArray#filter`, `getUnit` widened from `readonly T[]` to `ArrayLike<T>` (needed because typed arrays are not arrays), and the affected finder/applier return types moved from `readonly number[]` to `Indices`. Behaviour identical: all 91 tests pass, `debug.mjs` checks pass.

| Measurement | `number[]` | `Uint8Array` | Delta |
| ----------- | ---------- | ------------ | ----- |
| `debug.mjs`, 3 runs of the 6000-solve probe | 60–61 µs | 64 µs | **+5% to +7%** |
| paired A/B, 20 interleaved rounds, 50 solves/round | 60.5 µs | 64.7 µs | **+6.9%** |
| paired A/B with control/variant swapped | 64.4 µs | 59.4 µs | **+7.7%** (same direction) |

### Stage 2 — `candidatesToDigitMasks` scratch → shared `Uint16Array(9)`

Coordinate lists reverted; only the per-call mask array replaced by a module-level scratch (masks need 9 bits, so `Uint16Array`, not `Uint8Array`). Paired A/B, 20 rounds: median 58.7 → 58.3 µs (−0.7%), swapped 60.1 → 59.8 µs (−0.5%). Neutral, and it introduces shared mutable state, so not worth it.

### Isolated op cost

Same access pattern as the solver (for-of and indexed scan over 27 nine-element lists with an indirect `board[index]` lookup), each variant in its own process so type feedback is not polluted, median of 11 rounds, 100 k scans per round:

| Loop | `number[]` | `Uint8Array` |
| ---- | ---------- | ------------ |
| `for...of` | 28.2 ms | 33.1 ms (+17%) |
| indexed `for` | 26.0 ms | 28.4 ms (+9%) |

### Why typed arrays lose

Packed SMI arrays are already unboxed for small integers, so there is no boxing to remove at 9–20 elements, while `Uint8Array` reads go through a bounds-checked typed-array path that V8 does not optimize as well. Typed arrays pay off for large buffers and arithmetic-heavy loops, not for 9-element index lists read through an object array.

**Not adopted.** Keep the plain `number[]` constants and scratch lists. The only typed-array change with real upside would be a structure-of-arrays `Board` (`Uint8Array` values + `Uint16Array` candidates instead of 81 `Cell` objects), which changes the exported `Board`/`Cell` contract, the copy-on-write cell-reuse model in `sanitizeCandidates`/`removeCandidate`, and every finder signature — treat it as a separate design decision, not a micro-optimization.

### Method notes

- Isolate variants in **separate processes** when microbenchmarking: warming one function on `number[]` and then handing it a `Uint8Array` deopts it, and the second number reads as a huge regression. Both `debug.mjs` runs and the paired harness must load only one representation per function.
- The paired harness loads baseline and variant `dist` copies into one process (variant copied next to `packages/core` so `seedrandom` still resolves), generates the same seed from each build, warms both, then alternates measurement order each round.
- Both stage patches were applied with `git apply` from temp and reverted with `git checkout -- packages/core/src`; the tree is unchanged.

## Not tried yet

- The CPU profile now exists (see above); the next step is `--trace-opt` / `--trace-deopt` on the top three functions to see whether `findFullHouses`, `findHiddenSinglesInHouse` and `applySimpleModifications` are actually being optimized, and whether `Cell` objects stay monomorphic.
- Hot-loop code shape is where the remaining time is, not packaging: skipping the 27-house full-house scan on steps that will not use it, avoiding the `{ ...cell }` spread in `applySimpleModifications`, and reducing per-step board copies are the obvious candidates. Measure each against a control copy of `dist` in the same session, as above.
- V8 compile cache (`module.enableCompileCache()`, `NODE_COMPILE_CACHE`) and `--build-snapshot` only affect startup, not steady-state solving.
- WASM/native (Rust `wasm-bindgen`, `napi-rs`) if throughput ever becomes a real requirement.

## Reproduce

```bash
pnpm --filter @sudoku/core run clean
pnpm --filter @sudoku/core run build
node debug.mjs

# bundled variant
pnpm dlx esbuild packages/core/dist/index.js packages/core/dist/constants/coordinates.js \
  --bundle --splitting --format=esm --platform=node --target=node22 \
  --outbase=packages/core/dist --outdir=packages/core/dist-esbuild --minify
```

Then point the probe at it: `BENCH_DIST=./packages/core/dist-esbuild node debug.mjs` (PowerShell: `$env:BENCH_DIST="./packages/core/dist-esbuild"`).

Profiling the steady state (warm first, or the profile is mostly `newBoard`):

```js
// profile-target.mjs, run with: node --cpu-prof --cpu-prof-dir=%TEMP%\prof profile-target.mjs <abs dist path>
const DIST = process.argv[2];
const { newBoard, solveAll } = await import(`file:///${DIST.replaceAll("\\", "/")}/index.js`);
const { puzzle } = newBoard(27, "probe-50");
for (let i = 0; i < 2000; i++) solveAll(puzzle);
for (let i = 0; i < 20000; i++) solveAll(puzzle);
```

Aggregate `samples`/`timeDeltas` in the `.cpuprofile` by `callFrame`, then sort by self time; the temp analyzer and the paired A/B harness used above are not committed.
