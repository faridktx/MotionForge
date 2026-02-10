# MotionForge Script (Deterministic DSL)

MotionForge Script is a small, deterministic text DSL compiled locally into a reviewable plan. It never mutates state directly.

Execution flow:

1. `mf.script.validate`
2. `mf.script.compile` -> returns `planId`
3. `mf.plan.previewDiff`
4. `mf.plan.apply` (with `confirm=true` when required)

Safe wrapper flow:

1. `mf.script.run` with `applyMode="previewOnly"` (no mutation)
2. `mf.script.run` with `applyMode="apply"` and `confirm=true` (atomic mutation)

## Supported statements

- `select "<name-or-id>"`
- `duration <seconds>`
- `fps <fps>`
- `loop on|off`
- `label "<text>"`
- `take "<name>" from <t0> to <t1>`
- `key position x|y|z at <time> = <value> ease <linear|easeIn|easeOut|easeInOut|step>`
- `key rotation x|y|z at <time> = <degrees> deg ease <linear|easeIn|easeOut|easeInOut|step>`
- `key scale x|y|z at <time> = <value> ease <linear|easeIn|easeOut|easeInOut|step>`
- `delete key position|rotation|scale x|y|z at <time>`
- `bounce amplitude <a> at <t0..t1>`
- `recoil distance <d> at <t0..t1>`

Notes:

- `rotation` values are degrees and compile to radians internally.
- `loop` is accepted for planning but loop metadata persistence may be ignored by older runtimes.
- Helpers (`bounce`, `recoil`) compile to deterministic key batches.
- `take` writes deterministic take ranges into `animation.takes[]` for multi-clip exports/importers.

## Validation

Validation errors are path-oriented:

- `line:3 Unsupported script statement.`
- `line:2 Duration must be greater than 0.`
- `line:1 Selected object \"unknown\" does not exist in project context.`

Compilation fails if validation fails.

## Example scripts

Bounce:

```text
select "obj_cube"
duration 1
label "Bounce"
bounce amplitude 1.2 at 0..1
```

Turn in place:

```text
select "obj_cube"
duration 1
label "Turn"
key rotation y at 0 = 0 deg ease easeInOut
key rotation y at 1 = 90 deg ease easeInOut
```

Idle loop:

```text
select "obj_cube"
duration 2
fps 30
label "Idle Loop"
key position y at 0 = 0 ease easeInOut
key position y at 1 = 0.06 ease easeInOut
key position y at 2 = 0 ease easeInOut
loop on
take "Idle" from 0 to 2
```

Two-take example:

```text
select "obj_cube"
duration 2.4
label "Idle + Recoil"
key position y at 0 = 0 ease easeInOut
key position y at 1 = 0.06 ease easeInOut
key position y at 2 = 0 ease easeInOut
recoil distance 0.2 at 2..2.4
take "Idle" from 0 to 2
take "Recoil" from 2 to 2.4
```

Delete keyframe:

```text
select "obj_cube"
duration 1
delete key position x at 0.5
```

## Safety rules

- Script compile does not mutate state.
- `mf.script.run` with `applyMode="previewOnly"` does not mutate state.
- Plan apply is atomic; failure restores previous state.
- High-impact plans may require explicit confirmation:
  - Any delete operation
  - More than 20 key edits

## Skill flow

For natural-language-like goals without LLM execution in runtime:

1. Call `mf.skill.generateScript` with `goal` + optional constraints.
2. Validate with `mf.script.validate`.
3. Preview with `mf.script.run` (`previewOnly`).
4. Apply with `mf.script.run` (`apply`) and `confirm=true`.

The skill generator returns script text only and is deterministic.

## Staged safety

Staged execution is supported for script tools:

1. `mf.project.loadJson` with `staged:true`
2. `mf.script.run` with `staged:true`
3. `mf.project.commit` when reviewed

Until `mf.project.commit`, current committed runtime state remains unchanged.

## Determinism guarantees

- Same script + same project state + same defaults => same plan steps.
- Key and delete operations are sorted deterministically before command generation.
- Output objects touched are sorted and stable.
