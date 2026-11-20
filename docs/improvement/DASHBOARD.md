# Improvement dashboard

Updated: 2026-11-20 (cycle 011). Tick `[x]` to pre-select an item for the next cycle, `[-]` to suggest rejecting it.

- [ ] IC-019 P1 DX/CI-CD/dependencies: Token-regression gate in eval CI is dead: evals/baseline.json not committed
- [ ] IC-109 P1 Stability: otel-export emits 1970 start times when a timestamp is missing and zero-duration spans for unfinished tool calls
- [ ] IC-110 P1 Observability & ops: otel-export dies with an uncaught stack trace when the output write fails (no defined exit code)
- [ ] IC-111 P1 Performance: ledger reads the entire subagent transcript on SubagentStop when last_assistant_message is absent
- [ ] IC-112 P1 Code quality & tests: Regression of IC-048: smoke finally blocks still scan the whole OS tmpdir with an unguarded readdirSync
- [ ] IC-113 P1 Performance: trim-stats-<session>.jsonl files are never pruned and --stats stats every file
- [ ] IC-114 P1 DX/CI-CD/dependencies: Proposal: validator checks that help lists every skill and every learn subcommand (prevents IC-107)
- [ ] IC-115 P2 New features: Ideas doc still lists ideas 14, 15 and 17 as open though 1.14.0 shipped them
- [ ] IC-116 P2 Security: guard-edit deny-streak tmp file written with plain writeFileSync instead of lib writeAtomic ('wx')
- [ ] IC-117 P2 UX & accessibility: status 16-row cap is ambiguous with per-file lesson and checkpoint rows
- [ ] IC-118 P2 Code quality & tests: Validator split left module bodies unindented inside run(ctx)
- [ ] IC-119 P2 Security: eval-select --base passes an unvalidated ref to git diff and argValue accepts the next flag as the value (local operator only)
- [ ] IC-120 P2 Observability & ops: Debug log at a predictable tmp path follows symlinks and goes silent after the 256 KB cap
- [ ] IC-121 P2 DX/CI-CD/dependencies: No .gitattributes, so fixture.sh line endings depend on the clone's autocrlf setting
- [ ] IC-122 P2 UX & accessibility: Read-guard deny asks to repeat the same Read, costing a round trip
- [ ] IC-123 P2 UX & accessibility: Read-guard deny text lacks "Explain this to the user in their language."
