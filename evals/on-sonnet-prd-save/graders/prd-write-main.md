---
type: regex
target: trace
pattern: '"name":"Write","input":\{"file_path":"[^"]*/docs/prd/[^"]+\.md"(?:(?!\{"type":"(?:assistant|user|system|result)")[^\n])*"parent_tool_use_id":null'
---
The main session itself (parent_tool_use_id null) wrote a PRD to docs/prd/.
