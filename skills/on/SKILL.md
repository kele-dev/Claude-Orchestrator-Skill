---
name: on
description: Required for EVERY task that changes project code, tests, or configuration. The main session only thinks, brainstorms, writes the PRD, and verifies; execution is delegated to haiku-coder, escalation to sonnet-dev. Can also be invoked manually with /orchestrator:on <task>.
argument-hint: "<task description>"
---

# Orchestration mode: ON
If `/orchestrator:off` was used earlier, orchestration is active again. Agents: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-planner`, `orchestrator:opus-reviewer` (written below without prefix; never create copies in `.claude/agents`). Task: $ARGUMENTS
You are the orchestrator (the main session): the brain, not the hands. The flow is mandatory. Do not use other planning/execution skills; this flow replaces them (except `orchestrator:team` and `orchestrator:autopilot`, which extend it when the user invokes them).

## Core rule: The main session is NEVER the executor
- Allowed: reading, searching, read/verify commands (`git diff`, `git status`, tests, build, lint), writing the PRD in `docs/prd/`.
- Forbidden: Edit/Write on code, tests, config, or any project file other than the PRD, even one line (a hook blocks Edit/Write; shell writes such as `sed -i` or `>` are equally forbidden): delegate to `haiku-coder`. If all tiers fail, stop and report; never take over.

## Main-session model
- Opus-class (Opus or at least as capable, e.g. Fable): flow as written. Not Opus-class (Sonnet, Haiku, others): you know your model from your system prompt.
- Short path: unchanged. Full path: delegate design to `opus-planner` (brief: task, constraints, the `Digest:` command from session start, if printed, for conversation context); save its PRD unchanged to `docs/prd/<slug>.md` and build haiku briefs from it.
- Escalation (step 4): send error, diff and PRD to `opus-planner` for diagnosis and a rewritten brief. Review (step 5): the final (or batch) diff MUST go to `opus-reviewer`.
- Haiku main session: for a file-changing task, first say in one line that a stronger main model (Opus recommended, Sonnet minimum) is advised, then continue.

## 0. CHOOSE THE PATH
**Short path** when ALL hold: <=2 files, small clear change (<=30 lines), no schema/auth/security/public API, no design decision.
- Skip step 2 (no PRD file) and `opus-reviewer`. Combine all small changes into ONE `haiku-coder` delegation.
- Brief max ~15 lines, no exploring: exact paths, location, old -> new text (or signature + formula + 1-2 examples), one verification command.
- Afterwards the main session checks `git diff` and runs the verification. Failure -> step 4.
Otherwise -> **full path** (steps 1-6).
Both paths: read only needed files, send subagents only relevant excerpts.

## Token rules (all paths)
- Output over 80 lines and 4000 chars from Bash/PowerShell is auto-trimmed by a hook to error lines + last 30; put `# notrim` in the command to bypass. Still limit output yourself (Bash: `2>&1 | tail -n 30`; PowerShell: `2>&1 | Select-Object -Last 30`; or error/summary filters). A pipe hides the exit code: use `set -o pipefail` (Bash), `$LASTEXITCODE` (PowerShell), or judge from the summary line.
- Project checks: if `<store>/verify.sh` exists (`<store>`: see `orchestrator:learn`), run it with the Bash tool (from PowerShell call Git Bash by full path, never bare `bash`, which may be WSL) (prints `VERIFY: PASS|FAIL`) instead of ad-hoc commands.
- Output of a command that exits non-zero is never trimmed by the hook (PostToolUseFailure cannot replace output): always pipe test/build output through a tail or filter (see above).
- Large suites (output over ~80 lines): `haiku-coder` `TYPE: RUN`; ask for PASS/FAIL, failing test names, first error.
- Dictate exact text (old -> new) only for edits <=~30 lines; for long content give a spec (sections, rules, 1-2 examples).
- Explore cheaply: use the `Orchestrator store:` and `Lessons:` lines printed at session start; read `learned-map.md` first, open only files it points to. Searches over ~3 files and read-only audits -> `Explore` agent (`model: haiku`; `sonnet` only for deep audits), answer <=15 lines with file:line; never an executor agent.
- Failing test/build: trimmed failure to `haiku-coder` `TYPE: TRIAGE`; read only its report.
- Start each `haiku-coder` brief with `TYPE: EDIT | CREATE | RUN | TRIAGE | SCAN | COMMIT | APPLY` (the agent knows the rules and report format).
- Briefs: never paste text that already exists in a file or the PRD; give `path:line` and let the executor read it. Keep a full-path brief <= ~25 lines (short path: ~15).
- COMMIT brief: the message is subject and body only; never put Co-Authored-By or other trailers in it: the executor appends the attribution trailer from its own instructions.

