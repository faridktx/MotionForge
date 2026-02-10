# Project Format

MotionForge projects are stored as JSON files. This document describes versions `1`, `2`, `3`, and `4`.

## Version

Current version: `4`

- `v1`: scene objects only (no animation).
- `v2`: adds animation clip data.
- `v3`: adds asset metadata + model instances for imported glTF content.
- `v4`: shipping-hardening format; legacy projects are migrated to v4 before validation/load.

Backward compatibility is preserved: `v1`, `v2`, and `v3` continue to load.

## Schema (v4 example)

```json
{
  "version": 4,
  "objects": [
    {
      "id": "obj_1",
      "name": "Cube",
      "bindPath": "Cube",
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
      "bindPath": "Robot",
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
    "takes": [
      { "id": "take_idle", "name": "Idle", "startTime": 0, "endTime": 2 },
      { "id": "take_recoil", "name": "Recoil", "startTime": 2, "endTime": 2.4 }
    ],
    "tracks": [
      {
        "objectId": "obj_1",
        "bindPath": "Cube",
        "property": "position.x",
        "keyframes": [
          { "time": 0, "value": 0, "interpolation": "linear" },
          { "time": 2, "value": 3, "interpolation": "easeInOut" }
        ]
      }
    ]
  },
  "exportSettings": {
    "video": {
      "format": "mp4",
      "width": 1280,
      "height": 720,
      "fps": 30,
      "durationSeconds": 2,
      "transparentBackground": false
    }
  }
}
```

## Top-level fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | number | yes | `1`, `2`, `3`, or `4` |
| `objects` | array | yes | Primitive scene objects |
| `assets` | array | v3 optional | Asset registry metadata |
| `modelInstances` | array | v3 optional | Scene instances of imported assets |
| `camera` | object | no | Camera state |
| `animation` | object | no | Animation clip (`v2+`) |
| `exportSettings` | object | no | Optional export UI defaults |

## Primitive object fields (`objects[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable object identifier |
| `name` | string | Display name |
| `bindPath` | string | Stable hierarchy binding path for downstream importers |
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
| `bindPath` | string | Stable hierarchy binding path for root instance |
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
| `takes` | array | Optional clip slices for multi-take exports/importers |
| `tracks` | array | Keyframe tracks |

Take fields (`animation.takes[]`):
- `id`: stable take id
- `name`: display name (`Idle`, `Recoil`, etc.)
- `startTime`: inclusive start in seconds
- `endTime`: exclusive-ish end in seconds (`endTime > startTime`)

Compatibility behavior:
- If `takes` is missing, importers should treat the full duration as one take: `Main` (`0..durationSeconds`).
- v1/v2/v3/v4 loads synthesize a fallback `take_main` when animation exists and no takes are present.

Track `property` is one of:
- `position.x`, `position.y`, `position.z`
- `rotation.x`, `rotation.y`, `rotation.z`
- `scale.x`, `scale.y`, `scale.z`

Track fields:
- `objectId`: source object id
- `bindPath` (optional): stable hierarchy path for deterministic DCC/engine import
- `property`: transform channel
- `keyframes`: ordered keys

Keyframes:
- `time`: number in `[0, durationSeconds]`
- `value`: finite number
- `interpolation`: `linear`, `step`, `easeIn`, `easeOut`, `easeInOut`

## Optional Export Settings Metadata (`exportSettings`)

Projects may include optional export defaults used by the video export modal.

`exportSettings.video`:
- `format`: `"mp4"` or `"gif"`
- `width`: positive integer
- `height`: positive integer
- `fps`: number in `(0, 60]`
- `durationSeconds`: number in `(0, 120]`
- `transparentBackground`: boolean

Compatibility notes:
- Existing v1/v2/v3 files without `exportSettings` are fully supported.
- Unknown/invalid export metadata should be ignored rather than failing load.

## Storage and export

- Local save: `localStorage` key `motionforge_project`.
- Recent project payloads: IndexedDB database `motionforge_project_payloads` (keyed by recent entry `id`).
- Recent project metadata list: `localStorage` key `motionforge_recent_projects_v1`.
- Autosave snapshot: IndexedDB slot `autosave`.
- JSON export: single file (`motionforge-project.json`).
- Bundle export: zip (`motionforge-bundle.zip`) with:
  - `project.json`
  - `motionforge-manifest.json`
  - `assets/*` (embedded asset bytes when available)

Bundle layout details:
- `project.json` is required.
- `motionforge-manifest.json` is optional but recommended and includes:
  - `version` (manifest schema version)
  - `exportedAt` (ISO timestamp)
  - `projectVersion`
  - `primaryModelAssetId` (if model instances exist)
  - `takes[]` summary for multi-clip importers
  - `clipNaming` metadata (`pattern`, `fallbackTakeName`)
- Embedded asset payloads are emitted under `assets/<assetId>-<sanitizedName>`.
- External assets are emitted as `assets/<assetId>-<sanitizedName>.external.txt` reference notes.
- Bundle import reconstructs embedded `assets[*].source.data` from `assets/*` binaries before deserialization.
- Missing required embedded asset files fail import with a readable error and do not mutate the current scene.

Legacy compatibility:
- Older localStorage recent payload entries are migrated on first run into IndexedDB, then legacy payload keys are cleaned up.

## Validation

Validation is provided by `@motionforge/engine`:

- `validateProjectData()`
- `validateProjectDataDetailed()`

Key rules:
- `version` must be supported.
- `assets` and `modelInstances` are only valid in `v3+`.
- `modelInstances[*].assetId` must reference an existing asset.
- Numeric vectors and keyframe/material values must be finite and in valid ranges.

Invalid imports are rejected with a user-visible error and do not replace the current scene.

## Migration Pipeline

Import uses a pure migration pipeline before validation:

1. `v1 -> v2`
2. `v2 -> v3`
3. `v3 -> v4`

Load path is:

`migrate -> validate -> dry-run deserialize -> atomic commit`

If migration or validation fails, the current live scene remains unchanged.
