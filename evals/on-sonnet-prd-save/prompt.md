---
model: claude-sonnet-5-5
runs: 1
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, Edit, Write]
---
/orchestrator:on Add a function checkToken(provided, expected) in a new file src/auth.js that compares two tokens in constant time (use crypto.timingSafeEqual, return false when the lengths differ), export it, and add assertions to test.js for a match, a mismatch and a length mismatch.
