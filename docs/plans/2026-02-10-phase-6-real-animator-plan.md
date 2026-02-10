# Phase 6 Real Animator Implementation Plan

> **For Implementer:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade timeline/editor UX to support multi-object workflows, richer keyframe editing operations, and expanded interpolation while preserving performance and backward compatibility.

**Architecture:** Keep Three.js render loop unchanged; extend timeline data/store and keyframe operations in incremental layers. Reuse existing animationStore undo command pattern for all timeline edit actions. Extend engine interpolation enum/evaluation in a backward-compatible way.

**Tech Stack:** React + TypeScript, custom stores, @motionforge/engine, Vitest/jsdom.

---

### Task 1: Subtask 6.1 multi-object timeline groups

**Files:**
- Modify: `apps/web/src/state/timelineStore.ts`
- Modify: `apps/web/src/components/TimelineV2.tsx`
- Modify: `apps/web/src/components/TrackList.tsx`
- Modify: `apps/web/src/styles.css`

Steps:
1. Add timeline visibility/collapse UI state in timelineStore.
2. Render object groups for all objects with animation tracks, default collapsed except selected object.
3. Add eye toggle per object (UI-only hidden).
4. Run full strict verification order.

### Task 2: Subtask 6.2 per-property/per-axis lanes

**Files:**
- Modify: `apps/web/src/components/TimelineV2.tsx`
- Modify: `apps/web/src/components/TrackList.tsx`
- Modify: `apps/web/src/components/TrackLane.tsx`
- Modify: `apps/web/src/styles.css`

Steps:
1. Replace simple rows with nested object/property/axis rows.
2. Bind markers to exact axis lane.
3. Select keyframe by lane+marker.
4. Run full strict verification order.

### Task 3: Subtask 6.3 multi-select and box select

**Files:**
- Modify: `apps/web/src/components/TimelineV2.tsx`
- Modify: `apps/web/src/state/keyframeSelectionStore.ts`
- Add tests: `apps/web/src/state/keyframeSelectionStore.test.ts`, update `apps/web/src/state/animationStore.test.ts`

Steps:
1. Add box selection interaction state and rectangle overlay.
2. Ensure shift-toggle and marquee selection coexist.
3. Verify delete performs single undo command.
4. Add tests for selection correctness + delete undo restore all.
5. Run full strict verification order.

### Task 4: Subtask 6.4 copy/paste and nudge

**Files:**
- Modify: `apps/web/src/state/animationStore.ts`
- Modify: `apps/web/src/components/TimelineV2.tsx`
- Add/update tests: `apps/web/src/state/animationStore.test.ts`

Steps:
1. Add copy payload builder and paste-at-playhead operation preserving offsets.
2. Add alt+arrow nudge shortcuts and undo integration.
3. Add tests for copy/paste and nudge undoability.
4. Run full strict verification order.

### Task 5: Subtask 6.5 interpolation modes expansion

**Files:**
- Modify: `packages/engine/src/animation/types.ts`
- Modify: `packages/engine/src/animation/evaluate.ts`
- Modify: `packages/engine/src/animation/evaluate.test.ts`
- Modify: `packages/engine/src/animation/ops.ts`
- Modify: `packages/engine/src/projectSchema.ts`
- Modify: `apps/web/src/components/TimelineV2.tsx`
- Modify docs: `docs/PROJECT_FORMAT.md`, `docs/DEMO_SMOKE.md`

Steps:
1. RED: add engine tests for easeIn/easeOut/easeInOut behavior.
2. GREEN: implement interpolation curves and type/schema support.
3. Update interpolation dropdown in timeline editor.
4. Update manual smoke + docs for new timeline UX.
5. Run full strict verification order.
