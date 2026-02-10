# MotionForge

[![Gate](https://github.com/faridabbasov/MotionForge/actions/workflows/gate.yml/badge.svg)](https://github.com/faridabbasov/MotionForge/actions/workflows/gate.yml)
[![Deploy Pages](https://github.com/faridabbasov/MotionForge/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/faridabbasov/MotionForge/actions/workflows/deploy-pages.yml)

<p>
  <img src="apps/web/public/motionforge-logo.svg" alt="MotionForge logo" width="96" height="96" />
</p>

MotionForge is a web-first 3D animation editor. It combines scene layout, timeline keyframing, model import, undo/redo, and video/project export in a fast browser workflow designed for iterative animation work.

## Live Demo

[MotionForge on GitHub Pages](https://faridabbasov.github.io/MotionForge/)

## Feature Highlights

- Three.js viewport with selection, transform gizmo, framing, and keyboard shortcuts.
- Multi-lane timeline with keyframe CRUD, drag, snapping, copy/paste, and undo/redo.
- Project persistence with compatibility for format versions `v1`, `v2`, and `v3`.
- glTF import, asset registry, bundle ZIP export/import, and material overrides.
- MP4/GIF export flow with fallback PNG sequence ZIP.

## Quickstart

```bash
pnpm install
pnpm -C apps/web dev
```

Open `http://localhost:5173`.

## Demo in 60 Seconds

1. Click `Start Demo Project` in onboarding.
2. Press `Space` to preview animation playback.
3. Drag one timeline keyframe, then press `Ctrl+Z`.
4. Click `Export Video` and render a short 2-second MP4.
5. Click `Export Bundle`, refresh, then `Import Bundle`.

## Agentic Unity Flow

1. Run `pnpm mcp:demo:unity`
2. In Unity: `Tools -> MotionForge -> Import Bundle`
3. Press Play to preview the imported Idle/Recoil animation takes

If Unity import fails with a glTF importer message, install `com.unity.cloud.gltfast` in Package Manager, then import again.

## Documentation

- Docs index: [docs/README.md](docs/README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Project format: [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md)
- Demo smoke checklist: [docs/DEMO_SMOKE.md](docs/DEMO_SMOKE.md)
- Deploy guide: [docs/DEPLOY.md](docs/DEPLOY.md)
- Release process: [RELEASE.md](RELEASE.md)
- Release gate: [RELEASE_GATE.md](RELEASE_GATE.md)

## Release

1. Run local gate: `pnpm gate`
2. Create and push a semver tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. GitHub Actions creates a release with web artifacts.

Release artifacts include:
- `motionforge-web-vX.Y.Z.zip`
- `version-metadata-vX.Y.Z.json`
- `build-manifest-vX.Y.Z.json`

Publishing policy: releases are web build artifacts (no npm publish step).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
