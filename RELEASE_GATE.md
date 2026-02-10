# Release Gate

All of the following must pass before any merge to main.

## Phase 5 Expectations

1. `pnpm gate` must pass.
2. Manual smoke run must pass using `/Users/faridabbasov/dev/MotionForge/docs/DEMO_SMOKE.md`.
3. Web-layer store tests must pass (`apps/web` vitest suite).
4. Engine schema and animation operation tests must pass (`packages/engine` vitest suite).
5. Import/export reliability and undo/redo behaviors must be validated by both automated tests and manual smoke.

## Gate Command

```bash
pnpm gate
```

This runs the following checks in order, stopping on first failure:

### 1. Lint (`pnpm lint`)

- ESLint with TypeScript and React rules
- Zero errors required, warnings allowed
- Config: `eslint.config.js` (flat config)

### 2. Typecheck (`pnpm typecheck`)

- Runs `tsc --noEmit` in every workspace package
- Strict mode enabled
- Zero errors required

### 3. Test (`pnpm test`)

- Runs Vitest in all packages that define a `test` script
- All tests must pass
- Currently covers: `packages/engine`

### 4. Build (`pnpm build`)

- Builds all packages (TypeScript compilation) and the web app (Vite production build)
- Zero errors required
- Build output goes to `dist/` in each package

### 5. Gate (`pnpm gate`)

- Runs lint, typecheck, test, build in one command
- Primary CI status check

### 6. Optional E2E (`pnpm test:e2e`)

- Run only when an E2E suite exists in the repo
- Current status: intentionally not configured (see `/Users/faridabbasov/dev/MotionForge/docs/E2E_DECISION.md`)

## Pass Criteria

- Exit code 0 from `pnpm gate`
- No skipped or pending tests
- No TypeScript errors
- No ESLint errors
- Manual smoke script completed with no blocking failures

## Running Individual Checks

```bash
pnpm lint          # Lint only
pnpm typecheck     # Type check only
pnpm test          # Tests only
pnpm build         # Build only
pnpm gate          # Full automated gate
```
