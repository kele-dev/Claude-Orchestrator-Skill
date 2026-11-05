---
model: claude-sonnet-5-5
runs: 1
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, Edit, Write]
---
/orchestrator:on Rename the function add to sum in src/math.js and update its use in test.js.
