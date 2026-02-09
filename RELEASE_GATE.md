# Release Gate

All of the following must pass before any merge to main.

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

## Pass Criteria

- Exit code 0 from `pnpm gate`
- No skipped or pending tests
- No TypeScript errors
- No ESLint errors

## Running Individual Checks

```bash
pnpm lint          # Lint only
pnpm typecheck     # Type check only
pnpm test          # Tests only
pnpm build         # Build only
```
