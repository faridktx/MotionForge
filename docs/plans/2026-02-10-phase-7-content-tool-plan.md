# Phase 7 Content Tooling Implementation Plan

> **For Implementer:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add glTF asset import, in-project asset metadata, bundle export, and material persistence with safety guardrails while preserving existing primitive workflows.

**Architecture:** Keep current scene/animation architecture intact. Add a lightweight `assetStore` in web for import state + metadata, extend project schema to v3 for assets/model instances, and keep deserialization backward compatible with v1/v2. Use Three `GLTFLoader` and shared import helpers to avoid React/frame-loop coupling.

**Tech Stack:** React + Three.js + Zustand-like hand-rolled stores, Vitest, `@motionforge/engine` schema validation, `fflate` for zip bundle export.

---

### Task 1: Add failing tests for v3 schema and parse edge cases

**Files:**
- Modify: `packages/engine/src/projectSchema.test.ts`
- Modify: `apps/web/src/lib/project/serialize.test.ts`

1. Add tests that fail for missing/invalid v3 `assets` and `modelInstances`.
2. Run targeted tests and confirm failure.
3. Implement schema support minimally.
4. Re-run targeted tests until green.

### Task 2: Add asset store and glTF import pipeline

**Files:**
- Create: `apps/web/src/state/assetStore.ts`
- Create: `apps/web/src/lib/three/importGltf.ts`
- Modify: `apps/web/src/components/TopBar.tsx`
- Modify: `apps/web/src/lib/three/disposeObject.ts`
- Modify: `apps/web/src/state/sceneStore.ts`

1. Add tests for serialization/parse behavior first where feasible.
2. Add import UX (`Import Model` + cancel + errors + file-size guard).
3. Register imported root + mesh nodes in scene registry.
4. Ensure imported materials/textures are disposed recursively.

### Task 3: Extend project format and serialization/deserialization for assets

**Files:**
- Modify: `apps/web/src/lib/project/serialize.ts`
- Modify: `apps/web/src/lib/project/deserialize.ts`
- Modify: `packages/engine/src/projectSchema.ts`

1. Introduce version 3 support with `assets[]` and `modelInstances[]`.
2. Keep v1/v2 load behavior unchanged.
3. Persist primitive data as before; persist model instances via asset references + material overrides.

### Task 4: Add Export Bundle and minimal material editing

**Files:**
- Modify: `apps/web/src/components/TopBar.tsx`
- Modify: `apps/web/src/components/InspectorContent.tsx`
- Modify: `apps/web/src/state/useScene.ts`
- Modify: `apps/web/src/lib/project/serialize.ts`
- Modify: `apps/web/package.json`

1. Add `Export Bundle` zip (`project.json` + `assets/*`) using lightweight zip dependency.
2. Add inspector material controls (base color + metallic + roughness for standard materials).
3. Ensure edits mark dirty and are serialized.

### Task 5: Docs and verification

**Files:**
- Modify: `docs/PROJECT_FORMAT.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEMO_SMOKE.md`

1. Document v3 format and backward compatibility.
2. Document import/export bundle flow and failure states.
3. Run strict verification in order:
   - `pnpm install`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `pnpm gate`
