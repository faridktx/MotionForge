# Unity Verification Checklist

Use this checklist to verify a MotionForge multi-take bundle in Unity.

## Agentic Flow (3 commands)

1. `pnpm mcp:demo:unity`
2. Unity -> `Tools -> MotionForge -> Import Bundle`
3. Press Play

1. Open a Unity `2022.3` project.
2. Ensure glTFast is installed (`com.unity.cloud.gltfast` in Package Manager).
3. Import bundle with `Tools -> MotionForge -> Import Bundle`.
4. Confirm `.anim` clips are generated per take in `Assets/MotionForgeImports/<Bundle>/Animations/`.
5. Confirm generated Animator Controller has one state per take and default state is the first take.
6. Enter Play mode and confirm object transforms animate for each take.

## Troubleshooting

- If import fails with a glTF importer error, install `com.unity.cloud.gltfast` and re-run import.
- If clips are missing, check that `project.json` contains `animation.takes[]` and `animation.tracks[*].bindPath`.
- If the importer window closes after an error, reopen with `Tools -> MotionForge -> Import Bundle`.
