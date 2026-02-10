# Agent API

Location: `apps/web/src/lib/agent/agentApi.ts`

## Overview

`agentApi` provides a deterministic JSON interface for automation and testing:

- `getCapabilities()`
- `getStateSnapshot()`
- `execute(action, input)`

All mutation paths must execute through `commandBus`.

## `getCapabilities()`

Returns a stable list of supported action contracts.

Current actions:

1. `command.execute`
2. `state.snapshot`

Each capability includes:

- `action`
- `description`
- `inputSchema` (schema-like JSON)

## `getStateSnapshot()`

Returns a JSON-safe summary with no binary payloads:

- `scene`: selected id, node count, sorted node list
- `keyframeSelection`: sorted selected key refs
- `assets`: count and metadata only (`id`, `name`, `type`, `sourceMode`, `size`)
- `animation`: duration, track/keyframe counts, sorted track summaries
- `playback`: time and playing state

Determinism constraints:

- arrays are sorted (`id`, `property`, `time`)
- numbers are normalized (fixed precision for times/duration)

## `execute(action, input)`

Returns:

```json
{
  "ok": true,
  "result": {},
  "events": [],
  "error": null
}
```

Execution semantics:

- validates supported action and input shape
- for `command.execute`, dispatches through `commandBus.executeWithResult(..., { respectInputFocus: false })`
- enforces command enabled predicates
- reports deterministic event objects:
  - `command.executed`
  - `command.rejected`

Error semantics:

- unknown action -> `ok=false`
- invalid input -> `ok=false`
- disabled/missing/failed command -> `ok=false` with reason surfaced via `error` and events
