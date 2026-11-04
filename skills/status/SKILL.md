---
name: status
description: "Shows the orchestrator state in one short block: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps. Read-only. Only runs when the user types /orchestrator:status."
disable-model-invocation: true
---

# Orchestrator status (read-only)

`<store>` is defined in the `learn` skill. This skill writes nothing and delegates nothing: Opus may run the read-only commands below itself (reading is allowed under `orchestrator:on`). Do not read lesson bodies or checkpoint bodies beyond the lines named.

## Collect
- Mode: `on` unless the latest of `/orchestrator:on` / `/orchestrator:off` in this conversation is off; note whether `team` or `autopilot` is running.
- Plugin version: `version` from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; if that variable is not resolved, read `.claude-plugin/plugin.json` two folders above this skill's folder; if neither works, show `unknown`.
- `<store>`: the path from the one Bash command in `learn` (outside git it uses the project root; say "not a git repo").
- Lessons: each `<store>/lessons/*.md` -> file name + its frontmatter `description` (frontmatter only). Flag whether `learned-map` exists; if missing, suggest `/orchestrator:init`.
- Checkpoints: each `<store>/checkpoints/*.md` -> name, its `Task:` line, its `Updated:` line. If any exist, suggest `/orchestrator:resume <name>`. If the store has none, list legacy checkpoints here instead, marked "(legacy)", as `resume` reads them.
- Legacy: whether `<main>/.claude/skills/learned-*/SKILL.md` or `<main>/.claude/orchestrator/checkpoints/*.md` exist (`<main>` = parent of the git-common-dir). If so, flag them and suggest: they are migrated on the next lesson save; the old folders can then be deleted by the user.
- Session: delegations so far per agent (haiku-coder, sonnet-dev, opus-reviewer), counted from this conversation; "unknown" after a compaction.

## Caps (defaults)
- Team: 3 lanes, 2 fix rounds per lane; auto-raise up to 4 lanes / 4 rounds while fixes progress.
- Autopilot: 5 batches, 2 fix rounds per batch; auto-raise up to 8 batches / 4 rounds while work passes.
- A cap the user sets (`lanes=N`, `batches=N`) is never raised.

## Report
- One table `Item | Value`, max 12 rows, then at most 2 suggestion lines (init / resume / legacy migration).
- No preamble. Reply in the user's language.
