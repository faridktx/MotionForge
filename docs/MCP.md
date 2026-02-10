# MotionForge MCP Server

`motionforge-mcp` exposes MotionForge headless editing and export tools over MCP stdio.

## Run locally

```bash
pnpm mcp:dev
```

Build + run compiled binary:

```bash
pnpm mcp:build
pnpm mcp:start
```

CLI:

```bash
motionforge-mcp --stdio
```

## Supported tools

- `mf.ping`: health + version check.
- `mf.capabilities`: lists available MCP tools and headless actions.
- `mf.project.loadJson`: validates and stages project JSON (no live mutation yet).
- `mf.project.commit`: commits staged project atomically.
- `mf.project.discard`: discards staged project.
- `mf.state.snapshot`: deterministic JSON snapshot of scene/selection/assets/animation.
- `mf.command.execute`: executes supported headless commands via command bus.
- `mf.plan.generate`: deterministic natural language to command plan (no mutation).
- `mf.plan.previewDiff`: diff simulation for a generated plan on cloned runtime.
- `mf.plan.apply`: atomic plan apply with confirm guard and rollback.
- `mf.plan.discard`: removes plan from in-memory registry.
- `mf.script.validate`: validates MotionForge Script with path-based diagnostics.
- `mf.script.compile`: compiles MotionForge Script to deterministic plan steps and returns `planId`.
- `mf.script.run`: safe wrapper for `compile -> previewDiff -> optional apply`.
- `mf.script.examples`: returns deterministic script examples.
- `mf.skill.generateScript`: deterministic goal/constraints to script mapper (no LLM).
- `mf.export.bundle`: writes `motionforge-bundle.zip` to output directory.
- `mf.export.unityPackage`: writes `motionforge-unity-package.zip` with `project.json`, assets, and Unity README.
- `mf.export.video`: returns `MF_ERR_HEADLESS_VIDEO_UNSUPPORTED` in MCP headless mode.
- `mf.export.projectJson`: exports normalized latest project JSON string.
- `mf.io.readFileBase64`: reads small files with byte guard.
- `mf.io.writeFile`: writes base64 payload with byte guard.
- `mf.pipeline.makeBundle`: staged deterministic pipeline that produces `project.json`, `motionforge-bundle.zip`, and `proof.json`.
- `mf.unity.recipe.makeBundle`: Unity-targeted wrapper around `mf.pipeline.makeBundle` with deterministic bindPath targeting.

## Headless constraints

- Viewport-only actions are not exposed.
- Video export is intentionally unsupported in headless MCP runtime (no WebGL renderer in process).
- All load/import operations are staged first (`loadJson` + `commit`) to avoid partial state mutation.
- All plan mutations require explicit `mf.plan.apply`; `mf.plan.generate` never mutates state.
- All script mutations require explicit `mf.plan.apply`; `mf.script.compile` never mutates state.

## Recipe trigger phrases (exact)

- `bounce`: `"bounce"`, `"squash stretch bounce"`
- `anticipation-and-hit`: `"anticipation-and-hit"`, `"anticipation hit"`, `"anticipation"`
- `idle-loop`: `"idle-loop"`, `"idle loop"`, `"hover idle"`, `"breathing idle"`
- `camera-dolly`: `"camera-dolly"`, `"camera dolly"`, `"dolly shot"`
- `turn-in-place`: `"turn-in-place"`, `"turn in place"`, `"rotate 90"`, `"turn 90"`
- `recoil`: `"recoil"`, `"kick back"`, `"kickback"`

## Plan workflow

1) Generate deterministic plan:

```json
{
  "name": "mf.plan.generate",
  "arguments": {
    "goal": "bounce",
    "constraints": { "durationSec": 1, "style": "snappy" }
  }
}
```

2) Preview diff:

```json
{
  "name": "mf.plan.previewDiff",
  "arguments": { "planId": "h1234abcd" }
}
```

3) Apply:

```json
{
  "name": "mf.plan.apply",
  "arguments": { "planId": "h1234abcd", "confirm": true }
}
```

If safety confirm is required and `confirm` is false, the server returns `MF_ERR_CONFIRM_REQUIRED`.

## Script workflow

1) Validate script:

```json
{
  "name": "mf.script.validate",
  "arguments": {
    "script": "select \"obj_cube\"\nduration 1\nbounce amplitude 1.2 at 0..1"
  }
}
```

