---
name: resume
description: Writes and reads orchestrator checkpoints so long work continues in a new session after a context limit, rate limit, compaction, or crash. Use when the user types /orchestrator:resume, or when the on/team/autopilot rules say to write a checkpoint.
argument-hint: "[<checkpoint name>]"
---

# Checkpoints: continue in a new session

Arguments: $ARGUMENTS

`<store>` is defined in the `learn` skill (per-project folder under `~/.claude/orchestrator/`, same from every git worktree, outside the repo). Use the session-start `Orchestrator store:` and `Checkpoints:` lines when present; run the Store command only if they are missing. Every write or delete goes to `orchestrator:haiku-coder` (`TYPE: CREATE`, or `TYPE: RUN` for a delete) with the absolute `<store>` path.

## Location
- `<store>/checkpoints/<slug>.md`, slug = kebab-case task name, max 5 words.
- One file per task, overwritten each time. No history.
- Never write checkpoints inside the repo or a worktree.
- Legacy checkpoints are also read (`legacy.md` in the `orchestrator:learn` folder; only if legacy files exist); new ones always go to `<store>`.

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
- No argument: list checkpoints from `<store>/checkpoints/` plus legacy `<main>/.claude/orchestrator/checkpoints/*.md` (legacy ones marked "(legacy)"): name, task, updated. Load the only or most recent one if unambiguous, else ask which.
- With an argument: load the checkpoint with that name; if none matches, treat the argument as keywords and match them against each checkpoint's `Task:` line (load a single match, else list the candidates and ask).
- No checkpoints found: say so in one line, search no further, and offer to start the task fresh with `orchestrator:on`.
- Verify cheaply: current branch matches, `git log --oneline -5`, `git status --porcelain`.
- Trust PASS items unless git contradicts them.
- Do not re-plan and do not re-read the project. Continue at Next step. If the recorded mode is team or autopilot, those modes are user-invoked only: do not continue in that mode; tell the user in one line to run `/orchestrator:team ...` or `/orchestrator:autopilot ...` with the remaining task and caps from the checkpoint. Otherwise continue in `on`.
- If git contradicts the checkpoint, report the mismatch in max 3 lines and ask.

## Finishing
- When the task reaches DONE, delete only its checkpoint in `<store>`, via `orchestrator:haiku-coder` `TYPE: RUN` with `rm "<absolute path>"` (RUN may delete only the file named in the brief), and say so in the report line.
- A finished legacy checkpoint: tell the user its path; never delete it yourself.
