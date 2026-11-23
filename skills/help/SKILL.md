---
name: help
description: "Lists the orchestrator commands, kill switches and where the docs live, in a short block. Read-only. Only runs when the user types /orchestrator:help."
disable-model-invocation: true
---

# Orchestrator help (read-only)

Print the block below as is (no tool calls, no preamble), translated into the user's language. Keep it short.

Commands:
- `/orchestrator:on [task]` - turn orchestration on (optional `budget=<N>k`)
- `/orchestrator:off` - turn it off for this session
- `/orchestrator:team <task>` - parallel lanes (add `--dry-run` to see the plan)
- `/orchestrator:autopilot <task>` - batch after batch without asking (add `--dry-run`)
- `/orchestrator:init [--refresh]` - map the project once
- `/orchestrator:resume <slug>` - continue from a checkpoint
- `/orchestrator:learn [list | add <lesson> | remove <lesson> | prune]` - project lessons
- `/orchestrator:status` - read-only state summary
- `/orchestrator:help` - this list

Kill switches (env vars): `ORCH_GUARD=off` (edit and review guards), `ORCH_READ_GUARD=off` (large-read guard), `ORCH_NO_TRIM=1` (output trim; or add `# notrim` to one command), `ORCH_LONG=off` (long-session warning), `ORCH_DEBUG=1` (hook errors to stderr and `<tmpdir>/orchestrator-debug.log`). Also `ORCH_STALE_DAYS` (default 14, age before a lesson or checkpoint counts as stale; off disables stale marks) and `ORCH_STATE_DIR` (hook state dir).

Tools: `node scripts/otel-export.mjs <transcript.jsonl> [--out <file>]` (session as OTLP/JSON spans for Jaeger, Langfuse or Grafana; no message content).

Docs: `README.md` in the plugin folder (usage, hooks, data location), `CHANGELOG.md` (release notes per version), lessons and checkpoints in the store shown by `/orchestrator:status`.
