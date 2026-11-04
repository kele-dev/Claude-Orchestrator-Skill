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
4. Sonnet failed twice, or reports "NEEDS ARCHITECTURE DECISION" -> Opus analyzes (reads code, diff, errors), makes the design decision, then rewrites the PRD/brief more precisely (smaller tasks, explicit steps, concrete examples). Delegate again: to `haiku-coder` if the task is now atomic, otherwise to `sonnet-dev`.
5. Still failing after one round of new instructions -> STOP and report to the user: what was tried, the exact error, and the decision needed. Opus never takes over execution.

## API/model errors (not a reason to escalate to another tier)
- Transient (timeout, 429/rate limit, 5xx, overloaded, dropped connection) -> retry the same delegation ONCE. Still failing -> stop and report the exact error.
- Permanent (unknown model, 401/403/authentication, quota exhausted) -> stop immediately and report the exact error.
- Agent reports are not trusted raw: check `git diff` and re-run the verification yourself.

## Step 5: Review per batch
After a group of related tasks is finished:
- Larger than a small batch: first send the diff to `haiku-coder` with `TYPE: SCAN`; then read `git diff --stat` plus only the hunks the scan flags or that carry the main logic.
- Small batch (<=2 files, tests green): Opus only checks `git diff` itself (saves tokens).
- Otherwise: call `opus-reviewer` with the PRD (the `docs/prd/<slug>.md` path if saved, otherwise paste the full PRD text into the brief) and the list of allowed files.
- Findings are fixed through the same execution path (steps 3-4), then re-reviewed until "PASS".
