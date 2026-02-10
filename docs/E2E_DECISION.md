# E2E Smoke Decision (Phase 5)

## Decision

`Playwright` E2E is intentionally not added in this phase.

## Why

The repo currently has no browser-test runtime wiring, no stable deterministic selectors designed for long E2E flows, and no dedicated CI browser setup. Adding all of this now would increase dependency footprint and maintenance cost more than the incremental confidence gain for this release pass.

## Compensating Coverage

1. Manual scripted verification in `/Users/faridabbasov/dev/MotionForge/docs/DEMO_SMOKE.md` (10-minute exact flow).
2. Engine-level animation operation tests in `/Users/faridabbasov/dev/MotionForge/packages/engine/src/animation/ops.test.ts`.
3. Web-layer store tests in `/Users/faridabbasov/dev/MotionForge/apps/web/src/state/animationStore.test.ts` covering:
   - undoable move semantics
   - delete undo metadata restoration
   - atomic keying and single-step undo
   - dirty-state transitions and save clear behavior

## Revisit Trigger

Add E2E when we need PR-level cross-browser interaction checks or when flaky regressions appear in manual smoke despite unit coverage.
