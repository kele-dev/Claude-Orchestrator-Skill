---
name: off
description: Turn off orchestration mode for the rest of this session. Only used when the user types /orchestrator:off.
disable-model-invocation: true
---

# Orchestration mode: OFF

Orchestration mode is INACTIVE for the rest of this session, until the user types `/orchestrator:on`.

- Ignore the "mandatory orchestration" rules loaded at the start of the session, and do not automatically load the `orchestrator:on` skill.
- Handle tasks directly as usual (you may edit yourself), without a PRD and without mandatory delegation to subagents.
- Still in effect: do not commit/push without being asked, do not touch .env, do not run DB migrations, and the concise output style (no preamble, no restated plan, tables or bullets, detail only when asked).

Reply briefly, in the user's language: "Orchestration mode is off for this session. Type /orchestrator:on to turn it back on."