2) Compile script into a plan:

```json
{
  "name": "mf.script.compile",
  "arguments": {
    "script": "select \"obj_cube\"\nduration 1\nlabel \"Bounce\"\nbounce amplitude 1.2 at 0..1",
    "defaults": { "fps": 30, "durationSec": 1 }
  }
}
```

3) Preview and apply using the returned `planId`:

```json
{
  "name": "mf.plan.previewDiff",
  "arguments": { "planId": "h1234abcd" }
}
```

```json
{
  "name": "mf.plan.apply",
  "arguments": { "planId": "h1234abcd", "confirm": true }
}
```

4) List built-in scripts:

```json
{
  "name": "mf.script.examples",
  "arguments": {}
}
```

5) Run script safely via wrapper:

```json
{
  "name": "mf.script.run",
  "arguments": {
    "script": "select \"obj_cube\"\nduration 1\nbounce amplitude 1.2 at 0..1",
    "applyMode": "previewOnly",
    "confirm": false,
    "staged": false
  }
}
```

## Skill flow (deterministic)

1. `mf.skill.generateScript`
2. `mf.script.validate`
3. `mf.script.run` with `applyMode="previewOnly"`
4. `mf.script.run` with `applyMode="apply"` and `confirm=true`

`mf.skill.generateScript` returns MotionForge Script only. No command JSON is returned by this tool.

## Staged-safe demo sequence

Use this sequence for non-destructive loading:

1) `mf.project.loadJson` with `{ "staged": true }`
2) `mf.state.snapshot` (should still reflect current committed project)
3) `mf.script.run` with `{ "staged": true, "applyMode": "apply", "confirm": true }`
4) `mf.state.snapshot` (still unchanged until commit)
5) `mf.project.commit`
6) `mf.state.snapshot` (now shows staged script mutations)

## One-call bundle pipeline (Phase 20)

Use `mf.pipeline.makeBundle` for the full deterministic flow:

1. staged load
2. deterministic take selection
3. `mf.skill.generateScript` per take
4. script validate + preview/apply
5. staged commit
6. bundle + proof artifacts

Preview-only (no mutation, returns `MF_ERR_CONFIRM_REQUIRED`):

```json
{
  "name": "mf.pipeline.makeBundle",
  "arguments": {
    "inJson": "{...}",
    "goal": "idle loop then recoil",
    "outDir": "/tmp/motionforge-out",
    "confirm": false
  }
}
```

Confirmed apply:

```json
{
  "name": "mf.pipeline.makeBundle",
  "arguments": {
    "inJson": "{...}",
    "goal": "idle loop then recoil",
    "outDir": "/tmp/motionforge-out",
    "confirm": true
  }
}
```

Unity-targeted recipe call:

```json
{
  "name": "mf.unity.recipe.makeBundle",
  "arguments": {
    "goal": "idle loop then recoil",
    "target": { "select": "obj_cube" },
    "outDir": "/tmp/motionforge-out",
    "confirm": true
  }
}
```

## Example MCP calls

1) Stage project:

```json
{
  "name": "mf.project.loadJson",
  "arguments": { "json": "{...}", "staged": true }
}
```

2) Commit staged:

```json
{
  "name": "mf.project.commit",
  "arguments": {}
}
```

3) Execute command:

```json
{
  "name": "mf.command.execute",
  "arguments": {
    "action": "selection.set",
    "input": { "objectId": "obj_cube" }
  }
}
```

## MCP client config snippet

Use your local package path:

```json
{
  "mcpServers": {
    "motionforge": {
      "command": "pnpm",
      "args": ["-C", "/Users/faridabbasov/dev/MotionForge/packages/mcp", "start"]
    }
  }
}
```

## Safe LLM adapter template (script-only)

Use this pattern when connecting an LLM. The model must output script only, not command JSON:

```text
You are a MotionForge scripting assistant.
Output MotionForge Script only.
Never output command bus actions, MCP tool calls, JSON plans, or prose explanations.
Use only supported statements:
select, duration, fps, loop, label, key, delete key, bounce, recoil.
Keep output under 40 lines.
If the request is unsupported, output exactly:
# UNSUPPORTED
# Suggestion: use one of bounce, recoil, turn-in-place, idle-loop, camera-dolly
```
