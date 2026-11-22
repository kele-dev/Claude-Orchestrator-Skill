# Improvement Dashboard

Date: 2026-11-22 (cycle 017)

Tick `[x]` to pre-select an item for the next cycle's phase 3. Ticks are suggestions; the skill still asks you.
Mark `- [-]` to suggest rejecting an item permanently; the skill asks you to confirm before it marks anything `rejected`.

Last cycle: 017 (2026-11-22): 8 done (IC-190, IC-191, IC-193, IC-194, IC-195, IC-197, IC-198, IC-199), IC-019 still blocked. Done total 155. Open: P0 0, P1 1 (blocked), P2 32, P3 16.

- [ ] IC-019 P1 DX/CI-CD/dependencies: Token-regression gate in eval CI is dead: evals/baseline.json not committed
- [ ] IC-120 P2 Observability & ops: Debug log at a predictable tmp path follows symlinks and goes silent after the 256 KB cap
- [ ] IC-121 P2 DX/CI-CD/dependencies: No .gitattributes, so fixture.sh line endings depend on the clone's autocrlf setting
- [ ] IC-123 P2 UX & accessibility: Read-guard deny text lacks "Explain this to the user in their language."
- [ ] IC-130 P2 Performance: COMMIT trailer rule in on/SKILL.md token rules is needed only at commit time
- [ ] IC-131 P2 Performance: haiku-coder prompt carries APPLY rules used only by team worktree lanes on every delegation
- [ ] IC-143 P2 Stability: ledger stale-lock takeover can unlink a fresh lock, so two writers race and a delegation line can be lost
- [ ] IC-144 P2 Observability & ops: otel-export failure messages drop the error code, span end is not clamped to start, and one statSync is unguarded (exit 1 outside 0/2/3)
- [ ] IC-145 P2 Code quality & tests: Each validate run leaves tmpdir/orchestrator-store-smoke1.json behind (store cache from IC-129)
- [ ] IC-146 P2 Code quality & tests: otel-export ends a tool span at the transcript end when its result has no timestamp, not at the last earlier one its header promises (follow-up of IC-109)
- [ ] IC-147 P2 Code quality & tests: ledger.mjs re-implements the bounded read loop that lib.mjs exports as readBytes
- [ ] IC-148 P2 UX & accessibility: ledger --stats prints 0/0 pass for a tier with only unknown results
- [ ] IC-149 P2 UX & accessibility: otel-export rejects --help as an unknown option and its messages lack the otel-export: prefix other scripts use
- [ ] IC-166 P2 New features: Ideas doc says idea 17 keys the store by remote URL or first-commit hash; code uses the remote URL, else the path
- [ ] IC-167 P2 UX & accessibility: Session-start lesson index prints "name.md: " with a dangling colon when a lesson has no description
- [ ] IC-168 P2 Performance: SessionStart stats every checkpoint file before keeping the newest five
- [ ] IC-169 P2 DX/CI-CD/dependencies: eval.yml passes an undocumented brace list to claude plugin eval --case; only the post-run check catches an unsupported form
- [ ] IC-170 P2 Code quality & tests: eval-select selects no case for unmapped scripts/ and evals/ files (digest, plan-dag, transcript, otel-export, validate)
- [ ] IC-171 P2 Code quality & tests: eval-select smoke hard-codes case counts 12 and 9, so adding an eval case breaks validate
- [ ] IC-176 P2 UX & accessibility: TRIM: unavailable (error: code) gives a bare code and no next step
- [ ] IC-179 P2 Security: eval.yml writes the unvalidated case input into $GITHUB_OUTPUT with echo, so a newline can add outputs such as skip=true
- [ ] IC-181 P2 Code quality & tests: The 64 KB compaction threshold is tested only above the cap; a file just under it, or two small records, is never asserted to stay untouched
- [ ] IC-182 P2 Code quality & tests: sanitizeSid in lib.mjs has no direct test of its charset, 80-char cap or empty result
- [ ] IC-183 P2 Code quality & tests: long-session.mjs keeps a fifth session-id sanitizer (no underscore, no length cap) that IC-164 missed
- [ ] IC-186 P2 UX & accessibility: eval-select accepts an empty --files value and prints skip=true with exit 0 instead of a usage error
- [ ] IC-192 P2 Stability: long-session ignores the writeAtomic result for its warning marker, so a failed write repeats the long-session warning on every prompt
- [ ] IC-196 P2 UX & accessibility: on/SKILL.md says output of a non-zero-exit command is never trimmed while README and trim-output.mjs keep 10 head lines for a failed command
- [ ] IC-200 P2 New features: Proposal: extend the output trim to Grep results
- [ ] IC-201 P2 UX & accessibility: eval-compare CLI errors lack the eval-compare: prefix and do not say which value is accepted
- [ ] IC-202 P2 Code quality & tests: regression of IC-044: the root-fallback guard spawn in hooks-smoke inherits GIT_* env while only the git init call uses the cleaned env
- [ ] IC-203 P2 Performance: SessionStart starts node twice (rules.mjs prints one static file) and the rules hook entry has no timeout
- [ ] IC-205 P2 DX/CI-CD/dependencies: The Claude Code CLI pin in eval.yml has no update path and no recorded measured version
- [ ] IC-206 P2 DX/CI-CD/dependencies: No parity check between the English README and the Indonesian Ringkasan, so the summary keeps drifting
- [ ] IC-117 P3 UX & accessibility: status 16-row cap is ambiguous with per-file lesson and checkpoint rows
- [ ] IC-118 P3 Code quality & tests: Validator split left module bodies unindented inside run(ctx)
- [ ] IC-133 P3 Performance: Per-session marker and deny-streak files in the state and temp dirs are never pruned
- [ ] IC-134 P3 Performance: long-session rewrites the .count state file on every prompt even when unchanged
- [ ] IC-150 P3 Security: session-info prints the raw main checkout path into SessionStart context without clean()
- [ ] IC-151 P3 Observability & ops: otel-export gives no stderr note when it synthesizes missing timestamps
- [ ] IC-152 P3 Performance: guard-edit rescans the transcript backwards on each main-session edit once the mode marker is older than the 512 KB window
- [ ] IC-153 P3 DX/CI-CD/dependencies: CI and the install hint still name Node 18 (end of life 2025-04-30) as the minimum
- [ ] IC-154 P3 Security: Stored lesson and checkpoint text reaches SessionStart context guarded only by a data label and clean()
- [ ] IC-155 P3 Code quality & tests: Help-list validator checks only the first line that mentions /orchestrator:learn
- [ ] IC-156 P3 UX & accessibility: ledger and trim-output --stats without a store argument exit 0 with a no-data line instead of a usage error
- [ ] IC-178 P3 Stability: eval-select does not fail closed on an empty or null touches.json (Object.keys(null) throws, {} gives skip=true)
- [ ] IC-184 P3 DX/CI-CD/dependencies: The eval-select --base HEAD smokes call git without the availability guard other smokes use
- [ ] IC-185 P3 DX/CI-CD/dependencies: eval.yml checks out full history on every run, though only the --base diff needs it
- [ ] IC-187 P3 UX & accessibility: docs/ideas/token-saving.md still says the session index lists 20 lessons; code and README say 10
- [ ] IC-204 P3 Code quality & tests: hooks-smoke.mjs and scripts-smoke.mjs are each one 700 to 770 line run function
