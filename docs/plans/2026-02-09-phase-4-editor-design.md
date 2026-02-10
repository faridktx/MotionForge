# Phase 4 Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Phase 4 undo-safe keyframe editing, timeline v2 tracks, axis-locked rotation gizmo, gizmo auto-scale, and required verification gates.

**Architecture:** Keep render loop Three-driven in viewport while React renders static timeline/state panels. Centralize animation mutations in `animationStore` and engine `ops` helpers so undo commands wrap atomic multi-key edits. Timeline v2 is decomposed into `TimelineV2`, `TrackList`, `TrackLane`, and dedicated selection/timeline stores.

**Tech Stack:** React + TypeScript + Zustand-like manual stores, Three.js viewport, Vitest for engine tests, pnpm workspace.

---

### Task 1: Engine keyframe ops with tests (TDD)

**Files:**
- Create: `packages/engine/src/animation/ops.ts`
- Create: `packages/engine/src/animation/ops.test.ts`
- Modify: `packages/engine/src/index.ts`

Steps:
1. Write failing tests for `removeKeyframes`, `moveKeyframes`, `setKeyframeValue`, normalization/ordering/clamp/batch-spacing.
2. Run targeted tests and confirm red.
3. Implement minimal ops with stable matching by object/property/time and normalize clip.
4. Re-run targeted tests to green.

### Task 2: Undo-capable animation store actions

**Files:**
- Modify: `apps/web/src/state/undoStore.ts`
- Modify: `apps/web/src/state/animationStore.ts`
- Create: `apps/web/src/state/keyframeSelectionStore.ts`
- Modify: `apps/web/src/state/timelineStore.ts` (create if absent)

Steps:
1. Add failing tests for animation store undo semantics if test harness exists; else rely on engine tests and precise manual checks.
2. Add compound command support in undo store (`do`/`undo` with legacy compatibility).
3. Refactor animation actions for keyframe insert/delete/move/value update/duration change with undo labels + optional source.
4. Ensure scrub updates are not pushed to undo.

### Task 3: Timeline v2 modular UI

**Files:**
- Create/modify: `apps/web/src/components/TimelineV2.tsx`
- Create: `apps/web/src/components/TrackList.tsx`
- Create: `apps/web/src/components/TrackLane.tsx`
- Modify: `apps/web/src/components/Timeline.tsx` (compat shim if needed)
- Modify: `apps/web/src/styles.css`

Steps:
1. Build split layout (left track list, right ruler/lanes).
2. Render per-property rows and keyed markers from selected object clip tracks.
3. Implement precise pointer interactions: scrub empty space, select keyframes, drag selected keys with snap+modifier, delete button/keys.
4. Add zoom control (`pixelsPerSecond`) and optional Ctrl+wheel.

### Task 4: Gizmo rotation axis lock + auto-scale

**Files:**
- Modify: `apps/web/src/lib/three/gizmo/Gizmo.ts`
- Modify: `apps/web/src/components/Viewport.tsx`
- Modify: `apps/web/src/lib/three/gizmo/math.ts` (if helper needed)
- Modify docs: `docs/ARCHITECTURE.md`, `docs/PROJECT_FORMAT.md`

Steps:
1. Implement rotation drag using axis plane intersection and quaternion delta around selected axis.
2. Preserve cancel behavior on Esc and single undo command on drag end.
3. Add camera-distance gizmo scaling with clamp each frame without rerendering React.
4. Optionally smooth `F` framing and timeline playhead label if low-cost.

### Task 5: Integration + strict verification gates

**Files:**
- Modify: any touched docs/changelog notes in repo docs

Steps:
1. Run `pnpm lint`.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Run `pnpm build`.
5. Run `pnpm gate`.
6. Stop immediately on first failing command, minimally patch, then restart gate sequence from step 1.
