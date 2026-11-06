---
runs: 2
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Edit, Write]
---
This is a token measurement run. Do not plan and do not load any skill. Make exactly three Agent calls, one at a time, in the foreground (run_in_background false), waiting for each result:
1. subagent_type orchestrator:haiku-coder, prompt exactly: TYPE: RUN. Do not call any tool. Reply with exactly: STATUS: SUCCESS
2. subagent_type orchestrator:haiku-coder, prompt exactly: TYPE: CREATE. Create notes/a.txt containing the single line a. Verification: cat notes/a.txt prints a.
3. subagent_type orchestrator:opus-reviewer, prompt exactly: Do not call any tool. Reply with exactly: OK
Then reply with one line: DONE.
