# Architecture

## Viewport Render Loop

The viewport is a single React component (`Viewport.tsx`) that owns the entire Three.js lifecycle inside a `useEffect` with an empty dependency array. This means it mounts once and never re-renders due to React state changes.

### Setup sequence

1. Create `WebGLRenderer` with clamped pixel ratio (`min(devicePixelRatio, 2)`) and SRGB color space
2. Create scene, camera (perspective, fov 50), and OrbitControls
3. Register scene and camera in the `sceneStore`
4. Populate scene with grid, axes helper, lights, and default selectable meshes
5. Register each user object in `sceneStore` for ID-based tracking
6. Create the transform gizmo and add it to the scene
7. Subscribe to store selection changes for highlight sync and gizmo attachment
8. Attach `ResizeObserver` to the container div for responsive sizing
9. Start `requestAnimationFrame` loop

### Render loop

Each frame:
1. `controls.update()` (handles damping)
2. `gizmo.syncPosition()` (keeps gizmo at target object and auto-scales by camera distance)
3. `renderer.render(scene, camera)`

No React state is read or written during the loop.

`renderer.info` stats are sampled on a fixed interval (500ms) when enabled from Settings, not per frame.

## Transform Gizmo

The gizmo is a custom implementation using Three.js primitives (no external library). It lives in `lib/three/gizmo/`.

### Components

- **Gizmo.ts**: Main class managing translate/rotate/scale handle groups, drag logic, and callbacks
- **picking.ts**: Raycasts against gizmo handle meshes, returns the handle name
- **math.ts**: Plane projection and axis-plane normal computation for drag constraints

### Drag flow

1. Pointer down on a gizmo handle triggers `pickGizmoHandle()`
2. OrbitControls are disabled for the duration of the drag
3. Start position/quaternion/scale are captured for undo/cancel
4. Pointer move projects onto the appropriate constraint plane and updates the target object
5. Pointer up re-enables controls and pushes an undo command with start/end transforms
6. Escape during drag cancels and restores the start transform

### Modes

- **Translate** (W): Arrow handles with cone tips, constrained to single axis
- **Rotate** (E): Torus handles, world-axis-locked rotation using ray-plane intersection and quaternion delta
- **Scale** (R): Arrow handles with cube tips, axis-constrained scaling

## Scene Store

`sceneStore.ts` is the single source of truth for the scene graph at the application level.

### What it holds

- **scene / camera / controlsTarget**: References set by the Viewport on mount
- **object registry**: A `Map<string, Object3D>` keyed by generated IDs (e.g. `obj_1`)
- **selectedId**: The currently selected object's ID (or null)
- **dirty flag**: Whether unsaved changes exist

### Pub/sub channels

| Channel     | Fires when                                   |
| ----------- | -------------------------------------------- |
| `selection` | Selected object changes                      |
| `objects`   | Object added, removed, or renamed            |
| `transform` | Transform edited via inspector or gizmo      |

### React hooks

- `useSceneObjects()` -- subscribes to `objects` + `selection`, returns a `SceneSnapshot` with node list and selected ID
- `useSelectedId()` -- subscribes to `selection` only
- `useSelectedTransform()` -- subscribes to `selection` + `transform`, returns position/rotation/scale snapshot
- `useDirtyState()` -- subscribes to dirty flag changes

### Design rationale

The store uses simple function-based pub/sub rather than a framework like Redux or Zustand. This keeps the dependency footprint minimal and avoids re-rendering the entire tree. Only components that call a specific hook will re-render when the relevant channel fires.

Object3D references are stored in the registry map, but React components receive only serializable snapshots (IDs, names, numbers). This prevents Three.js objects from leaking into React state.

## Undo/Redo

`undoStore.ts` implements a command-stack pattern:

- Each action is an `UndoCommand` with `do()` and `undo()` closures (legacy `execute()` is still supported for backward compatibility)
- `push(cmd)` runs `do()` and pushes; `pushExecuted(cmd)` pushes without re-running (used for gizmo drags that are already applied live)
- Maximum stack depth of 100 commands
- Redo stack is cleared on any new push
- `Ctrl+Z` / `Ctrl+Y` (or `Cmd+Z` / `Cmd+Shift+Z` on Mac) trigger undo/redo

## Animation System

### Data model (engine package)