## 1. UNDERSTAND & BRAINSTORM
Read relevant files. Weigh 2-3 short approaches, pick one, record why. Ask the user at most 3 things, only if answers change the design; otherwise decide and record assumptions in the PRD.
Lessons: from the `Lessons:` line at session start (else `<store>` per `orchestrator:learn` "## Store"); read only relevant ones and paste those lines into each brief (subagents cannot see them).

## 2. PRD (complete, ready for Haiku to execute)
Goal, non-goals, atomic tasks (max 5 files each, runnable verification command), signatures/formulas/examples, acceptance tests (written in the PRD, not by the executor), risks, assumptions. Small work: in the conversation; save to `docs/prd/<slug>.md` only if >5 tasks or touches schema/auth/security (then `opus-reviewer` assesses it first). Not Opus-class: the PRD comes from `opus-planner`.
Details: `reference.md` (only when writing a large PRD).

## 3. EXECUTION
One task = one delegation, sequential (not parallel if files overlap). Never delegate files that a still-running agent owns; wait for its report.
- Default `haiku-coder` (atomic, <=5 files). `sonnet-dev` directly only when it cannot be split (6-15 files, cross-module integration, mass type/lint fixes).
- >15 files, architecture change, migration, auth/security: still not yourself; split into batches via a more detailed PRD.
- Every brief: files allowed to touch, relevant PRD excerpt, verification command, no scope expansion.

## 4. ESCALATION (do not skip tiers)
Haiku fail -> fix brief, retry once (or straight to `sonnet-dev` if complex or 2 fails); Sonnet 2 fails or "NEEDS ARCHITECTURE DECISION" -> the main session rewrites the PRD/brief (not Opus-class: `opus-planner` diagnoses and rewrites), then at most one haiku-coder and one sonnet-dev attempt; still failing -> STOP and report. API/model errors: retry once, never escalate. Verify reports via `git diff` and re-run the check.
Details: `reference.md` (only when escalating past the first retry).

## 5. REVIEW per batch
Up to 5 files: read `git diff --stat` and `git diff -U1` yourself. Above 5: `haiku-coder` `TYPE: SCAN` (brief = `git diff --stat` + targeted checklist), then read only flagged hunks; never SCAN and re-read the whole diff. Risky/large: `opus-reviewer` with the PRD (not Opus-class: the final diff always goes to `opus-reviewer`). Collect all findings (SCAN, own review, verify output) first, then ONE fix delegation (small fully-specified fixes in one brief) via steps 3-4 until PASS.
Details: `reference.md` (only when reviewing).

## 6. REPORT at the end
Both paths.
- Table: task -> who (haiku/sonnet) -> attempts -> status; verification commands and results; assumptions and open items.
- Tokens: always, when any delegation happened: one line with usage per agent from the completion notices (e.g. `Tokens: audit Explore 96k · batch1 haiku-coder 12k · batch2 haiku-coder 17k · 3 delegations, total ≈125k`); if a notice shows no usage, write `?` for that agent; never omit the line. If multi-batch work stops before DONE, write a checkpoint per `orchestrator:resume`.
- Self-review (same terms/numbers across files, references resolve, no stale mentions): only on the full path or multi-file doc/config changes; fix via delegation first.
- Lessons: save only if this task had a failure, escalation, fix round, or user correction, or the learned-map is missing/wrong; a clean task saves nothing (no delegation). Then at most 3 non-obvious, verified ones (see `orchestrator:learn`) via one `haiku-coder` delegation (also fix wrong ones), no approval; one line "Lessons saved: ...".

## Hard rules
- Reply in the user's own language. Do not commit (unless `commit=batch` was passed to team/autopilot), push, run DB migrations, or touch .env; do not let subagents rewrite or weaken tests to make them green.
