---
name: maestro
description: Codex writes code, Gemini (Antigravity CLI) reads and reviews with no tools, Claude plans and verifies, under the orchestrator cost rules. Per-project opt-in. Only runs when the user types /orchestrator:maestro.
argument-hint: "[setup | enable | disable | status] [effort=low|medium|high] [--dry-run] <task description>"
disable-model-invocation: true
---

# Maestro mode: Codex and Gemini as workers

Task: $ARGUMENTS

Maestro is `orchestrator:on` with two workers. Every `orchestrator:on` rule applies (load it first if it is not in context). Maestro only changes who executes and who reviews. Routing, profiles, the status table and the secret-path list are in `workers.md` in this skill folder, read on demand.

- Running `node "${CLAUDE_PLUGIN_ROOT}/scripts/maestro-run.mjs" codex ...` is a delegation: the script is the executor. Only inside `/orchestrator:maestro`, never from `orchestrator:on`. Every other main-session shell write stays forbidden. The script applies a worker's patch to the session's working tree only after its own checks pass, and the script itself refuses `codex`/`gemini` with `DISABLED` when the project is not enabled.
- Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/maestro-run.mjs" <sub> ...`.
- Briefs and prompts: Write to `<store>/maestro/briefs/<task>.md` (`<store>`: the session-start `Orchestrator store:` line, or `store` in the `setup` summary).

## 0. Setup check
- Run `setup`. Missing CLI, no login, or not enabled: show one short table of what is missing, the install or login commands (login is the user's step), ask once whether to enable for this project (`enable`); stop.
- `enable` / `disable` / `status`: run the subcommand, show its summary, stop.

## 1-2. Plan and PRD
- Plan and PRD as in `orchestrator:on`.
- Each task gets a profile: `code`, `fix`, `review` or `read` (see `workers.md`).
- Code-writing tasks always go to Codex.
- Untracked files are invisible to Codex: never route a task whose input is an untracked file; say so and use the `orchestrator:on` ladder.
- Show one routing table (task, worker, effort), then run without waiting (unless `--dry-run`, which stops here).

## 3. Delegate
- One Codex task at a time: `codex --task <slug> --brief <file> --files <a,b>` with `run_in_background: true`.
- Gemini runs (`gemini --task ...`) may overlap a Codex run.
- Do not launch edit agents while a Codex run is active. Never poll.
- Partial work is discarded, not continued: a retry starts over with the next worker, and the failed summary goes into the brief.

## 4. Verify by summary status
- `PASS`: review `git diff` of the task files yourself, run the project check.
- Any other status: act per the table in `workers.md`.

## 5. Review
- `gemini --task <slug> --prompt <file> --profile review --diff HEAD`. The prompt file holds the review instructions; write it with Write into the briefs folder (`<store>/maestro/briefs/`). Read only the findings and the lines they point to, decide each.
- Decision 6 for `opus-reviewer` (non-Opus main session): a Gemini PASS with no high finding replaces the final-diff pass. `opus-reviewer` still reviews the final diff when any of these holds: Gemini did not PASS (fails, quota, denied, timeout), Gemini found a high issue, the work has more than 5 tasks, or it touches schema, auth or security.

## 6. Report
- The `orchestrator:on` table plus a `worker` column (codex, gemini, haiku, sonnet).
- Quota line, e.g. `Quota: codex 2 runs (227k in) · gemini 3 of 100 runs today`.
- The token line still lists Claude agents.
