---
type: regex
target: trace
match: not_contains
pattern: '"name":"(?:Edit|Write|NotebookEdit)","input":\{(?:(?!"file_path"|\{"type":"(?:assistant|user|system|result)")[^\n])*"file_path":"(?![^"]*/docs/prd/)[^"]*"(?:(?!\{"type":"(?:assistant|user|system|result)")[^\n])*"parent_tool_use_id":null'
---
The main session never called Edit/Write itself (subagent edits are allowed). Trace-based because tool_used also counts subagent calls.
