# Phase 13 Ship Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver offline-first video export caching, onboarding gallery, and release workflow hardening while keeping pnpm gate green.

**Architecture:** Keep current web architecture and add small focused modules: offline cache service + service worker, gallery sample registry, and release metadata/manifest generation. Reuse existing stores/modals and avoid broad refactors.

**Tech Stack:** React 19, Vite 6, TypeScript, Vitest, Three.js, ffmpeg.wasm, GitHub Actions.

---

### Task 1: Offline export dependency pack + cache status
- Add pure cache status state machine + tests.
- Add ffmpeg core URL resolver tests aligned with local URL imports.
- Add service worker + registration and offline pack download action.
- Expose settings status line + button.
- Run strict gate sequence.

### Task 2: Product/docs cleanup pass
- Tighten README and docs index links/copy.
- Keep web-first positioning and remove internal tone.
- Run strict gate sequence.

### Task 3: Sample gallery modal
- Add sample registry with deterministic project payloads.
- Add gallery modal and integrate into onboarding + help.
- Add registry integrity/schema validity test.
- Update smoke doc steps.
- Run strict gate sequence.

### Task 4: Release pipeline tightening
- Add semver tag validation in release workflow.
- Add manifest generation and include in zip + release assets.
- Add release note template body.
- Update RELEASE/README docs for cut process.
- Run strict gate sequence.
