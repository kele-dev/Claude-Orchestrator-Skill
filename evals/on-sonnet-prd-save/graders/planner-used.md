---
type: tool_used
tool: Agent
input_match: 'opus-planner'
min: 1
---
A non-Opus main session gets its PRD from orchestrator:opus-planner. Note: tool_used cannot tell the main thread from subagents, so prd-write only shows a PRD file was written, and the trace was checked manually once (main session wrote it right after the planner returned).
