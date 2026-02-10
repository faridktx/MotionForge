# Agent Skills

Location: `apps/web/src/lib/agent/skills.ts`

## Overview

Skills are higher-level helpers that compose one or more `agentApi.execute(...)` calls and return structured reports:

```ts
{
  skill: string;
  steps: Array<{ id, action, ok, input?, result?, error? }>;
  warnings: string[];
  outputs: object[];
}
```

## Implemented Skills

1. `importModelFromUrl(url)`
- Uses command: `agent.project.importModelFromUrl`
- Dev-only guard: requires Dev Tools flag

2. `renameHierarchyWithRules(ruleset)`
- Reads snapshot
- Builds rename plan deterministically
- Uses command: `agent.hierarchy.renameMany`

3. `setMaterial(id, { baseColor, metallic, roughness })`
- Uses command: `agent.material.set`

4. `addKeyframesForSelection({ times, transforms, interpolation })`
- Reads selected object from snapshot
- Builds deterministic keyframe insertion plan
- Uses command: `agent.animation.insertRecords`

5. `exportBundle()`
- Uses command: `agent.project.exportBundle`

6. `exportVideoPreview({ format, fps, duration, resolution })`
- Uses command: `agent.project.exportVideoPreview`
- Preview mode only (headless-safe)

## Pure Planning Helpers

- `buildRenamePlan(nodes, ruleset)`
- `buildKeyframePlan(input)`
- `formatSkillReport(...)`

These are tested independently and do not require WebGL or DOM rendering.