- **Clip**: Top-level container with `durationSeconds` and an array of `Track`s
- **Track**: Binds to an `objectId` and a `TrackProperty` (e.g. `"position.x"`), contains sorted `Keyframe`s
- **Keyframe**: `{ time, value, interpolation }` where interpolation is one of `linear`, `step`, `easeIn`, `easeOut`, `easeInOut`

### Animation store

`animationStore.ts` manages the active clip, playback state, and current time:

- **Playback**: `play()` / `pause()` / `togglePlayback()` use `requestAnimationFrame` for tick loop
- **Scrubbing**: `scrubTo(t)` evaluates the clip at time `t` and applies values to scene objects without creating undo commands
- **Duration edits**: `setDuration()` is undoable and normalizes/clamps clip data
- **Keyframing**:
  - `addKeyframesForSelected(property)` inserts axis keyframes for one transform group as one undoable command
  - `addAllKeyframesForSelected()` (K shortcut) inserts position/rotation/scale keyframes as one undoable command
- **Keyframe CRUD**: remove, move, value edits, interpolation edits, and single-key time edits all go through undoable clip commands
- **Channels**: `time` (current time changes), `playback` (play/pause), `keyframes` (keyframe added/removed)

## Timeline v2

The timeline is split into a left track list and a right time area:

- **Rows**: object groups for all animated objects, with nested property sections (`Position`, `Rotation`, `Scale`) and per-axis lanes (`X`, `Y`, `Z`). Non-selected objects are collapsed by default; selected object auto-expands.
- **Visibility**: per-object eye toggle hides track rows from timeline view (UI-only; data unchanged).
- **Markers**: Per-axis key diamonds in each row, with selected-key highlighting
- **Interactions**:
  - Click empty ruler/lane to scrub
  - Click key to select, `Shift+Click` to toggle multi-select
  - `Shift+Drag` in lane area creates a marquee rectangle for box-selection
  - Drag timeline background horizontally to pan
  - Drag selected keys horizontally to move in time (snap 0.1s by default, hold `Alt` to disable)
  - `Ctrl+C` / `Ctrl+V` copies and pastes selected keys at playhead while preserving relative offsets
  - `Alt+ArrowLeft` / `Alt+ArrowRight` nudges selected keys by small time increments
  - `Delete` / `Backspace` or trash button removes selected keys
- **Editing panel**: Single selected key supports editing time, value, and interpolation (`linear`/`step`/`easeIn`/`easeOut`/`easeInOut`), all undoable
- **Zoom/Snap**:
  - wheel zoom + slider control `pixelsPerSecond`
  - snap presets in `timelineStore`: `off`, `0.1s`, `0.5s`, `1.0s`
  - lane grid follows the selected snap interval

### Evaluation

`evaluateClip()` iterates all tracks, evaluates each at the given time using linear interpolation between surrounding keyframes, and returns a map of `objectId -> property -> value`. The viewport's animation tick applies these values directly to Object3D properties.

## Selection Flow

### From viewport (click)

1. User clicks canvas
2. Pointer event handler checks for drag vs click (distance threshold)
3. Skipped if gizmo is currently dragging
4. Raycast against `sceneStore.getAllUserObjects()`
5. Call `sceneStore.setSelectedId(id)` or `null`
6. Store notifies `selection` subscribers
7. Viewport's subscription callback syncs emissive highlight and gizmo attachment
8. Hierarchy and Inspector re-render with new selection

### From hierarchy (click)

1. User clicks a row in the hierarchy panel
2. `sceneStore.setSelectedId(id)` is called
3. Same notification flow as above
4. Viewport receives the change via its subscription and applies highlight

### Visual feedback

Selected objects get a temporary emissive color change (`MeshStandardMaterial.emissive`). On deselect, emissive is reset to black. This avoids needing a postprocessing outline pass.

## Inspector Editing

The inspector uses uncontrolled inputs (`defaultValue` + `key` reset pattern):
- Inputs are keyed on `selectedId + current snapshot values`
- When the user types, React does not re-render on every keystroke
- On blur or Enter, the value is parsed and applied directly to the Object3D
- `sceneStore.notifyTransformChanged()` fires the `transform` channel
- The inspector hook refreshes its snapshot from the live object

Sections are collapsible, and each section has a "Key" button that inserts keyframes for that property group at the current animation time.

## Persistence

### Save (v3)

