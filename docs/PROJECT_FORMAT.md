# Project Format

MotionForge projects are stored as JSON files. This document describes versions `1`, `2`, and `3`.

## Version

Current version: `3`

- `v1`: scene objects only (no animation).
- `v2`: adds animation clip data.
- `v3`: adds asset metadata + model instances for imported glTF content.

Backward compatibility is preserved: `v1` and `v2` continue to load.

## Schema (v3 example)

```json
{
  "version": 3,
  "objects": [
    {
      "id": "obj_1",
      "name": "Cube",
      "geometryType": "box",
      "color": 4490495,
      "metallic": 0.1,
      "roughness": 0.8,
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1]
    }
  ],
  "assets": [
    {
      "id": "asset_1",
      "name": "robot.glb",
      "type": "gltf",
      "source": {
        "mode": "embedded",
        "fileName": "robot.glb",
        "data": "AA..."
      },
      "size": 1024
    }
  ],
  "modelInstances": [
    {
      "id": "obj_5",
      "name": "Robot",
      "assetId": "asset_1",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "materialOverrides": [
        {
          "nodePath": "root/Body_0",
          "color": 16777215,
          "metallic": 0.3,
          "roughness": 0.6
        }
      ]
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
          { "time": 2, "value": 3, "interpolation": "easeInOut" }
        ]
      }
    ]
  }
}
```

## Top-level fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | number | yes | `1`, `2`, or `3` |
| `objects` | array | yes | Primitive scene objects |
| `assets` | array | v3 optional | Asset registry metadata |
| `modelInstances` | array | v3 optional | Scene instances of imported assets |
| `camera` | object | no | Camera state |
| `animation` | object | no | Animation clip (`v2+`) |

## Primitive object fields (`objects[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable object identifier |
| `name` | string | Display name |
| `geometryType` | `"box" \| "sphere" \| "cone"` | Primitive type |
| `color` | number | Base color (hex integer) |
| `metallic` | number | Optional, `[0,1]` |
| `roughness` | number | Optional, `[0,1]` |
| `position` | `[x,y,z]` | Finite numbers |
| `rotation` | `[x,y,z]` | Finite numbers (radians) |
| `scale` | `[x,y,z]` | Finite numbers |

## Asset fields (`assets[]`, v3)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Asset identifier |
| `name` | string | File display name |
| `type` | `"gltf"` | Currently only glTF assets |
| `source` | object | Embedded or external |
| `size` | number | Byte size, `>=0` |

`source` variants:
- Embedded: `{ "mode": "embedded", "fileName": string, "data": base64 }`
- External reference: `{ "mode": "external", "path": string }`

## Model instance fields (`modelInstances[]`, v3)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Scene object ID for root instance |
| `name` | string | Instance display name |
| `assetId` | string | Must reference an existing `assets[*].id` |
| `position` | `[x,y,z]` | Finite numbers |
| `rotation` | `[x,y,z]` | Finite numbers |
| `scale` | `[x,y,z]` | Finite numbers |
| `materialOverrides` | array | Optional per-node material values |

`materialOverrides[]` entries:
- `nodePath`: string path within imported hierarchy
- `color`: number (hex integer)
- `metallic`: number in `[0,1]`
- `roughness`: number in `[0,1]`

## Animation fields (`animation`)

| Field | Type | Notes |
| --- | --- | --- |
| `durationSeconds` | number | `(0, 3600]` |
| `tracks` | array | Keyframe tracks |

Track `property` is one of:
- `position.x`, `position.y`, `position.z`
- `rotation.x`, `rotation.y`, `rotation.z`
- `scale.x`, `scale.y`, `scale.z`

Keyframes:
- `time`: number in `[0, durationSeconds]`
- `value`: finite number
- `interpolation`: `linear`, `step`, `easeIn`, `easeOut`, `easeInOut`

## Storage and export

- Local save: `localStorage` key `motionforge_project`.
- JSON export: single file (`motionforge-project.json`).
- Bundle export: zip (`motionforge-bundle.zip`) with:
  - `project.json`
  - `assets/*` (embedded asset bytes when available)

## Validation

Validation is provided by `@motionforge/engine`:

- `validateProjectData()`
- `validateProjectDataDetailed()`

Key rules:
- `version` must be supported.
- `assets` and `modelInstances` are only valid in `v3`.
- `modelInstances[*].assetId` must reference an existing asset.
- Numeric vectors and keyframe/material values must be finite and in valid ranges.

Invalid imports are rejected with a user-visible error and do not replace the current scene.
