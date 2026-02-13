# MotionForge

Status: [Gate workflow](https://github.com/faridabbasov/MotionForge/actions/workflows/gate.yml) | [Deploy Pages workflow](https://github.com/faridabbasov/MotionForge/actions/workflows/deploy-pages.yml)

<p>
  <img src="apps/web/public/motionforge-logo.svg" alt="MotionForge logo" width="96" height="96" />
</p>

MotionForge is a web-first 3D animation editor for fast iteration in the browser: scene layout, keyframing, model import, undo/redo, and export all in one workflow.

Live demo: [faridabbasov.github.io/MotionForge](https://faridabbasov.github.io/MotionForge/)

## What You Can Do

- Edit scenes in a Three.js viewport with selection, framing, and transform tools.
- Animate with a multi-lane timeline: keyframe CRUD, drag, snap, copy/paste, undo/redo.
- Import `.gltf/.glb` assets, tweak materials, and manage an asset registry.
- Save/load projects and exchange bundle ZIPs.
- Export animations to MP4/GIF, with PNG-sequence fallback.

## Tech Snapshot

- Monorepo with `pnpm` workspaces
- App: React + Three.js + Vite
- Packages: engine, UI, script tooling, MCP tooling
- Runtime target: Node.js `>=20`

## Quick Start

### 1) Install

```bash
pnpm install
```

### 2) Run the Web App

```bash
pnpm -C apps/web dev
```

Open: `http://localhost:5173`

### 3) Run Quality Gate (recommended before PR/release)

```bash
pnpm gate
```

## Demo in 60 Seconds

1. Click `Start Demo Project` in onboarding.
2. Press `Space` to preview playback.
3. Drag a timeline keyframe, then press `Ctrl+Z`.
4. Click `Export Video` and render a short 2-second MP4.
5. Click `Export Bundle`, refresh, then `Import Bundle`.

## Common Commands

```bash
pnpm dev              # web dev server (root alias)
pnpm test             # workspace tests
pnpm typecheck        # workspace type checks
pnpm lint             # eslint
pnpm build            # workspace build
pnpm gate             # lint + typecheck + test + build
```

## Agentic Unity Flow

1. Run:

```bash
pnpm mcp:demo:unity
```

2. In Unity: `Tools -> MotionForge -> Import Bundle`
3. Press Play to preview imported animation takes.

If Unity import fails with a glTF importer error, install `com.unity.cloud.gltfast` from Package Manager and import again.

## Docs Map

- Docs index: [docs/README.md](docs/README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Project format: [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md)
- Demo smoke checklist: [docs/DEMO_SMOKE.md](docs/DEMO_SMOKE.md)
- Deployment: [docs/DEPLOY.md](docs/DEPLOY.md)
- Release process: [RELEASE.md](RELEASE.md)
- Release gate: [RELEASE_GATE.md](RELEASE_GATE.md)

## Release

1. Run local gate:

```bash
pnpm gate
```

2. Create and push a semver tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

3. GitHub Actions publishes release artifacts:
- `motionforge-web-vX.Y.Z.zip`
- `version-metadata-vX.Y.Z.json`
- `build-manifest-vX.Y.Z.json`

Publishing policy: web build artifacts only (no npm publish).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
