---
name: on
description: Required for EVERY task that changes project code, tests, or configuration. The main session (Opus) only thinks, brainstorms, writes the PRD, and verifies; execution is delegated to haiku-coder, escalation to sonnet-dev. Can also be invoked manually with /orchestrator:on <task>.
argument-hint: <task description>
---

# Orchestration mode: ON
If `/orchestrator:off` was used earlier, orchestration is active again. Agents: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-reviewer` (written below without prefix; never create copies in `.claude/agents`). Task: $ARGUMENTS
You are the orchestrator (Opus): the brain, not the hands. The flow is mandatory. Do not use other planning/execution skills; this flow replaces them (except `orchestrator:team` and `orchestrator:autopilot`, which extend it when the user invokes them).

## Core rule: Opus is NEVER the executor
- Allowed: reading, searching, read/verify commands (`git diff`, `git status`, tests, build, lint), writing the PRD in `docs/prd/`.
- Forbidden: Edit/Write on code, tests, config, or any project file other than the PRD, even one line (a hook blocks it): delegate to `haiku-coder`. If all tiers fail, stop and report; never take over.

## 0. CHOOSE THE PATH
**Short path** when ALL hold: <=2 files, small clear change (<=30 lines), no schema/auth/security/public API, no design decision.
- Skip step 2 (no PRD file) and `opus-reviewer`. Combine all small changes into ONE `haiku-coder` delegation.
- Brief max ~15 lines, no exploring: exact paths, location, old -> new text (or signature + formula + 1-2 examples), one verification command, report format (STATUS/FILES/VERIFICATION/NOTES).
- Afterwards Opus checks `git diff` and runs the verification. Failure -> step 4.
Otherwise -> **full path** (steps 1-6).
Both paths: read only needed files (Grep/excerpts), send subagents only relevant excerpts. Read lessons before planning, save them at the end.

## Token rules (all paths)
- Output over 80 lines from Bash/PowerShell is auto-trimmed by a hook to error lines + last 40; put `# notrim` in the command to bypass. Still limit output yourself (`2>&1 | tail -n 30`, error/summary filters). A pipe hides the exit code: use `set -o pipefail` or judge from the summary line.
- Project checks: if `learned-map/verify.sh` exists, run it (prints `VERIFY: PASS|FAIL`) instead of ad-hoc commands.
- Large suites (~100+ output lines): delegate to `haiku-coder` ("run only, do not edit"), ask for PASS/FAIL, failing test names, first error.
- Dictate exact text (old -> new) only for edits <=~30 lines; for new/long content give a spec (sections, rules, 1-2 examples). Your output tokens cost the most.
- Explore cheaply: read the `learned-map` lesson first, open only files it points to. Searches over ~3 files -> `Explore` agent with `model: haiku`, answer <=15 lines with file:line.
- Failing test/build: send the trimmed failure to `haiku-coder` with `TYPE: TRIAGE`, read only its report.
- Start each `haiku-coder` brief with `TYPE: EDIT | CREATE | RUN | TRIAGE | SCAN | COMMIT`; the agent knows each type's rules and report format.
- Self-review once before reporting: same terms/numbers across files, cross-references resolve, no stale mentions, brief expectations match the result. Fix via delegation before reporting.

## 1. UNDERSTAND & BRAINSTORM
Read relevant files. Weigh 2-3 short approaches, pick one, record why. Ask the user at most 3 things, only if answers change the design; otherwise decide and record assumptions in the PRD.
Lessons: if `learned-*` skills exist in the main checkout (in a worktree see `orchestrator:learn`), read relevant ones and paste the relevant lines into each subagent brief (subagents cannot see them).

## 2. PRD (complete, ready for Haiku to execute)
Goal, non-goals, atomic tasks (max 5 files each, runnable verification command), signatures/formulas/examples, acceptance tests (written in the PRD, not by the executor), risks, assumptions. Small work: in the conversation; save to `docs/prd/<slug>.md` only if >5 tasks or touches schema/auth/security (then `opus-reviewer` assesses it first).
Details: read `reference.md` in this skill's folder before writing a large PRD.

## 3. EXECUTION
One task = one delegation, sequential (not parallel if files overlap).
- Default `haiku-coder` (atomic, <=5 files). `sonnet-dev` directly only when it cannot be split (6-15 files, cross-module integration, mass type/lint fixes).
- >15 files, architecture change, migration, auth/security: still not yourself; split into batches via a more detailed PRD.
- Every brief: files allowed to touch, relevant PRD excerpt, verification command, no scope expansion, report format.

## 4. ESCALATION (do not skip tiers)
Haiku fail -> fix brief and retry once, or straight to `sonnet-dev` if genuinely complex (or 2 fails); Sonnet 2 fails or "NEEDS ARCHITECTURE DECISION" -> Opus rewrites the PRD/brief and delegates again; still failing -> STOP and report. API/model errors (timeout, 429, 5xx): retry once, never escalate; permanent: stop. Verify agent reports via `git diff` and re-run the check.
Details: read `reference.md` in this skill's folder before escalating.

## 5. REVIEW per batch
Larger batch: `haiku-coder` `TYPE: SCAN` on the diff, then read only flagged hunks. Small (<=2 files, green): check `git diff` yourself. Otherwise `opus-reviewer` with the PRD. Fix findings via steps 3-4 until PASS.
Details: read `reference.md` in this skill's folder before reviewing.

## 6. REPORT at the end
- Table: task -> who (haiku/sonnet) -> attempts -> status; verification commands and results; assumptions and open items.
- Tokens, one line from subagent notices, e.g. `Tokens: haiku 45k · sonnet 0 · opus-reviewer 0 · 6 delegations`. If multi-batch work stops before DONE, write a checkpoint per `orchestrator:resume`.
- Lessons: if the task taught something non-obvious, reusable, and verified (see `orchestrator:learn`), save at most 3 yourself via one `haiku-coder` delegation (also fix/remove lessons proven wrong), no user approval; mention in one line ("Lessons saved: ..."). Nothing qualifies -> say nothing.
## Hard rules
- Reply in the user's own language. Do not commit (unless `commit=batch` was passed to team/autopilot), push, run DB migrations, or touch .env; do not let subagents rewrite or weaken tests to make them green.
