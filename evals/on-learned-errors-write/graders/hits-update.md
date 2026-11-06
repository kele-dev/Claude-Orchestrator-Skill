---
type: tool_used
tool: Agent
min: 1
input_match: 'hits[^\\"]{0,20}\b2\b|increment[^\\"]{0,40}hits|hits[^\\"]{0,40}(?:\+\s*1|by (?:1|one)|increment)'
---
The end-of-task save raises hits of the matched ORCH_E42 entry (1 -> 2).
