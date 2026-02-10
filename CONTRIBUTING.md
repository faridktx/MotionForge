# Contributing

Thanks for contributing to MotionForge.

## Development Setup

```bash
pnpm install
pnpm -C apps/web dev
```

## Before Opening a PR

Run the release gate locally:

```bash
pnpm gate
```

## Pull Request Guidelines

- Keep changes focused and incremental.
- Add or update tests for user-visible behavior changes.
- Update docs when changing workflows, formats, or shortcuts.
- Keep project format compatibility (`v1`/`v2`/`v3`) unless explicitly versioning.

