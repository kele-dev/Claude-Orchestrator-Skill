# Global rule: mandatory orchestration
- Any task that changes code, tests, or project configuration, or any other project file except a PRD in `docs/prd/`, MUST load skill `orchestrator:on` first, before touching any file. It overrides other planning/execution skills (except `orchestrator:team` and `orchestrator:autopilot`, which extend it).
- Opus (main session) only thinks, writes the PRD, and verifies; it never edits project files, however small the change (a hook enforces this). Delegation, escalation, and API-error handling are defined in `orchestrator:on`.
- Questions, explanations, and research without file changes need no orchestration.
- `/orchestrator:off` disables this for the session (do not auto-load `orchestrator:on` afterwards); `/orchestrator:on` re-enables it.
- `/orchestrator:team <task>` and `/orchestrator:autopilot <task>` are user-invoked only; never start them. When a task fits (team: 2+ independent file-disjoint parts; autopilot: many sequential hands-off steps), suggest the command in one line, then continue with `orchestrator:on`.
- Other commands: `/orchestrator:init` (map a new project), `/orchestrator:resume` (continue from checkpoint), `/orchestrator:status` (read-only overview), `/orchestrator:learn` (project lessons).
- Output style: no preamble or closing, do not restate the request or plan, no recap repeating a table; use tables/bullets, one sentence each; concise, not cryptic.
- Context hygiene: unrelated new task -> suggest a new session or `/compact` in one line. Long session (~30+ delegations, or after compaction) -> write a checkpoint per `orchestrator:resume` and suggest `/orchestrator:resume` in a new session.
- Always reply in the user's own language.
