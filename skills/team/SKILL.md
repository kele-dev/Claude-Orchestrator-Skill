---
name: team
description: Parallel multi-lane execution under the orchestrator cost rules. Opus plans and splits the work into file-disjoint lanes, haiku-coder lanes run in parallel, Opus verifies, and only failed lanes loop through fixes, with hard caps. Only runs when the user types /orchestrator:team.
argument-hint: [lanes=N] [commit=batch] [--dry-run] <task description>
disable-model-invocation: true
---

# Team mode: parallel lanes, token-capped

Task: $ARGUMENTS

Team mode is `orchestrator:on` with parallel execution. Every rule of `orchestrator:on` still applies: Opus never edits, the escalation ladder, API-error handling, and the hard rules. This file only adds what changes. If the `orchestrator:on` rules are not in context yet, load that skill first.

Agent names: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-reviewer`.

## Budget (defaults; the user may override them in the arguments, e.g. `lanes=2`)
- Max parallel lanes per wave: 3.
- Max fix rounds per lane: 2. A fix round is one re-delegation after a failed verify; the tier for each round follows `orchestrator:on` step 4.
- Caps can be raised automatically for complex problems (see "Raising the caps"). Hard ceilings: 4 lanes per wave, 4 fix rounds per lane.
- `opus-reviewer`: at most once, on the final combined diff, and only for large work (>5 tasks, or touches schema/auth/security).
- `--dry-run`: stop after stage 1, show the lane plan and the planned number of delegations, and wait for the user's go.
- `commit=batch`: after each wave is verified, delegate one `haiku-coder` `TYPE: COMMIT` with only the files of that wave's PASS lanes and a conventional commit message. Files of BLOCKED lanes stay uncommitted and are listed in the checkpoint. Never push. Without this argument nothing is committed.
- Checkpoint: write one per `orchestrator:resume` after each wave when more waves remain, and at every stop that is not DONE.

## Raising the caps (complex problems)
Opus may raise a cap on its own, without asking, only while the work is clearly progressing:
- Fix rounds: a lane at its cap gets more rounds (up to the ceiling of 4) only if every round made measurable progress: a different error than the round before, or fewer failing tests/checks. The same error twice in a row means no progress: stop that lane.
- Lanes: at plan time, use 4 lanes only if the work has 4 or more truly independent, file-disjoint parts.
- Announce every raise in one line when it happens (what, old -> new, why) and list it in the report.
- Never go past the ceilings. A cap the user gave in the arguments (e.g. `lanes=2`) is final: never raise it.

## 1. PLAN (Opus)
- Read the relevant `learned-*` project skills (see `orchestrator:on` step 1) and paste the relevant lesson lines into each lane brief.
- Read only the files you need. Write the PRD as in `orchestrator:on` step 2.
- Split the work into lanes. Each lane has: id, goal, owned files, PRD excerpt, acceptance test, verification command.
- Owned files are exclusive: no file appears in two lanes.
- Lanes in one wave must be independent: no lane needs another lane's output. Dependent work goes into a later wave. Waves run one after another; lanes inside a wave run in parallel.
- If the work cannot be split into at least 2 independent lanes, say so in one line and use the normal `orchestrator:on` flow. Do not force parallelism.
- Show the lane table (lane, owned files, executor) in one short block, then continue without waiting (unless `--dry-run`).

## 2. EXEC (parallel)
- Launch all lanes of the current wave in ONE message: one Agent call per lane, with `run_in_background: true`.
- Executor: `haiku-coder` by default; `sonnet-dev` only for a lane that cannot be made atomic (`orchestrator:on` step 3).
- Each brief is self-contained, because subagents start without this conversation: owned files, the lane's PRD excerpt, the verification command, "touch only these files; if you need another file, stop and report", and the report format STATUS/FILES/VERIFICATION/NOTES.
- Tell every lane to return only the summary line of its verification output, never full logs.
- Wait for the completion notifications. Do not poll.

## 3. VERIFY (Opus)
- Wave larger than the small-batch size: run `TYPE: SCAN` on the wave's diff first (see `orchestrator:on` step 5).
- Per lane: run `git status --porcelain` and `git diff -- <owned files>`, confirm that no file outside the lane's owned list changed, and run the lane's verification command yourself, with output trimmed per the token rules in `orchestrator:on`.
- Read diffs and summaries, not whole files, unless a diff is ambiguous.
- After the last wave passes, run the project-level check once (full test/build/lint, if the project has one).

## 4. FIX loop
- Re-run only the failed lanes. Never touch a lane that already passed.
- New brief = exact error + that lane's current diff + suspected cause. Pick the tier per `orchestrator:on` step 4.
- Lanes cooperate through Opus, never by messaging each other:
  - A lane reports that it needs a file owned by another lane: let the owner lane finish, then give the requesting lane a follow-up task in the next wave with that file added to its owned list.
  - A lane changed a file outside its owned list: read both lanes' changes to that file. Compatible (different parts, nothing overwritten): keep both and note it in the report. Conflicting: delegate one merge task to `sonnet-dev` with both diffs and both lanes' PRD excerpts, owning only that file. Never auto-revert.
- Fix cap reached and not raised: mark the lane BLOCKED, let the other lanes finish, and do not start later waves that depend on it.

## 5. REPORT
- Table: lane -> owned files -> executor -> attempts -> status (PASS / BLOCKED).
- Verification commands run and their results.
- Tokens and delegations per `orchestrator:on` step 6, and caps used vs. caps allowed (including any automatic raises).
- Assumptions and open items.
- Lessons: save per `orchestrator:on` step 6 (automatic, one delegation, one report line).

Hard rules: same as `orchestrator:on`. No commit unless `commit=batch`; never push.
