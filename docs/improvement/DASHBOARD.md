# Improvement dashboard

Updated: 2026-11-21 (cycle 012). Tick `[x]` to pre-select an item for the next cycle, `[-]` to suggest rejecting it.

- [ ] IC-019 P1 DX/CI-CD/dependencies: Token-regression gate in eval CI is dead: evals/baseline.json not committed
- [ ] IC-109 P1 Stability: otel-export emits 1970 start times when a timestamp is missing and zero-duration spans for unfinished tool calls
- [ ] IC-110 P1 Observability & ops: otel-export dies with an uncaught stack trace when the output write fails (no defined exit code)
- [ ] IC-112 P1 Code quality & tests: Regression of IC-048: smoke finally blocks still scan the whole OS tmpdir with an unguarded readdirSync
- [ ] IC-114 P1 DX/CI-CD/dependencies: Proposal: validator checks that help lists every skill and every learn subcommand (prevents IC-107)
- [ ] IC-115 P2 New features: Ideas doc still lists ideas 14, 15 and 17 as open though 1.14.0 shipped them
- [ ] IC-116 P2 Security: guard-edit deny-streak tmp file written with plain writeFileSync instead of lib writeAtomic ('wx')
- [ ] IC-117 P2 UX & accessibility: status 16-row cap is ambiguous with per-file lesson and checkpoint rows
- [ ] IC-118 P2 Code quality & tests: Validator split left module bodies unindented inside run(ctx)
- [ ] IC-129 P2 Performance: trim-output and ledger spawn two git processes per call to recompute the store path
- [ ] IC-130 P2 Performance: COMMIT trailer rule in on/SKILL.md token rules is needed only at commit time
- [ ] IC-119 P2 Security: eval-select --base passes an unvalidated ref to git diff and argValue accepts the next flag as the value (local operator only)
- [ ] IC-120 P2 Observability & ops: Debug log at a predictable tmp path follows symlinks and goes silent after the 256 KB cap
- [ ] IC-121 P2 DX/CI-CD/dependencies: No .gitattributes, so fixture.sh line endings depend on the clone's autocrlf setting
- [ ] IC-122 P2 UX & accessibility: Read-guard deny asks to repeat the same Read, costing a round trip
- [ ] IC-123 P2 UX & accessibility: Read-guard deny text lacks "Explain this to the user in their language."
- [ ] IC-131 P2 Performance: haiku-coder prompt carries APPLY rules used only by team worktree lanes on every delegation
- [ ] IC-132 P2 Performance: PreToolUse Read and PostToolUse Bash hooks start node for every call, including subagent calls they ignore
- [ ] IC-134 P3 Performance: long-session rewrites the .count state file on every prompt even when unchanged
- [ ] IC-133 P3 Performance: Per-session marker and deny-streak files in the state and temp dirs are never pruned
