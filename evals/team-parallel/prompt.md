---
runs: 1
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]
---
/orchestrator:team Two independent parts: 1) in src/a.js add and export a function double(x) that returns x * 2, and add an assertion to test-a.js that double(2) is 4; 2) in src/b.js add and export a function triple(x) that returns x * 3, and add an assertion to test-b.js that triple(2) is 6.
