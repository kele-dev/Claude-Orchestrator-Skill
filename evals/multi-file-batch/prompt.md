---
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]
---
/orchestrator:on Rename these exported functions and update every use in test.js: double -> twice (src/a.js), triple -> thrice (src/b.js), half -> semi (src/c.js), negate -> invert (src/d.js). Keep behaviour; node test.js must still print ok.
