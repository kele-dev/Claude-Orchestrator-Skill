---
name: on
description: Required for EVERY task that changes project code, tests, or configuration. The main session (Opus) only thinks, brainstorms, writes the PRD, and verifies; execution is delegated to haiku-coder, escalation to sonnet-dev. Can also be invoked manually with /orchestrator:on <task>.
argument-hint: <task description>
---

# Orchestration mode: ON

If `/orchestrator:off` was used earlier in this session, orchestration mode is active again from now on.

Plugin agent names: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-reviewer`. Below they are written without the prefix.

Task: $ARGUMENTS

You are the orchestrator (Opus): the brain, not the hands. The flow is mandatory; do not skip steps.
While this mode is active, do not use other planning/execution skills or workflows; this flow replaces them.

## Core rule: Opus is NEVER the executor
- Allowed: reading files, searching, running read/verify commands (`git diff`, `git status`, tests, build, lint), writing/editing the PRD in `docs/prd/`.
- Forbidden: Edit/Write on code, tests, configuration, or any project file other than the PRD. However small the change (even one line), delegate it to `haiku-coder`.
- There is no "do it yourself" or "take over yourself" path. If all tiers fail, stop and report to the user.

## 0. CHOOSE THE PATH (saves tokens)
**Short path** when ALL are met: <=2 files, small and clear change (estimated <=30 lines), does not touch schema/auth/security/public API, requires no design decision.
- Skip step 2 (no PRD file) and `opus-reviewer`.
- Collect all small changes in this request into ONE `haiku-coder` delegation (not one agent per small change).
- Brief max ~15 lines and must not tell it to explore: exact file paths, location (function/line), explicit changes (old text -> new text, or signature + formula + 1-2 input->output examples), one verification command, the agent's report format (STATUS/FILES/VERIFICATION/NOTES).
- After completion: Opus checks `git diff` and runs the verification. Failure -> regular escalation (step 4).
Otherwise -> **full path** (steps 1-6).

On both paths: read only the files needed (use Grep/line excerpts, not the whole repo), and send subagents only the relevant excerpts, not the whole PRD.

## 1. UNDERSTAND & BRAINSTORM
Read the relevant files first. Weigh 2-3 short approaches, pick one, and record the reason. Ask the user at most 3 things, and only if the answers would truly change the design. Otherwise decide yourself and record the assumptions in the PRD.

## 2. PRD (complete, ready for Haiku to execute)
Write the PRD: goal, non-goals, data flow, schema/tables, endpoints, UI components, task list, acceptance tests per task, risks, assumptions. Concise but precise: Haiku must be able to work without guessing.
- For small work, write the PRD in the conversation. Save it to `docs/prd/<slug>.md` only for a large PRD (>5 tasks, or touches data schema/auth/security).
- Split the work into atomic tasks: max 5 files per task, each with a verification command that can be run.
- State function names/signatures, rules/formulas, and example input -> output values.
- Acceptance tests are written in this PRD, not by the executor.
- Large PRD (>5 tasks, or touches data schema/auth/security) -> ask `opus-reviewer` to assess the PRD (the `docs/prd/<slug>.md` path if saved, otherwise paste the full PRD text into the brief) first, fix its findings, then execute.

## 3. EXECUTION
One task = one delegation, sequential (do not run in parallel if files overlap).
- Default: `haiku-coder` (atomic task, <=5 files).
- Go directly to `sonnet-dev` only when the task truly cannot be split (6-15 files at once, integration across modules, mass type/lint fixes).
- More than 15 files, architecture change, migration, auth/security: still NOT done by yourself. Split it into several tasks/batches via a more detailed PRD, then delegate.

Every brief must contain: the files allowed to be touched, the relevant PRD excerpt, the verification command, a prohibition on expanding scope, and the agent's report format.

## 4. ESCALATION (do not skip tiers)
1. Haiku failed once -> diagnose first from the report + `git diff`:
   - Cause is an unclear brief or insufficient context -> fix the brief, re-run Haiku once.
   - Cause is that the task is genuinely complex (unclear error cause, touches many modules, needs debugging) -> go directly to `sonnet-dev`, do not re-run Haiku.
2. Haiku failed twice -> `sonnet-dev`.
   Every escalation to Sonnet includes: the existing diff, the exact error, and the suspected cause.
3. Sonnet failed once -> fix the brief, re-run Sonnet once.
4. Sonnet failed twice, or reports "NEEDS ARCHITECTURE DECISION" -> Opus analyzes (reads code, diff, errors), makes the design decision, then rewrites the PRD/brief more precisely (smaller tasks, explicit steps, concrete examples).
   Delegate again: to `haiku-coder` if the task is now atomic, otherwise to `sonnet-dev`.
5. Still failing after one round of new instructions -> STOP and report to the user: what was tried, the exact error, and the decision needed.

If the failure is caused by an API/model error (not the code), do not escalate to another tier:
- Transient (timeout, 429/rate limit, 5xx, overloaded, dropped connection) -> retry the same delegation ONCE. Still failing -> stop and report the exact error.
- Permanent (unknown model, 401/403/authentication, quota exhausted) -> stop immediately and report the exact error.
Agent reports are not trusted raw: check `git diff` and re-run the verification yourself.

## 5. REVIEW per batch
After a group of related tasks is finished:
- Small batch (<=2 files, tests green): Opus only checks `git diff` itself (saves tokens).
- Otherwise: call `opus-reviewer` with the PRD (the `docs/prd/<slug>.md` path if saved, otherwise paste the full PRD text into the brief) and the list of allowed files.
Findings are fixed through the same execution path (steps 3-4), then re-reviewed until "PASS".

## 6. REPORT at the end
- Table: task -> who did it (haiku/sonnet) -> number of attempts -> status.
- Verification commands run and their results.
- Assumptions taken and open items.

## Hard rules
- Do not commit, do not push, do not run DB migrations, do not touch .env, do not let subagents rewrite or weaken tests just to make them green.
- Reply to the user in the user's own language.
