# MotionForge

<p>
  <img src="apps/web/public/motionforge-logo.svg" alt="MotionForge logo" width="96" height="96" />
</p>

MotionForge is a web-first 3D animation editor built with React, TypeScript, and Three.js. It combines scene editing, timeline keyframing, undo/redo, project persistence, glTF model import, and bundle export in a pnpm monorepo designed for production-quality iteration.

## Demo Features

- Three.js viewport with selection, transform gizmo, framing, and keyboard shortcuts.
- Timeline v2 with multi-object lanes, keyframe selection/editing, copy/paste, nudge, and undo/redo.
- Save/load/import/export workflow with project schema compatibility (`v1`/`v2`/`v3`).
- glTF import with asset registry, material persistence, and bundle ZIP export.
- Guardrails for invalid files and a strict `pnpm gate` quality pipeline.

## Quickstart

```bash
pnpm install
pnpm -C apps/web dev
```

Open `http://localhost:5173`.

## Demo In 60 Seconds

1. Click `Start Demo Project` on first run.
2. Press `Space` to play animation.
3. Drag one keyframe in the timeline and press `Ctrl+Z`.
4. Click `Import Model` and choose a `.glb`.
5. Click `Export Bundle` to download `project.json + assets`.

## Key Docs

- Project format: [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md)
- Release gate: [RELEASE_GATE.md](RELEASE_GATE.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deployment: [docs/DEPLOY.md](docs/DEPLOY.md)
- Release process: [RELEASE.md](RELEASE.md)

## Roadmap (Short)

- Better graph/curve editing and interpolation UX.
- More import/export targets and non-destructive asset relinking.
- Collaboration and review workflows for teams.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

