# Unity Verification Checklist

Use this checklist to verify a MotionForge multi-take bundle in Unity.

1. Open a Unity `2022.3` project.
2. Ensure glTFast is installed (`com.unity.cloud.gltfast` in Package Manager).
3. Import bundle with `Tools -> MotionForge -> Import Bundle`.
4. Confirm `.anim` clips are generated per take in `Assets/MotionForgeImports/<Bundle>/Animations/`.
5. Confirm generated Animator Controller has one state per take and default state is the first take.
6. Enter Play mode and confirm object transforms animate for each take.
