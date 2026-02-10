# Release Gate

All of the following must pass before any merge to main.

## Phase 5 Expectations

1. `pnpm gate` must pass.
2. `pnpm mcp:build` must pass.
3. MCP contract tests must pass (`pnpm -C packages/mcp test -- contract.test.ts`).
4. `docs/DEMO_SMOKE.md` manual script must pass.
5. `docs/MCP.md` usage flow must remain accurate.
6. Agent planner tests must pass (`pnpm -C packages/agent test`).
7. Unity package export contract must pass via MCP contract suite.
8. Web-layer store tests must pass (`apps/web` vitest suite).
9. Engine schema and animation operation tests must pass (`packages/engine` vitest suite).
10. Import/export reliability and undo/redo behaviors must be validated by both automated tests and manual smoke.
11. Pipeline gate must pass:
   - preview-only CLI run returns `MF_ERR_CONFIRM_REQUIRED` and writes `proof.json`
   - confirmed CLI run writes `project.json`, `motionforge-bundle.zip`, `motionforge-manifest.json`, and `proof.json`
12. Unity import verification checklist in `docs/UNITY_VERIFY.md` must be runnable and up to date.

## Gate Command

```bash
pnpm gate
pnpm mcp:build
pnpm -C packages/mcp motionforge make-bundle --in apps/web/public/demo/motionforge-takes-demo.json --goal "idle loop then recoil" --unity --out .motionforge/ci-preview
pnpm -C packages/mcp motionforge make-bundle --in apps/web/public/demo/motionforge-takes-demo.json --goal "idle loop then recoil" --unity --out .motionforge/ci-apply --confirm
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
- Currently covers: `packages/engine`, `packages/agent`, `packages/mcp`, `apps/web`

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

### 7. MCP Contract Test

- Run `pnpm -C packages/mcp test -- contract.test.ts`
- Validates tool surface + stdio framing + staged load semantics

### 8. Pipeline Gate Check

- Run preview-only pipeline command (without `--confirm`)
- Expect exit code `2` and `MF_ERR_CONFIRM_REQUIRED`
- Validate preview proof artifact exists:
  - `.motionforge/ci-preview/proof.json`
- Run confirmed pipeline command (with `--confirm`)
- Validate artifacts exist:
  - `.motionforge/ci-apply/project.json`
  - `.motionforge/ci-apply/motionforge-bundle.zip`
  - `.motionforge/ci-apply/motionforge-manifest.json`
  - `.motionforge/ci-apply/proof.json`

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
