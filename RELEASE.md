# Release Process

## 1) Verify quality gate

```bash
pnpm install
pnpm gate
```

## 2) Build production web app

```bash
pnpm -C apps/web build
```

Output: `apps/web/dist`

## 3) Deploy

- GitHub Pages deploys automatically on `main` via:
  - `.github/workflows/deploy-pages.yml`
- Base path for Pages is configured through `VITE_BASE_PATH` in that workflow.

## 4) Tag release

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Tag workflow `.github/workflows/release-artifact.yml` will:

1. Install dependencies
2. Run `pnpm gate`
3. Build web app
4. Generate `apps/web/dist/version-metadata.json`
5. Upload ZIP artifact: `motionforge-web-vX.Y.Z.zip`

## 5) Artifact contents

- Full `apps/web/dist` static build
- `version-metadata.json` with:
  - tag
  - commit
  - build timestamp
