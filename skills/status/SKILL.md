---
name: status
description: "Shows the orchestrator state in one short block: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps. Read-only. Only runs when the user types /orchestrator:status."
disable-model-invocation: true
---

# Orchestrator status (read-only)

`<store>` is defined in the `learn` skill. Use the session-start `Orchestrator store:`, `Lessons:` and `Checkpoints:` lines when present; run the Store command only if they are missing. This skill writes nothing and delegates nothing: the main session may run the read-only commands below itself. Do not read lesson bodies or checkpoint bodies beyond the lines named.

## Collect
- Mode: `on` unless the latest of `/orchestrator:on` / `/orchestrator:off` in this conversation is off; note whether `team` or `autopilot` is running.
- Plugin version: `version` from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; if that variable is not resolved, read `.claude-plugin/plugin.json` two folders above this skill's folder; if neither works, show `unknown`.
- Guards: `active` when the session-start context has a `Guards: active` line (printed only by the Node hooks); `off` when it has `Guards: off`; otherwise `inactive: hooks did not run (Node 18+ not on PATH?)`. The store line does not prove this: the skills can compute the store without Node.
- `<store>`: the path (outside git it uses the project root; say "not a git repo").
- Lessons: each `<store>/lessons/*.md` -> file name + its frontmatter `description` (frontmatter only). Flag whether `learned-map` exists; if missing, suggest `/orchestrator:init`.
- Checkpoints: each `<store>/checkpoints/*.md` -> name, its `Task:` line, its `Updated:` line. If any exist, suggest `/orchestrator:resume <name>`. Also list legacy `<main>/.claude/orchestrator/checkpoints/*.md`, marked "(legacy)" (`legacy.md` in the `orchestrator:learn` folder; only if legacy files exist).
- Legacy: flag if `<main>/.claude/skills/learned-*/SKILL.md` or the legacy checkpoints exist, and suggest per `legacy.md` (`orchestrator:learn` folder; only if legacy files exist).
- Session: delegations so far per agent (haiku-coder, sonnet-dev, opus-planner, opus-reviewer), counted from this conversation; "unknown" after a compaction.
- Main-session tokens: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/budget.mjs" auto --main` (fall back to the plugin root used for the version) and show its MAIN line as one row; sub-agent total: same command without --main.
- Delegation ledger: run `node "${CLAUDE_PLUGIN_ROOT}/hooks/ledger.mjs" --stats "<store>"` and show its LEDGER line as one row (pass rate per tier from <store>/delegations.jsonl, written by the SubagentStop hook; unknown = no STATUS line found, not counted as a failure).
- Trim savings: run `node "${CLAUDE_PLUGIN_ROOT}/hooks/trim-output.mjs" --stats "<store>"` and show its TRIM line as one row (trims and bytes saved this session, from the newest `trim-stats-*.jsonl`).

## Caps
- Show the defaults and ceilings from `caps.md` in this skill's folder (it mirrors the `## Budget` bullets of `team` and `autopilot`; read those only if `caps.md` is missing); never restate numbers from memory. A cap the user sets (`lanes=N`, `batches=N`) is never raised.

## Report
- One table `Item | Value`, max 16 rows (put the caps in one row if more are needed), then at most 2 suggestion lines (init / resume / legacy).
- No preamble. Reply in the user's language.
