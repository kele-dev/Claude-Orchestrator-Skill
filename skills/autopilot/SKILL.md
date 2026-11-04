---
name: autopilot
description: Autonomous sequential execution under the orchestrator cost rules. One short clarification round, a PRD, then batch after batch (delegate, verify, fix) without asking between batches, until done or a cap is hit. Only runs when the user types /orchestrator:autopilot.
argument-hint: [batches=N] [commit=batch] [--dry-run] <task description>
disable-model-invocation: true
---

# Autopilot mode: autonomous batches, token-capped

Task: $ARGUMENTS

Autopilot is `orchestrator:on` without stopping between batches. Every rule of `orchestrator:on` still applies: Opus never edits, the escalation ladder, API-error handling, and the hard rules. This file only adds what changes. If the `orchestrator:on` rules are not in context yet, load that skill first.

Agent names: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-reviewer`.

## Budget (defaults; the user may override them in the arguments, e.g. `batches=8`)
- Clarification: one round only, at most 3 questions, asked at the start and only if the answers would change the design. Otherwise decide yourself and record the assumptions in the PRD.
- Max batches: 5, raised automatically up to 8 (see "Raising the caps"). If more are needed past the cap, report and ask whether to continue.
- Max fix rounds per batch: 2, raised automatically up to 4 (see "Raising the caps"). The tier for each round follows `orchestrator:on` step 4.
- `opus-reviewer`: at most once on the PRD and once on the final diff, and only for large work (>5 tasks, or touches schema/auth/security). Never per batch.
- `--dry-run`: stop after stage 2 and show the PRD and batch plan.
- `commit=batch`: after each batch passes verification, delegate one `haiku-coder` `TYPE: COMMIT` with only that batch's files and a conventional commit message. Never push. Without this argument nothing is committed.
- Checkpoint: write one per `orchestrator:resume` after every 3rd batch, and at every stop that is not DONE.

## Raising the caps (complex problems)
Opus may raise a cap on its own, without asking, only while the work is clearly progressing:
- Fix rounds: a batch at its cap gets more rounds (up to 4) only if every round made measurable progress: a different error than the round before, or fewer failing tests/checks. The same error twice in a row means no progress: the batch is BLOCKED.
- Batches: if the plan, or work discovered on the way, needs more than 5 batches, continue up to 8 without asking, but only while every finished batch passed. Any BLOCKED batch ends the extension.
- Announce every raise in one line when it happens (what, old -> new, why) and list it in the report.
- Never go past the ceilings. A cap the user gave in the arguments (e.g. `batches=3`) is final: never raise it.

## 1. CLARIFY
Ask the questions (if any) in one go. After the answers, do not ask again until a stop condition.

## 2. PRD + BATCH PLAN (Opus)
- Read the relevant `learned-*` project skills (see `orchestrator:on` step 1) and paste the relevant lesson lines into each brief.
- Write the PRD as in `orchestrator:on` step 2.
- Order the work into batches by dependency. Each batch = 1-3 atomic tasks with its own verification command.
- Show the batch list in one short block, then continue without waiting (unless `--dry-run`).

## 3. LOOP, per batch
1. Delegate: per `orchestrator:on` step 3. Tasks inside a batch run sequentially, or in parallel only when they touch disjoint files.
2. Verify: for a batch larger than the small-batch size, run `TYPE: SCAN` first (see `orchestrator:on` step 5); then `git diff` plus the batch's verification command, run by you with output trimmed per the token rules in `orchestrator:on`. Read diffs and summaries, not whole files.
3. Fix: re-run only the failed tasks, at most 2 rounds (or up to 4 per "Raising the caps"), with exact error + diff + suspected cause in the brief.
4. Batch passed: go straight to the next batch. Do not ask the user for confirmation between batches.

## 4. STOP conditions (the only times you stop or ask)
- DONE: all batches pass and the final project-level check (full test/build/lint, if any) passes.
- BLOCKED: a batch hit its fix cap. Do not start later batches that depend on it; report.
- DECISION NEEDED: an architecture decision or user input that cannot be safely assumed. Stop and ask.
- BATCH LIMIT: the batch cap was reached with work left. Report and ask whether to continue.

## 5. REPORT
- Table: batch -> tasks -> executor -> attempts -> status (PASS / BLOCKED).
- Verification commands run and their results.
- Tokens and delegations per `orchestrator:on` step 6, and caps used vs. caps allowed (including any automatic raises).
- Assumptions and open items.
- Lessons: save per `orchestrator:on` step 6 (automatic, one delegation, one report line).

Hard rules: same as `orchestrator:on`. No commit unless `commit=batch`; never push.
