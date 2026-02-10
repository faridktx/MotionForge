# MotionForge Documentation

Use this index as the starting point for product architecture, file format details, release checks, and demo validation.

## Product and System Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): runtime model, rendering, timeline, persistence, and reliability design.
- [PROJECT_FORMAT.md](PROJECT_FORMAT.md): JSON schema versions, compatibility guarantees, and serialization rules.
- [AGENT_API.md](AGENT_API.md): deterministic agent query/execute contract and snapshot semantics.
- [SKILLS.md](SKILLS.md): high-level skills built on agent commands.
- [AGENT_RUNNER.md](AGENT_RUNNER.md): script plan schema and staged execution behavior.
- [SCRIPTING.md](SCRIPTING.md): MotionForge Script DSL grammar, validation, and compile/apply flow.
- [MCP.md](MCP.md): external MCP server tools, headless limits, and local connection setup.
- [GAME_DEV.md](GAME_DEV.md): Unity interchange package workflow and limitations.
- [UNITY.md](UNITY.md): full Bundle -> Unity importer walkthrough and track binding behavior.
- [UNITY_VERIFY.md](UNITY_VERIFY.md): exact 6-step Unity verification harness for imported bundles.

## Operation and Validation Docs

- [DEMO_SMOKE.md](DEMO_SMOKE.md): operator script for pre-demo/manual regression checks.
- [../RELEASE_GATE.md](../RELEASE_GATE.md): strict quality gate and required verification commands.
- [../RELEASE.md](../RELEASE.md): release cut process and artifact expectations.

## Deployment

- [DEPLOY.md](DEPLOY.md): web deployment options and environment notes.