1. `serializeProject()` walks the registry and builds a JSON object
2. Primitive meshes are serialized into `objects[]` (geometry + transform + material values)
3. Imported model roots are serialized into `modelInstances[]` with linked `assetId`
4. Asset metadata is serialized into `assets[]` (embedded and external source modes)
5. Camera position, target, and fov are included
6. Animation clip is included if it has any tracks
7. JSON is written to `localStorage` under `motionforge_project`

Recent/autosave persistence:
- full recent payloads and autosave snapshot are stored in IndexedDB (`projectPayloadStore`)
- localStorage keeps only lightweight recent metadata + user settings
- legacy localStorage payload keys are migrated forward on startup

### Load

1. JSON is parsed from localStorage (or from an imported file)
2. `clearUserObjects()` removes all registered objects from the scene and disposes them
3. `deserializeProject()` recreates meshes from the JSON data
4. Objects are added to the scene and registered in the store
5. Camera state is restored if present
6. Imported models (v3) are reconstructed from embedded glTF asset bytes and material overrides
7. Animation clip is restored (v2/v3) or reset (v1 files without animation)
8. Asset store is replaced with the project's `assets[]`
9. Undo stack is cleared
10. Dirty flag is cleared

### Export

- `downloadProjectJSON()` serializes the project and downloads `.json`.
- `downloadProjectBundle()` exports a zip with `project.json` and embedded files under `assets/`.

### Web-native file workflow

- `Recent Projects` metadata is stored in localStorage (name, updatedAt, size, version, id) with a max of 5 entries.
- Recent payload JSONs are resolved by `id` from IndexedDB.
- Open/load actions use a dirty-state confirm guard before replacing the current scene.
- Optional File System Access API mode (`Settings`) enables:
  - `Open` via native file picker
  - `Save` back to last opened/saved handle
  - `Save As` to choose a new handle
- Native file handles remain in memory only; persistent local metadata stores file name + timestamp.

### New project

Same as load, but uses `createDefaultObjects()` to make the standard cube/sphere/cone. Animation, undo, and asset registry are reset.

## Asset Pipeline (Phase 7)

### Model import flow

1. User clicks `Import Model` in top bar.
2. File extension/size is validated (`.gltf/.glb`; warning threshold + hard max limit).
3. File is read to `ArrayBuffer` with progress updates and cancel support.
4. `GLTFLoader.parse()` creates a Three.js hierarchy.
5. Import summary is computed (nodes, meshes, materials, textures) and checked against budget thresholds.
6. Imported nodes are annotated with:
   - `__assetId`
   - `__isImportedModel`
   - `__assetNodePath`
   - `__isModelRoot` (root only)
7. Scene store registers the hierarchy in one batched `objects` notification.
8. Asset metadata + embedded bytes are stored in `assetStore`.
9. Users can run `Purge Unused` to remove assets not referenced by any model root.

### Failure states

- Wrong file type: early rejection with toast.
- Oversized file: blocked before load.
- Broken glTF / missing external textures: toast error; scene remains unchanged.
- Over-budget import (nodes/textures): rejected with readable error; current scene remains unchanged.
- Cancel: aborts active import cleanly and preserves existing project state.

## Cleanup and Disposal

On unmount (React `useEffect` cleanup):

1. Cancel the animation frame
2. Disconnect the `ResizeObserver`
3. Unsubscribe from store
4. Remove all event listeners (keydown, wheel, pointer)
5. Dispose gizmo (removes its event listeners and geometries/materials)
6. Dispose OrbitControls
7. Traverse the scene and dispose all geometries/materials/textures via `disposeObject(scene)`
8. Dispose the renderer
9. Remove the canvas element from the DOM

## Keyboard Shortcuts

Shortcuts are bound via a `window.addEventListener("keydown", ...)` inside the viewport effect. They are ignored when an input or textarea element is focused.

| Key       | Action                                    |
| --------- | ----------------------------------------- |
| W         | Translate mode                            |
| E         | Rotate mode                               |
| R         | Scale mode                                |
| K         | Insert transform keyframes for selected object |
| Space     | Play / pause animation                    |
| F         | Frame selected object (or reset to origin)|
| Shift+F   | Frame all selectable objects              |
| G         | Toggle grid and axes visibility           |
| Ctrl+K    | Open command palette                      |
| Esc       | Cancel gizmo drag / clear selection       |
| Delete    | Delete selected timeline keyframes        |
| Wheel     | Timeline zoom (when pointer is over timeline) |
| Ctrl+Z    | Undo                                      |
| Ctrl+Y    | Redo                                      |
