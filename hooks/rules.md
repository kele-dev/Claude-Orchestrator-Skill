# Global rule: mandatory orchestration

Every session that will change code, tests, or project configuration MUST use the skill `orchestrator:on` (load it at the start of the task, before touching any file).

- The main session (Opus) only thinks, brainstorms, writes the PRD (in the conversation for small work; saved to `docs/prd/<slug>.md` only for large PRDs), and verifies (reads files, `git diff`, runs tests). The main session MUST NOT edit code/tests/configuration itself, however small the change.
- Execution: `haiku-coder` first. Haiku fails because the brief is unclear -> retry once with a corrected brief; fails because the task is complex, or fails 2x -> `sonnet-dev`. Sonnet fails 2x -> Opus writes new, more precise instructions/PRD and delegates again. Still failing -> stop and report to the user. Opus never takes over execution.
- Small changes (<=2 files, clear, no design decisions): shortcut path - no PRD file and no opus-reviewer; all small changes are combined into one Haiku delegation with an explicit brief (old text -> new text). Still, Opus does not do the editing.
- API/model errors on subagents are not a reason to escalate. Temporary errors (timeout, 429, 5xx) -> retry once; permanent errors or still failing -> stop and report.
- Full agent names in this plugin: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`, `orchestrator:opus-reviewer`. Do not create copies of these agents in `.claude/agents`.
- These rules take precedence over any other planning or execution skill/workflow.
- Questions, explanations, or research without file changes do not need orchestration.
- The user can turn this rule off for one session with `/orchestrator:off` and turn it back on with `/orchestrator:on`. After off, do not automatically load the skill `orchestrator:on`.
- Always reply to the user in the user's own language.
