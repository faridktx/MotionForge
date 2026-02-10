# Demo Smoke Script (10 Minutes)

Use this script before demos or recordings. It validates the core editor loop end-to-end.

## Preconditions

1. Run `pnpm -C apps/web dev`.
2. Open `http://127.0.0.1:5173/`.
3. Start from a clean project (`New` in top bar).

## Script

### 1) Atomic key insert undo/redo (90s)

1. Select `Cube` in Hierarchy.
2. In Timeline, set playhead to `0.00`.
3. Press `K` once.
4. Scrub to `1.00`, move cube with gizmo, press `K` once again.
5. Press `Ctrl+Z` once: keys inserted in the last `K` action should disappear together.
6. Press `Ctrl+Y` once: keys should return together.

Expected: key insertion from `K` is one atomic undoable action.

### 2) Timeline drag move undo/redo (90s)

1. Click a key marker in timeline.
2. Drag it right by about `0.5s`.
3. Press `Ctrl+Z`.
4. Press `Ctrl+Y`.

Expected: moved key returns to exact old time on undo and exact new time on redo.

### 2b) Multi-object timeline groups and eye toggle (45s)

1. Add at least one keyframe on two different objects (for example `Cube` and `Sphere`).
2. Open timeline and verify both objects appear as separate groups.
3. Confirm selected object is expanded automatically.
4. Click eye icon on one object.

Expected: hidden object tracks are removed from lane view (UI only, animation data preserved).

### 2c) Per-axis lane validation (45s)

1. Expand one object group in timeline.
2. Confirm `Position`, `Rotation`, `Scale` each show `X`, `Y`, `Z` lanes.
3. Click a key marker in an axis lane.

Expected: selection corresponds to that exact axis lane keyframe.

### 3) Delete keyframe undo/redo (60s)

1. Click one or more keyframes.
2. Press `Delete`.
3. Press `Ctrl+Z`.
4. Press `Ctrl+Y`.

Expected: deleted keys restore with same time/value/interpolation on undo.

### 3b) Box select keyframes (45s)

1. In timeline lane area, click-drag a rectangle across multiple nearby key markers.
2. Press `Delete`.
3. Press `Ctrl+Z`.

Expected: all boxed keys are selected/deleted together; undo restores entire selection.

### 4) Edit keyframe value affects playback (90s)

1. Select one keyframe.
2. In keyframe editor, change `Value`.
3. Press `Space` to play.

Expected: object motion visibly changes versus previous curve.

### 4b) Copy/paste and nudge (60s)

1. Select one or more keyframes.
2. Press `Ctrl+C`, move playhead, press `Ctrl+V`.
3. Press `Alt+ArrowRight` once, then `Ctrl+Z`.

Expected: pasted keys preserve relative spacing; nudge moves selected keys by a small delta and undo restores.

### 4c) Interpolation modes (45s)

1. Select one keyframe in any axis lane.
2. In keyframe editor, change `Interp` to `Ease In Out`.
3. Play timeline and observe easing shape (slower start/end than linear).
4. Press `Ctrl+Z`, then `Ctrl+Y`.

Expected: interpolation changes are undoable and playback curve reflects selected mode (`linear`, `step`, `easeIn`, `easeOut`, `easeInOut`).

### 5) Save/export + refresh/import restore (120s)

1. Click `Save`.
2. Click `Export` and keep file.
3. Refresh browser tab.
4. Click `Load` (localStorage path).
5. Click `Import` and pick exported file.

Expected: scene + keyframes are restored both by Load and Import.

### 6) Rotation axis lock consistency (90s)

1. Press `E` (rotate mode).
2. Drag `X` ring: verify rotation is around X axis only.
3. Repeat for `Y` and `Z`.
4. Start drag and press `Esc`.

Expected: axis behavior is consistent and `Esc` cancels active drag.

### 7) Gizmo auto-scale on zoom (45s)

1. Select object with gizmo visible.
2. Zoom camera in/out aggressively.

Expected: gizmo remains readable; handle size scales with camera distance.

### 8) Dirty badge behavior (45s)

1. Make any keyframe edit (add/move/delete/value).
2. Confirm top bar shows `Unsaved`.
3. Click `Save`.

Expected: `Unsaved` appears after edit and clears after successful save.

## Known Failure Symptoms

1. `K` inserts keys but undo removes only one axis:
   - Check atomic keying path in `apps/web/src/state/animationStore.ts`.
   - Ensure command label is `Keyframe Transform` and pushed once.
2. Timeline drag visually moves keys but undo does nothing:
   - Check move command creation in `apps/web/src/components/TimelineV2.tsx`.
   - Verify `undoStore.canUndo()` changes after drag.
3. Delete removes keys permanently after undo:
   - Check `removeKeyframes` op in `packages/engine/src/animation/ops.ts`.
   - Validate key metadata roundtrip in web store tests.
4. Import file clears scene or crashes:
   - Check validation path in `apps/web/src/lib/project/serialize.ts` and `TopBar.tsx`.
   - Import should fail with toast and keep current project.
5. Rotation feels screen-space instead of axis-locked:
   - Check rotate plane + quaternion delta logic in `apps/web/src/lib/three/gizmo/Gizmo.ts`.
6. Gizmo too tiny/huge at zoom extremes:
   - Check clamp constants in `Gizmo.syncPosition()` auto-scale calculation.
7. Unsaved badge not clearing:
   - Check save flow and `sceneStore.clearDirty()` invocation in top-bar save action.
8. Playback appears static:
   - Confirm there are at least two keyframes at different times/values.
   - Verify playhead moves and `Space` toggles playback.
