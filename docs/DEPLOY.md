# Deployment

MotionForge is deployed as a static web app.

## GitHub Pages

Workflow: `/Users/faridabbasov/dev/MotionForge/.github/workflows/deploy-pages.yml`

- Trigger: push to `main` or manual dispatch.
- Build command: `pnpm -C apps/web build`
- Base path: set via `VITE_BASE_PATH=/${repo-name}/`
- Publish directory: `apps/web/dist`

## Local production preview

```bash
pnpm install
pnpm -C apps/web build
pnpm -C apps/web preview
```

## Notes

- `pnpm gate` should be green before merge.
- Build metadata (`version`, commit hash, build date) is embedded at build time and shown in the app footer.
