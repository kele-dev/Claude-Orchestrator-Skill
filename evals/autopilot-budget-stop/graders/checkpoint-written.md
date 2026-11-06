---
type: regex
target: trace
pattern: 'File created successfully at: [^"\s]*/checkpoints/[^"\s]+\.md|The file [^"\s]*/checkpoints/[^"\s]+\.md has been updated successfully'
---
The checkpoint file was actually written (Write/Edit success result in the trace). Expected to FAIL in a sandboxed local run: the store (~/.claude/orchestrator/<key>/) is outside the run directory and the write is denied.
