# AGENTS.md

Entry point for agents working in this repository. Read this file first, then load only the domain doc(s) relevant to the task.

## Snapshot

`sudoku-framework` is a pnpm monorepo with one package, `@sudoku/core`. There is no README.

- Node >= 22.13, pnpm 11 (`pnpm@11.15.1`), ESM, TypeScript ~6.0.3 (`NodeNext`, strict), Vitest.
- Lint/typecheck: ESLint 10 + typescript-eslint (`strictTypeChecked`, `stylisticTypeChecked`), `tsc --noEmit`. Unused-code check: Knip.
- Generator randomness: `seedrandom`.
- Public API (`packages/core/src/index.ts`): `resolveCandidates`, `solveStep`, `solveAll`, `newBoard`, `sanitizeCandidates`, `Cell`, `Board`.

## Commands

Run from the repository root:

```bash
pnpm install          # install workspace deps
pnpm test             # vitest in every package
pnpm typecheck        # tool configs + every package
pnpm lint             # eslint .
pnpm lint:fix         # eslint . --fix
pnpm build            # tsc build in every package
pnpm knip             # unused files/exports/deps
pnpm clean            # remove build output
```

Per package: `pnpm --filter @sudoku/core test|typecheck|build`.

Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before finishing.

## Always apply

- **Board shape:** 81 cells, 0-based row-major (`index = row * 9 + column`); candidate bits 1..9 represent digits 1..9 (`1 << digit`).
- **Immutability:** solver, finder, and applier code never mutates the input board or its cells; return a new board and reuse unchanged `Cell` objects.
- **Find/apply split:** keep pure `findX` detection separate from `solveX` application; do not collapse them.
- **Imports/style:** ESM with explicit `.js` extensions; `import type` for types; explicit return types on exports; prefer `readonly`.
- **Errors:** `RangeError` for bad indices/lengths/hint counts, `IllegalStateError` for contradictory boards; avoid plain `Error`.
- **Public API:** exposed only through `packages/core/src/index.ts`.
- **Uncertainty:** route ambiguities, conflicting instructions, and design choices to the user via the `question` tool instead of guessing.

## Load on demand

| If the task touches...                                          | Read                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| Board shape, candidate masks, constants, shared utils           | [`docs/agents/domain.md`](docs/agents/domain.md)       |
| Solver algorithms, `solveStep`, find/apply, adding an algorithm | [`docs/agents/solver.md`](docs/agents/solver.md)       |
| `newBoard` or generator behavior                                | [`docs/agents/generator.md`](docs/agents/generator.md) |
| Difficulty rating or grader contracts                           | [`docs/agents/grader.md`](docs/agents/grader.md)       |
| Tests and coverage expectations                                 | [`docs/agents/testing.md`](docs/agents/testing.md)     |
| Build config, workspace, repo layout, tooling                   | [`docs/agents/tooling.md`](docs/agents/tooling.md)     |
| Throughput benchmarks, profiling, packaging against speed       | [`docs/agents/performance.md`](docs/agents/performance.md) |

When behavior changes, update the matching domain doc. Keep this file short; details belong in `docs/agents/`.
