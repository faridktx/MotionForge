# MotionForge Game Dev Export (Unity v1)

MotionForge provides a deterministic interchange package for Unity-oriented workflows through MCP:

- `mf.export.unityPackage`

## Export contents

`motionforge-unity-package.zip` includes:

- `project.json` (unless `includeProjectJson=false`)
- `assets/*` for embedded assets
- `README_UNITY.txt` with import notes and warnings

## Unity import workflow

1. Generate project data and assets in MotionForge.
2. Run `mf.export.unityPackage` with an output directory.
3. Unzip package in your Unity workspace.
4. Use `project.json` + `assets/*` with your Unity-side importer/conversion script.
5. Validate transform channels and keyframe timing in Timeline.

## Known limitations

- Headless MCP export does not currently emit `export.gltf`/`export.glb` animation output.
- `mf.export.video` is unsupported in headless mode (`MF_ERR_HEADLESS_VIDEO_UNSUPPORTED`).
- External (referenced) assets are included as reference notes, not binary payloads.

## Roadmap

- glTF animation export from headless runtime.
- Optional FBX pipeline.
- Retargeting helpers for humanoid rigs.
