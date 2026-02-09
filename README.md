# MotionForge

A production-grade web application for 3D animation and motion design, built with React, TypeScript, and Three.js.

## Quickstart

```bash
pnpm install
pnpm dev        # Start the development server
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm install`   | Install all dependencies                         |
| `pnpm dev`       | Start the web app dev server                     |
| `pnpm build`     | Build all packages and the web app               |
| `pnpm lint`      | Run ESLint across the workspace                  |
| `pnpm typecheck` | Run TypeScript type checking across all packages |
| `pnpm test`      | Run all tests via Vitest                         |
| `pnpm gate`      | Run lint, typecheck, test, and build in sequence |

## Controls

### Mouse

- **Orbit:** Left mouse drag
- **Pan:** Right mouse drag
- **Zoom:** Scroll wheel
- **Select:** Left click on an object (viewport or hierarchy)
- **Deselect:** Left click on empty space or press Esc
- **Rename:** Double-click an item in the hierarchy panel

### Keyboard Shortcuts

| Key       | Action                                    |
| --------- | ----------------------------------------- |
| `W`       | Translate mode                            |
| `E`       | Rotate mode                               |
| `R`       | Scale mode                                |
| `K`       | Insert keyframe (all properties)          |
| `Space`   | Play / pause animation                    |
| `F`       | Frame selected object (or reset to origin)|
| `Shift+F` | Frame all objects                         |
| `G`       | Toggle grid and axes                      |
| `Esc`     | Cancel gizmo drag / clear selection       |
| `Ctrl+Z`  | Undo                                      |
| `Ctrl+Y`  | Redo                                      |

## Animation

1. Select an object and position it at frame 0
2. Press `K` or click "Key" buttons in the Inspector to record keyframes
3. Scrub the timeline to a later time, move the object, press `K` again
4. Press `Space` to play back the animation
5. Adjust duration in the timeline panel

Keyframe markers appear as diamonds on the timeline for the selected object.

## Save and Load

- **Save:** Click "Save" in the top bar to persist the project to localStorage.
- **Load:** Click "Load" to restore the last saved project.
- **Import:** Click "Import" to load a `.json` project file from disk.
- **Export:** Click "Export" to download the project as a `.json` file.
- **New:** Click "New" to reset to default objects.

An "Unsaved" badge appears in the top bar when you have changes that have not been saved yet. See [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) for the JSON schema (v2 with animation data, backward compatible with v1).

## Repo Layout

```
motionforge/
  apps/
    web/              # Vite + React + Three.js application
  packages/
    engine/           # Shared animation engine library
    ui/               # Shared UI components (React)
  docs/
    ARCHITECTURE.md   # Viewport, gizmo, stores, animation, and disposal design
    PROJECT_FORMAT.md # Project JSON schema (v2)
  eslint.config.js    # ESLint flat config
  tsconfig.base.json  # Shared TypeScript settings
  pnpm-workspace.yaml # Workspace definition
```

## Phase Roadmap

- **Phase 0** (done): Project scaffolding, tooling gates, basic 3D viewport with placeholder layout
- **Phase 1** (done): Viewport reliability, selection MVP, keyboard shortcuts, UI polish
- **Phase 2** (done): Live scene store, editable inspector, hierarchy wiring, save/load
- **Phase 3** (done): Transform gizmos, keyframe animation, timeline UI, undo/redo, project format v2
- **Phase 4**: Asset import/export, materials editor
- **Phase 5**: Plugin system, collaboration features
