---
name: status
description: "Shows the orchestrator state in one short block: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps. Read-only. Only runs when the user types /orchestrator:status."
disable-model-invocation: true
---

# Orchestrator status (read-only)

`<main>` is defined in the `learn` skill. This skill writes nothing and delegates nothing: Opus may run the read-only commands below itself (reading is allowed under `orchestrator:on`). Do not read lesson bodies or checkpoint bodies beyond the lines named.

## Collect
- Mode: `on` unless the latest of `/orchestrator:on` / `/orchestrator:off` in this conversation is off; note whether `team` or `autopilot` is running.
- Plugin version: `version` from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; if that variable is not resolved, read `.claude-plugin/plugin.json` two folders above this skill's folder; if neither works, show `unknown`.
- `<main>`: the parent folder of `git rev-parse --path-format=absolute --git-common-dir`, as in `learn` (outside git: project root, and say "not a git repo").
- Lessons: each `<main>/.claude/skills/learned-*/SKILL.md` -> folder name + its frontmatter `description` (frontmatter only). Flag whether `learned-map` exists; if missing, suggest `/orchestrator:init`.
- Checkpoints: each `<main>/.claude/orchestrator/checkpoints/*.md` -> name, its `Task:` line, its `Updated:` line. If any exist, suggest `/orchestrator:resume <name>`.
- Excludes: whether `<git-common-dir>/info/exclude` contains `.claude/skills/learned-*/` and `.claude/orchestrator/`; if a lesson or checkpoint exists but its line is missing, warn (it could be committed by accident).
- Session: delegations so far per agent (haiku-coder, sonnet-dev, opus-reviewer), counted from this conversation; "unknown" after a compaction.

## Caps (defaults)
- Team: 3 lanes, 2 fix rounds per lane; auto-raise up to 4 lanes / 4 rounds while fixes progress.
- Autopilot: 5 batches, 2 fix rounds per batch; auto-raise up to 8 batches / 4 rounds while work passes.
- A cap the user sets (`lanes=N`, `batches=N`) is never raised.

## Report
- One table `Item | Value`, max 12 rows, then at most 2 suggestion lines (init / resume / exclude fix).
- No preamble. Reply in the user's language.
