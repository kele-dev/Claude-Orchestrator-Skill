---
type: regex
target: trace
pattern: 'File created successfully at: [^"\s]*/lessons/learned-errors\.md|The file [^"\s]*/lessons/learned-errors\.md has been updated successfully'
---
The lesson file was actually written. Expected to FAIL in a sandboxed local run (store outside the run directory).
