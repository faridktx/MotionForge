# Project Format

MotionForge projects are stored as JSON files. This document describes the schema.

## Version

Current version: `2`

The `version` field must be present at the top level. v1 files (without animation data) are loaded with full backward compatibility.

## Schema

```json
{
  "version": 2,
  "objects": [
    {
      "id": "obj_1",
      "name": "Cube",
      "geometryType": "box",
      "color": 4490495,
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1]
    }
  ],
  "camera": {
    "position": [4, 3, 4],
    "target": [0, 0, 0],
    "fov": 50
  },
  "animation": {
    "durationSeconds": 5,
    "tracks": [
      {
        "objectId": "obj_1",
        "property": "position.x",
        "keyframes": [
          { "time": 0, "value": 0, "interpolation": "linear" },
          { "time": 2, "value": 3, "interpolation": "linear" }
        ]
      }
    ]
  }
}
```

### Top-level fields

| Field       | Type   | Required | Description                        |
| ----------- | ------ | -------- | ---------------------------------- |
| `version`   | number | yes      | Schema version (currently 2)       |
| `objects`   | array  | yes      | List of scene objects              |
| `camera`    | object | no       | Camera state at save time          |
| `animation` | object | no       | Animation clip (v2+, absent in v1) |

### Object fields

| Field          | Type                        | Description            |
| -------------- | --------------------------- | ---------------------- |
| `id`           | string                      | Unique identifier      |
| `name`         | string                      | Display name           |
| `geometryType` | `"box" / "sphere" / "cone"` | Primitive geometry type|
| `color`        | number                      | Hex color as integer   |
| `position`     | `[x, y, z]`                | World position         |
| `rotation`     | `[x, y, z]`                | Euler rotation in radians |
| `scale`        | `[x, y, z]`                | Scale factors          |

### Camera fields

| Field      | Type         | Description                |
| ---------- | ------------ | -------------------------- |
| `position` | `[x, y, z]` | Camera world position      |
| `target`   | `[x, y, z]` | OrbitControls target point |
| `fov`      | number       | Field of view in degrees   |

### Animation fields

| Field            | Type   | Description                    |
| ---------------- | ------ | ------------------------------ |
| `durationSeconds`| number | Total clip duration in seconds |
| `tracks`         | array  | Array of animation tracks      |

### Track fields

| Field       | Type   | Description                                          |
| ----------- | ------ | ---------------------------------------------------- |
| `objectId`  | string | ID of the target object                              |
| `property`  | string | One of: `position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z` |
| `keyframes` | array  | Sorted array of keyframes                            |

### Keyframe fields

| Field           | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `time`          | number | Time in seconds                       |
| `value`         | number | Property value at this time           |
| `interpolation` | string | `"linear"` or `"step"`               |

## Storage

- **localStorage:** Saved under the key `motionforge_project`
- **File import:** Any `.json` file matching this schema
- **File export:** Downloaded as `motionforge-project.json`

## Backward compatibility

v1 files (version 1, no `animation` field) are fully supported. When loading a v1 file, the animation clip is reset to an empty 5-second clip.

## Supported geometry types

Currently only three primitive types are supported:
- `box` (1x1x1 BoxGeometry)
- `sphere` (radius 0.5, 32 segments SphereGeometry)
- `cone` (radius 0.5, height 1, 32 segments ConeGeometry)

Future phases will add mesh import and custom geometry support.

## Validation

The `@motionforge/engine` package exports a `validateProjectData()` function that checks a parsed JSON object against this schema at runtime, including optional animation validation for v2 data.
