---
name: autopilot
description: Autonomous sequential execution under the orchestrator cost rules. One short clarification round, a PRD, then batch after batch (delegate, verify, fix) without asking between batches, until done or a cap is hit. Only runs when the user types /orchestrator:autopilot.
argument-hint: [batches=N] [commit=batch] [--dry-run] <task description>
disable-model-invocation: true
---

# Autopilot mode: autonomous batches, token-capped

Task: $ARGUMENTS

Autopilot is `orchestrator:on` without stopping between batches (Opus never edits). Shared mode rules (caps, fix rounds, raises, commit=batch, report, lessons): read `modes.md` in the `orchestrator:on` skill folder. Unit = group = batch.

## Budget (defaults; the user may override them in the arguments, e.g. `batches=8`)
- Clarification: one round only, at most 3 questions, asked at the start and only if the answers would change the design. Otherwise decide yourself and record the assumptions in the PRD.
- Max batches: 5, raised automatically up to 8: if the plan, or work discovered on the way, needs more than 5, continue without asking, but only while every finished batch passed. Any BLOCKED batch ends the extension. If more are needed past the cap, report and ask whether to continue.
- Max fix rounds per batch: 2, raised automatically up to 4 (see `modes.md`).
- `opus-reviewer`: at most once on the PRD and once on the final diff, and only for large work (>5 tasks, or touches schema/auth/security). Never per batch.
- `--dry-run`: stop after stage 2 and show the PRD and batch plan.
- `commit=batch` scope: per batch, after it passes verification.
- Checkpoint timing: after every 3rd batch.

## 1. CLARIFY
Ask the questions (if any) in one go. After the answers, do not ask again until a stop condition.

## 2. PRD + BATCH PLAN (Opus)
- Lessons in and PRD: per `modes.md`.
- Order the work into batches by dependency. Each batch = 1-3 atomic tasks with its own verification command.
- Show the batch list in one short block, then continue without waiting (unless `--dry-run`).

## 3. LOOP, per batch
1. Delegate: per `orchestrator:on` step 3. Tasks inside a batch run sequentially, or in parallel only when they touch disjoint files.
2. Verify: per `modes.md` (verify).
3. Fix: per `modes.md` (fix loop, NEEDS ARCHITECTURE DECISION), at most 2 rounds (or up to 4 per `modes.md`).
4. Batch passed: go straight to the next batch. Do not ask the user for confirmation between batches.

## 4. STOP conditions (the only times you stop or ask)
- DONE: all batches pass and the final project-level check (full test/build/lint, if any) passes.
- BLOCKED: a batch hit its fix cap. Do not start later batches that depend on it; report.
- DECISION NEEDED: an architecture decision or user input that cannot be safely assumed. Stop and ask.
- BATCH LIMIT: the batch cap was reached with work left. Report and ask whether to continue.

## 5. REPORT
Per `modes.md`: report. Unit = batch; status PASS / BLOCKED.
