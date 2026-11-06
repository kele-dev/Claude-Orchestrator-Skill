---
type: regex
target: trace
match: not_contains
pattern: '"name":"(?:Edit|Write|NotebookEdit)","input":\{(?:(?!"file_path"|\{"type":"(?:assistant|user|system|result)")[^\n])*"file_path":"(?![^"]*/docs/prd/)[^"]*"(?:(?!\{"type":"(?:assistant|user|system|result)")[^\n])*"parent_tool_use_id":null'
---
The main session (parent_tool_use_id null) never called Edit/Write/NotebookEdit outside docs/prd/; unlike tool_used this ignores subagent calls.
