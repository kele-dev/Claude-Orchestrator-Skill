---
name: resume
description: Writes and reads orchestrator checkpoints so long work continues in a new session after a context limit, rate limit, compaction, or crash. Use when the user types /orchestrator:resume, or when the on/team/autopilot rules say to write a checkpoint.
argument-hint: [<checkpoint name>]
---

# Checkpoints: continue in a new session

Arguments: $ARGUMENTS

`<store>` is defined in the `learn` skill (per-project folder under `~/.claude/orchestrator/`, same from every git worktree, outside the repo). Opus never edits files: every write or delete goes to `orchestrator:haiku-coder` (`TYPE: CREATE` or `TYPE: EDIT`) with the absolute `<store>` path.

## Location
- `<store>/checkpoints/<slug>.md`, slug = kebab-case task name, max 5 words.
- One file per task, overwritten each time. No history.
- Never write checkpoints inside the repo or a worktree.
- Legacy (v1.6.0 and older): `<main>/.claude/orchestrator/checkpoints/*.md` is read only when `<store>/checkpoints/` has none. Never delete legacy files from a worktree session; new checkpoints go to `<store>`.

## When to write
- At every stop that is not DONE: BLOCKED, DECISION NEEDED, cap or batch limit reached.
- After each team wave when more waves remain.
- After every 3rd autopilot batch.
- Before suggesting a new session for a long conversation.

## Content (max 40 lines)
- Task: one line.
- Mode: on / team / autopilot, with its arguments (caps, commit=batch).
- Branch and last verified commit (or a `git diff --stat` summary).
- PRD: path under docs/prd, or a summary of at most 10 lines.
- Plan table: lane or batch -> files -> PASS / BLOCKED / TODO.
- Caps used vs allowed.
- Open decisions or blockers.
- Next step: exact and actionable.
- Lessons used: names only.
- Updated: date.
- Write facts in your own words. Never include secrets.

## Reading (`/orchestrator:resume`)
- No argument: list checkpoints in `<store>/checkpoints/` (legacy ones if none) (name, task, updated). Load the only or most recent one if unambiguous, else ask which.
- With a name: load that checkpoint.
- Verify cheaply: current branch matches, `git log --oneline -5`, `git status --porcelain`.
- Trust PASS items unless git contradicts them.
- Do not re-plan and do not re-read the project. Continue at Next step, in the recorded mode, with the remaining caps.
- If git contradicts the checkpoint, report the mismatch in max 3 lines and ask.

## Finishing
- When the task reaches DONE, delete its checkpoint (`orchestrator:haiku-coder`, `TYPE: EDIT`) and say so in the report line.
