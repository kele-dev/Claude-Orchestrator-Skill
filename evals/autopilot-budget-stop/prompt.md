---
runs: 1
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]
---
/orchestrator:autopilot budget=1k Do this in three batches, one file per batch, in order: 1) create notes/one.txt containing the line one; 2) create notes/two.txt containing the line two; 3) create notes/three.txt containing the line three.
