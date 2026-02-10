# Agent Runner

Location: `apps/web/src/lib/agent/scriptRunner.ts`

## Purpose

Run a JSON action plan deterministically against project JSON while preserving live editor safety.

## Plan Schema

```json
{
  "projectJson": "{...project json string...}",
  "actions": [
    {
      "action": "command.execute",
      "input": {
        "commandId": "agent.hierarchy.renameMany",
        "payload": {
          "changes": [{ "objectId": "demo_cube", "name": "Agent Cube" }]
        }
      }
    }
  ]
}
```

## Result Schema

```json
{
  "finalProjectJson": "{...}",
  "reports": [
    {
      "index": 0,
      "action": "command.execute",
      "ok": true,
      "error": null,
      "result": {},
      "events": []
    }
  ],
  "exports": [
    { "type": "bundle", "payload": {} }
  ],
  "error": null
}
```

## Determinism and Safety

- Input project is validated via existing parse/migration pipeline.
- Execution runs in staged mode:
  - load input project
  - run actions sequentially
  - collect deterministic reports
  - capture final JSON
- Live project state is restored to baseline in `finally`, even on failure.
- Mid-script failure does not leave partial live mutations.

## Export Support

- Bundle export: captured as structured export payload.
- Video export: preview command payload supported for headless automation.

## Example Use

- Dev Tools Agent Console in Settings accepts this plan JSON and shows run report.
