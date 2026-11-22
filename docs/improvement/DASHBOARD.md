# Improvement Dashboard

Date: 2026-11-22 (cycle 014)

Tick `[x]` to pre-select an item for the next cycle's phase 3. Ticks are suggestions; the skill still asks you.
Mark `- [-]` to suggest rejecting an item permanently; the skill asks you to confirm before it marks anything `rejected`.

- [ ] IC-019 P1 DX/CI-CD/dependencies: Token-regression gate in eval CI is dead: evals/baseline.json not committed
- [ ] IC-117 P2 UX & accessibility: status 16-row cap is ambiguous with per-file lesson and checkpoint rows
- [ ] IC-118 P2 Code quality & tests: Validator split left module bodies unindented inside run(ctx)
- [ ] IC-120 P2 Observability & ops: Debug log at a predictable tmp path follows symlinks and goes silent after the 256 KB cap
- [ ] IC-121 P2 DX/CI-CD/dependencies: No .gitattributes, so fixture.sh line endings depend on the clone's autocrlf setting
- [ ] IC-123 P2 UX & accessibility: Read-guard deny text lacks "Explain this to the user in their language."
- [ ] IC-130 P2 Performance: COMMIT trailer rule in on/SKILL.md token rules is needed only at commit time
- [ ] IC-131 P2 Performance: haiku-coder prompt carries APPLY rules used only by team worktree lanes on every delegation
- [ ] IC-141 P2 Performance: Read guard counts lines only above 20 KB, so a whole-file Read of 2001+ short lines under 20 KB is never denied
- [ ] IC-143 P2 Stability: ledger stale-lock takeover can unlink a fresh lock, so two writers race and a delegation line can be lost
- [ ] IC-144 P2 Observability & ops: otel-export failure messages drop the error code, span end is not clamped to start, and one statSync is unguarded (exit 1 outside 0/2/3)
- [ ] IC-145 P2 Code quality & tests: Each validate run leaves tmpdir/orchestrator-store-smoke1.json behind (store cache from IC-129)
- [ ] IC-146 P2 Code quality & tests: otel-export ends a tool span at the transcript end when its result has no timestamp, not at the last earlier one its header promises (follow-up of IC-109)
- [ ] IC-147 P2 Code quality & tests: ledger.mjs re-implements the bounded read loop that lib.mjs exports as readBytes
- [ ] IC-148 P2 UX & accessibility: ledger --stats prints 0/0 pass for a tier with only unknown results
- [ ] IC-149 P2 UX & accessibility: otel-export rejects --help as an unknown option and its messages lack the otel-export: prefix other scripts use
- [ ] IC-133 P3 Performance: Per-session marker and deny-streak files in the state and temp dirs are never pruned
- [ ] IC-134 P3 Performance: long-session rewrites the .count state file on every prompt even when unchanged
- [ ] IC-150 P3 Security: session-info prints the raw main checkout path into SessionStart context without clean()
- [ ] IC-151 P3 Observability & ops: otel-export gives no stderr note when it synthesizes missing timestamps
- [ ] IC-152 P3 Performance: guard-edit rescans the transcript backwards on each main-session edit once the mode marker is older than the 512 KB window
- [ ] IC-153 P3 DX/CI-CD/dependencies: CI and the install hint still name Node 18 (end of life 2025-04-30) as the minimum
- [ ] IC-154 P3 Security: Stored lesson and checkpoint text reaches SessionStart context guarded only by a data label and clean()
- [ ] IC-155 P3 Code quality & tests: Help-list validator checks only the first line that mentions /orchestrator:learn
- [ ] IC-156 P3 UX & accessibility: ledger and trim-output --stats without a store argument exit 0 with a no-data line instead of a usage error
