---
name: team
description: Parallel multi-lane execution under the orchestrator cost rules. Opus plans and splits the work into file-disjoint lanes, haiku-coder lanes run in parallel, Opus verifies, and only failed lanes loop through fixes, with hard caps. Only runs when the user types /orchestrator:team.
argument-hint: [lanes=N] [commit=batch] [--dry-run] <task description>
disable-model-invocation: true
---

# Team mode: parallel lanes, token-capped

Task: $ARGUMENTS

Team mode is `orchestrator:on` with parallel execution (Opus never edits). Shared mode rules (caps, fix rounds, raises, commit=batch, report, lessons): read `modes.md` in the `orchestrator:on` skill folder. Unit = lane, group = wave.

## Budget (defaults; the user may override them in the arguments, e.g. `lanes=2`)
- Max parallel lanes per wave: 3, raised to 4 only at plan time and only if the work has 4 or more truly independent, file-disjoint parts. Hard ceiling: 4.
- Max fix rounds per lane: 2, raised automatically up to 4 (see `modes.md`).
- `lanes=1` means no parallelism: use the normal `orchestrator:on` flow.
- `opus-reviewer`: at most once, on the final combined diff, and only for large work (>5 tasks, or touches schema/auth/security).
- `--dry-run`: stop after stage 1, show the lane plan and the planned number of delegations, and wait for the user's go.
- `commit=batch` scope: per wave, after it is verified.
- Checkpoint timing: after each wave when more waves remain.

## 1. PLAN (Opus)
- Read only the files you need.
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
- Per lane: run `git status --porcelain` and `git diff -- <owned files>`, confirm that no file outside the lane's owned list changed, and run the lane's verification command yourself. Other verify rules: `modes.md`.

## 4. FIX loop
- Re-run only the failed lanes (`modes.md`: fix loop).
- Lanes cooperate through Opus, never by messaging each other:
  - A lane reports that it needs a file owned by another lane: let the owner lane finish, then give the requesting lane a follow-up task in the next wave with that file added to its owned list.
  - A lane changed a file outside its owned list: read both lanes' changes to that file. Compatible (different parts, nothing overwritten): keep both and note it in the report. Conflicting: delegate one merge task to `sonnet-dev` with both diffs and both lanes' PRD excerpts, owning only that file. Never auto-revert.
- Fix cap reached and not raised: mark the lane BLOCKED, let the other lanes finish, and do not start later waves that depend on it.

## 5. REPORT
Per `modes.md`: report. Unit = lane; status PASS / BLOCKED.
