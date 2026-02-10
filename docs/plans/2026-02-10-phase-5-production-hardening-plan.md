# Phase 5 Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden MotionForge for demo-safe and resume-safe delivery with robust validation, tests, UI polish, and CI gate readiness.

**Architecture:** Keep existing modular stores and Three-driven viewport architecture intact. Add targeted web-layer tests around store behavior, strengthen schema validation in engine with detailed error reporting, and apply scoped UI polish and documentation updates without broad refactors.

**Tech Stack:** pnpm workspace, React + TypeScript, Three.js, Vitest/jsdom, GitHub Actions.

---

### Task 1: Subtask 5.1 Demo smoke script

**Files:**
- Create: `/Users/faridabbasov/dev/MotionForge/docs/DEMO_SMOKE.md`

Steps:
1. Write exact 10-minute manual script covering A-H required workflows.
2. Add known failure symptoms and debugging pointers.
3. Run full verification order.

### Task 2: Subtask 5.2 Web-layer unit tests for undo/keyframes/dirty

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/package.json`
- Create: `/Users/faridabbasov/dev/MotionForge/apps/web/src/state/animationStore.test.ts`
- Create/modify any minimal test setup files if needed.

Steps:
1. RED: add failing tests for move/delete/atomic keying/dirty-save behavior.
2. GREEN: add minimal adapters if required for save-clear testability.
3. Verify tests pass and run full verification order.

### Task 3: Subtask 5.3 E2E smoke decision

**Files:**
- Optional create: E2E config/spec if added
- Or update docs if skipped

Steps:
1. Evaluate footprint and runtime requirements.
2. If skipped, document rationale + compensating tests.
3. Run full verification order.

### Task 4: Subtask 5.4 Lint warning removal

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/components/Viewport.tsx`
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/App.tsx`
- Optional create: `/Users/faridabbasov/dev/MotionForge/apps/web/src/state/gizmoModeStore.ts`

Steps:
1. Remove dual export pattern triggering react-refresh warning.
2. Keep behavior unchanged.
3. Run full verification order.

### Task 5: Subtask 5.5 UI readability pass

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/styles.css`
- Modify relevant components for hints/labels only as needed.

Steps:
1. Improve spacing/readability for timeline/inspector/hierarchy/topbar.
2. Add subtle shortcut hints and ensure 1280x720 stability.
3. Run full verification order.

### Task 6: Subtask 5.6 Walkthrough alignment

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/components/WalkthroughModal.tsx`

Steps:
1. Align all documented shortcuts to actual behavior.
2. Add troubleshooting section.
3. Run full verification order.

### Task 7: Subtask 5.7 Persistence/schema hardening

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/packages/engine/src/projectSchema.ts`
- Modify: `/Users/faridabbasov/dev/MotionForge/packages/engine/src/projectSchema.test.ts`
- Modify: `/Users/faridabbasov/dev/MotionForge/packages/engine/src/index.ts`
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/lib/project/serialize.ts`
- Modify: `/Users/faridabbasov/dev/MotionForge/apps/web/src/components/TopBar.tsx`

Steps:
1. RED: add failing schema edge-case tests.
2. GREEN: implement detailed validation and sane-range checks.
3. Use validation on import with human-readable toast errors and no destructive load.
4. Run full verification order.

### Task 8: Subtask 5.8 Release gate + CI

**Files:**
- Modify: `/Users/faridabbasov/dev/MotionForge/RELEASE_GATE.md`
- Create: `/Users/faridabbasov/dev/MotionForge/.github/workflows/gate.yml`
- Optional modify: package scripts if adding test:e2e.

Steps:
1. Update release documentation with Phase 5 expectations + manual script reference.
2. Add minimal GitHub Actions gate workflow for PRs.
3. Run full verification order (and e2e command only if implemented).
