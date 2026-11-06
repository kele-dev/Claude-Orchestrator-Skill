---
type: tool_order
before:
  tool: Write
  input_match: 'docs/prd/[^"]+\.md'
after:
  tool: Agent
  input_match: 'orchestrator:opus-reviewer'
---
The PRD file was written before orchestrator:opus-reviewer was launched.
