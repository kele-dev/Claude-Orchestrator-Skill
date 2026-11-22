# Improvement Dashboard

Date: 2026-11-22 (cycle 013)

Tick `[x]` to pre-select an item for the next cycle's phase 3. Ticks are suggestions; the skill still asks you.
Mark `- [-]` to suggest rejecting an item permanently; the skill asks you to confirm before it marks anything `rejected`.

- [ ] IC-019 P1 DX/CI-CD/dependencies: Token-regression gate in eval CI is dead: evals/baseline.json not committed
- [ ] IC-115 P2 New features: Ideas doc still lists ideas 14, 15 and 17 as open though 1.14.0 shipped them
- [ ] IC-117 P2 UX & accessibility: status 16-row cap is ambiguous with per-file lesson and checkpoint rows
- [ ] IC-118 P2 Code quality & tests: Validator split left module bodies unindented inside run(ctx)
- [ ] IC-120 P2 Observability & ops: Debug log at a predictable tmp path follows symlinks and goes silent after the 256 KB cap
- [ ] IC-121 P2 DX/CI-CD/dependencies: No .gitattributes, so fixture.sh line endings depend on the clone's autocrlf setting
- [ ] IC-123 P2 UX & accessibility: Read-guard deny text lacks "Explain this to the user in their language."
- [ ] IC-130 P2 Performance: COMMIT trailer rule in on/SKILL.md token rules is needed only at commit time
- [ ] IC-131 P2 Performance: haiku-coder prompt carries APPLY rules used only by team worktree lanes on every delegation
- [ ] IC-132 P2 Performance: PreToolUse Read and PostToolUse Bash hooks start node for every call, including subagent calls they ignore
- [ ] IC-133 P3 Performance: Per-session marker and deny-streak files in the state and temp dirs are never pruned
- [ ] IC-134 P3 Performance: long-session rewrites the .count state file on every prompt even when unchanged
