# orchestrator:on reference (read only when needed)

## Step 2: PRD detail
- PRD contents: goal, non-goals, data flow, schema/tables, endpoints, UI components, task list, acceptance tests per task, risks, assumptions. Concise but precise: Haiku must be able to work without guessing.
- Small work: write the PRD in the conversation. Save it to `docs/prd/<slug>.md` only for a large PRD (>5 tasks, or touches data schema/auth/security).
- Split the work into atomic tasks: max 5 files per task, each with a verification command that can be run.
- State function names/signatures, rules/formulas, and example input -> output values.
- Acceptance tests are written in this PRD, not by the executor.
- Large PRD (>5 tasks, or touches data schema/auth/security) -> ask `opus-reviewer` to assess the PRD (the `docs/prd/<slug>.md` path if saved, otherwise paste the full PRD text into the brief) first, fix its findings, then execute.

## Step 4: Escalation ladder (do not skip tiers)
1. Haiku failed once -> diagnose first from the report + `git diff`:
   - Cause is an unclear brief or insufficient context -> fix the brief, re-run Haiku once.
   - Cause is that the task is genuinely complex (unclear error cause, touches many modules, needs debugging) -> go directly to `sonnet-dev`, do not re-run Haiku.
2. Haiku failed twice -> `sonnet-dev`. Every escalation to Sonnet includes: the existing diff, the exact error, and the suspected cause.
3. Sonnet failed once -> fix the brief, re-run Sonnet once.
4. Sonnet failed twice, or reports "NEEDS ARCHITECTURE DECISION" -> the main session analyzes (reads code, diff, errors), makes the design decision, then rewrites the PRD/brief more precisely (smaller tasks, explicit steps, concrete examples). Delegate again: to `haiku-coder` if the task is now atomic, otherwise to `sonnet-dev`. (not Opus-class: send error, diff and PRD to `opus-planner`, which diagnoses and returns the rewritten brief)
5. After the rewrite: at most one haiku-coder attempt and one sonnet-dev attempt (or one sonnet-dev attempt if the rewrite went to sonnet). Still failing -> STOP and report to the user: what was tried, the exact error, and the decision needed. The main session never takes over execution.

## API/model errors (not a reason to escalate to another tier)
- Transient (timeout, 429/rate limit, 5xx, overloaded, dropped connection) -> retry the same delegation ONCE. Still failing -> stop and report the exact error.
- Permanent (unknown model, 401/403/authentication, quota exhausted) -> stop immediately and report the exact error.
- Agent reports are not trusted raw: check `git diff` and re-run the verification yourself.

## Token rules (situational)
- Housekeeping due at the same time (COMMIT, checkpoint write or delete, lessons save) goes in ONE `haiku-coder` brief as ordered typed steps (e.g. `1. TYPE: COMMIT ...` `2. TYPE: RUN rm "<checkpoint>"`); each step keeps its own rules. Never one delegation per step: each costs ~10k tokens of startup.
- Reuse finished agents: a fix brief (fix round, or a small finding from review) for a unit whose agent finished in this session goes to that agent with `SendMessage` (it keeps its files and context, saving ~10k startup); a new agent only when moving up a tier, when `SendMessage` is unavailable, or when the agent was stopped. It still counts as one fix round.
- Incremental review: after a group passes, snapshot it (Bash): `export GIT_INDEX_FILE="$(git rev-parse --git-path orch-review-index)"; git read-tree HEAD && git add -A && git write-tree` and keep the printed tree id; the next group's review reads `git diff --stat <tree>` and `git diff -U1 <tree>` (plus `git status --short` for new files), never the earlier groups' hunks again. Reset after a commit (diff against HEAD).
- Brief order: fixed parts first (TYPE, report format, relevant lesson lines, verification command), variable parts last (files, PRD excerpt, error, diff). This may help prompt caching; no token saving has been measured yet.
- Known errors: before a `TYPE: TRIAGE` delegation, Grep `<store>/lessons/learned-errors.md` for the failure's key text; on a match put its CAUSE/FIX in the fix brief and skip TRIAGE (see `orchestrator:learn`).
