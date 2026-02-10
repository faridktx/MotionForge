# MotionForge -> Unity Workflow

This guide covers importing `motionforge-bundle.zip` into Unity and generating playable AnimationClips (single or multi-take).

## Prerequisites

- Unity `2022.3+`
- MotionForge Unity package from this repo:
  - `integrations/unity/MotionForge.Unity`
- glTF importer package (default):
  - `com.unity.cloud.gltfast`

The importer uses glTFast APIs when model assets are present. If glTFast is not installed, primitive-only bundles can still import, but glTF model reconstruction will fail with a readable error.

## 1) Export bundle from MotionForge

In MotionForge web app:

1. Apply your staged edits (or commit staged load).
2. Click `Export Bundle`.
3. Download `motionforge-bundle.zip`.

Bundle contents:
- `project.json`
- `motionforge-manifest.json` (metadata, optional but preferred)
- `assets/*` (embedded binaries)

## 2) Install the Unity integration package

In Unity Package Manager:

1. `Add package from disk...`
2. Select `integrations/unity/MotionForge.Unity/package.json`

## 3) Import bundle in Unity

Menu path:

- `Tools -> MotionForge -> Import Bundle`

Flow:

1. Choose `motionforge-bundle.zip`.
2. Optional: keep `Create and attach Animator Controller` enabled.
3. Click `Import Bundle`.

Importer outputs:

- Files extracted under `Assets/MotionForgeImports/<BundleName>_<timestamp>/`
- Scene hierarchy root `MotionForgeImport_<BundleName>`
- Generated `.anim` clip(s) in `.../Animations/`:
  - If `animation.takes[]` exists: one clip per take (`<Bundle>_<Take>.anim`)
  - If no takes exist: one fallback `Main` clip
- Optional Animator Controller attached to root:
  - one state per take/clip
  - default state is the first take by start time

## 4) Binding and track mapping

MotionForge writes stable `bindPath` fields in project JSON:

- `objects[*].bindPath`
- `modelInstances[*].bindPath`
- `animation.tracks[*].bindPath` (when available)

Unity importer binds animation curves in this order:

1. `track.bindPath`
2. object id -> serialized bindPath map
3. name fallback (with ambiguity warning)

TRS mapping:

- `position.x/y/z` -> `m_LocalPosition.x/y/z`
- `rotation.x/y/z` -> `localEulerAnglesRaw.x/y/z` (MotionForge radians converted to Unity degrees)
- `scale.x/y/z` -> `m_LocalScale.x/y/z`

Interpolation mapping:

- `linear` -> linear tangents
- `step` -> constant tangents
- `easeIn/easeOut/easeInOut` -> auto tangents approximation

Rotation reliability strategy:

- Unity curves use Euler bindings: `localEulerAnglesRaw.x/y/z`.
- MotionForge radians are converted to degrees.
- Importer applies angle unwrapping per curve to avoid `350 -> 10` jump discontinuities.
- Limitation: Euler-based curves can still exhibit gimbal-like artifacts for complex 3-axis motion.

## 5) Multi-take import workflow

1. In MotionForge, define `animation.takes[]` (or use script `take "<name>" from <t0> to <t1>`).
2. Export `motionforge-bundle.zip`.
3. Import in Unity via `Tools -> MotionForge -> Import Bundle`.
4. Confirm generated clips under `Assets/MotionForgeImports/.../Animations/`.
5. Select imported root and verify Animator has one state per take.

## 6) Recommended agentic workflow

1. `mf.skill.generateScript`
2. `mf.script.run` (`previewOnly`)
3. `mf.script.run` (`apply`, `confirm=true`)
4. Export Bundle
5. Import Bundle in Unity

This keeps edits deterministic and reviewable before Unity import.

## Limitations

- TRS animation tracks only.
- No IK/constraints/rig retargeting pipeline.
- Easing variants are approximated with Unity tangent modes.
- glTF child-node binding depends on stable exported `bindPath`; legacy bundles may fall back to names.
