# MotionForge Unity Integration

This UPM package adds a Unity Editor importer for `motionforge-bundle.zip` exports.

Menu:

- `Tools -> MotionForge -> Import Bundle`

What it does:

- Unzips bundle content into `Assets/MotionForgeImports/...`
- Loads `project.json` (+ optional `motionforge-manifest.json`)
- Reconstructs primitives/model roots
- Generates Unity `AnimationClip` assets from MotionForge TRS tracks
  - one clip per `animation.takes[]` range when present
  - otherwise one fallback `Main` clip
- Optionally creates/assigns an Animator Controller with one state per clip

Requirements:

- Unity `2022.3+`
- glTFast package installed in Unity project for glTF asset reconstruction:
  - default expected package: `com.unity.cloud.gltfast`
