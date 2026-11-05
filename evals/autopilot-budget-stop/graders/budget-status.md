---
type: regex
pattern: '(?:not run|stopped|stop|over|exceeded|used up|reached)[^\n]{0,80}budget|budget[^\n]{0,80}(?:used up|exceeded|reached|over|spent)|status BUDGET'
flags: i
---
The final message reports that the run stopped because the token budget was reached.
