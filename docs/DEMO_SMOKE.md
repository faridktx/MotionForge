# Demo Smoke Script (10 Minutes)

Use this script before demos or recordings. It validates the core editor loop end-to-end.

## Preconditions

1. Run `pnpm -C apps/web dev`.
2. Open `http://127.0.0.1:5173/`.
3. Start from a clean project (`New` in top bar).

## Script

### 0) First-run onboarding (45s)

1. Clear `localStorage` for the app origin.
2. Reload app.
3. Confirm onboarding modal appears with:
   - `Start Demo Project`
   - `Watch Controls`
   - `Open Project`
4. Click `Start Demo Project`.

Expected: deterministic demo project loads with animated cube and timeline keys.

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

### 2d) Timeline zoom/pan/snap grid (60s)

1. In timeline controls, change `Snap` from `0.1s` to `0.5s`.
2. Drag a selected keyframe and confirm movement snaps to 0.5-second increments.
3. Set `Snap` to `Off` and drag again.
4. Drag empty timeline background horizontally to pan.
5. Use mouse wheel over timeline to zoom in/out.

Expected: snap presets affect drag precision, background drag pans, and wheel zoom changes timeline scale smoothly.

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

### 4d) Export video (60s)

1. Click `Export Video`.
2. Set `Format: MP4`, `Duration: 2`, `FPS: 30`, `Resolution: 1280x720`.
3. Start export and wait for completion progress.
4. Open downloaded file.

Expected: exported MP4 is playable and matches viewport animation.

### 5) Save/export + refresh/import restore (120s)

1. Click `Save`.
2. Click `Export` and keep file.
3. Refresh browser tab.
4. Click `Load` (localStorage path).
5. Click `Import` and pick exported file.

Expected: scene + keyframes are restored both by Load and Import.

### 5a) Built-in demo model command (45s)

1. Open command palette with `Ctrl+K`.
2. Run `Insert Demo Model`.
3. Confirm imported model appears in hierarchy and viewport without file picker.

Expected: deterministic built-in GLB is inserted and selected.

### 5b) glTF model import + bundle export (120s)

1. Click `Import Model` and choose a small `.glb` file.
2. Confirm imported model appears in Hierarchy and viewport.
3. Select one imported mesh and adjust material `Base Color`, `Metallic`, `Roughness` in Inspector.
4. Click `Export Bundle`.
5. Click `Save`, refresh tab, then `Load`.

Expected: imported model and edited material values persist after load; bundle zip downloads with `project.json` and `assets/*`.

### 5d) Bundle import roundtrip (60s)

1. After `Export Bundle`, refresh the page.
2. Click `Import Bundle` and choose the exported zip.
3. Confirm load review shows counts/version/duration.
4. Click `Replace Current Scene`.

Expected: imported model + animation + materials restore identically from bundle.

### 5e) Dry-run failure proof (45s)

1. Duplicate an exported bundle and remove one required file from `assets/` (or use an intentionally broken zip).
2. Attempt `Import Bundle` with the broken file.
3. Confirm failure toast appears.
4. Check current scene/timeline remains unchanged.

Expected: failed open/import performs zero live scene mutation.

### 5c) Asset purge and renderer stats overlay (60s)

1. Open `Settings` and enable `Show renderer stats overlay (dev)`.
2. Confirm draw calls/geometries/textures appear in the viewport corner.
3. Use `Purge Unused` from Settings.

Expected: overlay updates live; purge reports whether unused assets were removed without breaking scene content.

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

### 9) Recent/Open/Save As workflow (60s)

1. Save project at least twice after making edits.
2. Click `Recent` and confirm entries include name/version/size/time.
3. Click one recent entry to open it.
4. Click `Settings` and enable native file access if supported, then test `Open` and `Save As`.

Expected: recent list opens projects; unsupported browsers show fallback note; native mode falls back gracefully when unavailable.

### 10) Command palette workflow (45s)

1. Press `Ctrl+K`.
2. Search for `Frame`.
3. Press `Enter` to execute `Frame Selected`.
4. Reopen palette and run `Toggle Grid`.

Expected: command palette opens quickly, keyboard navigation works, and actions match viewport/editor behavior.

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
9. Model import fails for `.gltf`:
   - Confirm referenced textures/buffers are embedded or use `.glb`.
   - Check import toast for missing resource hints.
10. Bundle exports but assets are missing:
   - Check `assets[]` in exported `project.json`.
   - Embedded sources are bundled automatically; external sources are emitted as reference notes only.
