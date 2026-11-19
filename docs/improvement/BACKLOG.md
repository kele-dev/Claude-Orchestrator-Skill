# Improvement Backlog

Project: orchestrator (Claude Code plugin, kele-dev marketplace)
Last updated: 2026-11-19 (cycle 010)

Scoring: see the improvement-cycle skill `references/scoring.md`. Score = Impact x Confidence / Effort. P0 >= 8.0 (score-based P0 only for Security/Stability/data integrity) or any override, P1 4.0-7.9 (cap for other dimensions without an override), P2 2.0-3.9, P3 < 2.0. New features are capped at P2 unless the user asked for features that cycle.

| ID | Pri | Score | Dimension | Title | Evidence | Effort | Status | Cycle |
|----|-----|-------|-----------|-------|----------|--------|--------|-------|
| IC-001 | P1 | 9.0 | UX & accessibility | Skills contradict on user-requested commits (on forbids, off allows when asked) | skills/on/SKILL.md:77; skills/off/SKILL.md:13 | S | done | 001 |
| IC-002 | P1 | 9.0 | UX & accessibility | Guards fail open silently without Node and the README check cannot detect it | hooks/guard-edit.mjs:22-24; hooks/guard-review.mjs:25-27; README.md:68; skills/status/SKILL.md:9 | S | done | 001 |
| IC-003 | P1 | 9.0 | UX & accessibility | Ask-first rule is non-Opus only in rules.md but unconditional in on/SKILL.md | hooks/rules.md:4; skills/on/SKILL.md:18 | S | done | 001 |
| IC-004 | P1 | 9.0 | Observability & ops | All hooks swallow errors silently; no debug signal when a hook breaks | hooks/guard-edit.mjs:22-24,91-93,103-105; hooks/guard-review.mjs:176-178; hooks/trim-output.mjs:254-256; hooks/long-session.mjs:17-19,81-83,128-130; hooks/session-info.mjs:217-219 | S | done | 001 |
| IC-005 | P1 | 9.0 | Code quality & tests | validate.mjs smoke tests never reach large-input branches of hooks | hooks/long-session.mjs:52-61; hooks/guard-edit.mjs:94-106; hooks/trim-output.mjs:112-115; scripts/validate.mjs:325,509 | S | done | 001 |
| IC-006 | P1 | 9.0 | Code quality & tests | Kill switches ORCH_GUARD/ORCH_NO_TRIM and fallback branches untested | scripts/validate.mjs:321; hooks/guard-edit.mjs:28,47-59; hooks/trim-output.mjs:84 | S | done | 001 |
| IC-007 | P1 | 9.0 | Code quality & tests | Project store key implemented three times with no consistency check | hooks/session-info.mjs:247-248; skills/learn/reference.md:6,10 | S | done | 001 |
| IC-008 | P1 | 6.0 | Security | Edit guard limits undocumented (model can call orchestrator:off, Bash edits uncovered); header says fail open but unreadable transcript denies | hooks/guard-edit.mjs:3,28-29,91-93,142-148 | S | done | 001 |
| IC-009 | P1 | 6.0 | Security | Eval job exposes ANTHROPIC_API_KEY to an agent with Bash and hides failed AppArmor sysctl with or-true | .github/workflows/eval.yml:64,80,86 | S | done | 002 |
| IC-010 | P1 | 6.0 | DX/CI-CD/dependencies | validate.yml has no permissions block, actions pinned to mutable tags, no Dependabot (also reported under Security) | .github/workflows/validate.yml:1-20; eval.yml:55,57,72; no .github/dependabot.yml | S | done | 002 |
| IC-011 | P1 | 6.0 | DX/CI-CD/dependencies | CI runs only Node 20 while README promises Node 18+ and current LTS is untested | .github/workflows/validate.yml:19; eval.yml:39,59; README.md:65,68 | S | done | 004 |
| IC-012 | P1 | 6.0 | UX & accessibility | Indonesian quick-start omits status, budget, init and resume | README.md:135-142 vs README.md:35,41-43; cycle 002: Ringkasan also lacks the Guard limits, Debugging and Guards: active bullets (README.md:68-70) | S | done | 004 |
| IC-013 | P1 | 6.0 | UX & accessibility | User-visible hook messages are English-only despite reply-in-user-language promise | hooks/long-session.mjs:173,190-193; hooks/guard-edit.mjs:18; README.md:3; hooks/rules.md:12 | S | done | 007 |
| IC-014 | P1 | 6.0 | UX & accessibility | Token and budget symbols (?, UNKNOWN, spent ?) never explained to users | README.md:55,98; skills/on/modes.md:10; scripts/budget.mjs:134-135 | S | done | 007 |
| IC-015 | P1 | 6.0 | UX & accessibility | status delegation count omits opus-planner | skills/status/SKILL.md:18; agents/opus-planner.md | S | done | 007 |
| IC-016 | P1 | 6.0 | UX & accessibility | Deny messages do not name the blocked file; review guard omits its escape hatch | hooks/guard-edit.mjs:18,31; hooks/guard-review.mjs:21 | S | done | 007 |
| IC-017 | P1 | 6.0 | UX & accessibility | resume tells user to run team/autopilot with a placeholder instead of the exact command | skills/resume/SKILL.md:51 vs :29 | S | done | 007 |
| IC-018 | P1 | 4.5 | Stability | Transcripts over 16 MB with an old off line are wrongly denied edits | hooks/guard-edit.mjs:94-106 | M | done | 010 |
| IC-019 | P1 | 4.5 | DX/CI-CD/dependencies | Token-regression gate in eval CI is dead: evals/baseline.json not committed | .github/workflows/eval.yml:89; README.md:165; `ls evals/baseline.json` -> No such file | M | blocked | 010 |
| IC-020 | P1 | 4.0 | Security | Predictable tmp marker files written with writeFileSync (symlink follow) and never cleaned | hooks/long-session.mjs:132,156-157,172,184 | S | done | 006 |
| IC-021 | P1 | 4.0 | Security | SessionStart injects user-store text into model context unescaped; raw transcript_path in digest command | hooks/session-info.mjs:255-259,262,279-281,293,305 | S | done | 005 |
| IC-022 | P1 | 4.0 | DX/CI-CD/dependencies | Eval fixture scripts have inconsistent executable bits, unchecked by validate | git ls-files -s evals/*/fixture.sh (5x 100755, 5x 100644); scripts/validate.mjs:802-803 | S | done | 010 |
| IC-023 | P1 | 4.0 | UX & accessibility | /orchestrator:on with no task has no defined behavior | skills/on/SKILL.md:8; README.md:35 | S | done | 007 |
| IC-024 | P1 | 4.0 | UX & accessibility | Chat style rule asks for terse telegraphic and not cryptic in the same bullet | hooks/rules.md:10 | S | done | 007 |
| IC-025 | P2 | 3.0 | Stability | trim-output blanks stderr and can drop failure lines without keywords | hooks/trim-output.mjs:251,277-283 | M | done | 010 |
| IC-026 | P2 | 3.0 | Performance | long-session re-reads up to 2 MB per prompt and reads whole transcript when no cache | hooks/long-session.mjs:52-61,72-75,98-99,166,186 | M | done | 010 |
| IC-027 | P2 | 3.0 | Code quality & tests | Hook helpers (stdin read, read windows, posInt, sidechain filter) copy-pasted across hooks | hooks/trim-output.mjs:75-78,123; hooks/guard-review.mjs:9-12; hooks/guard-edit.mjs:81-85; hooks/long-session.mjs:22,36,39-48,103-107,122 | M | done | 010 |
| IC-028 | P2 | 3.0 | Code quality & tests | validate.mjs is 824 lines in one flow and README version check is a substring match | scripts/validate.mjs:245 | M | done | 010 |
| IC-029 | P2 | 3.0 | UX & accessibility | Legacy heading still says removal planned in v1.8.0 (plugin is 1.12.1) | skills/learn/legacy.md:3 | S | done | 010 |
| IC-030 | P2 | 2.0 | Stability | guard-review PRD_PATH regex may go quadratic on long path-like prompts (needs investigation) | hooks/guard-review.mjs:158,189 | S | done | 010 |
| IC-031 | P2 | 2.0 | Observability & ops | rules hook depends on cat and hooks on node PATH with no failure signal | hooks/hooks.json:8 | S | done | 010 |
| IC-032 | P2 | 2.0 | Performance | Every Bash/Edit tool call spawns Node (~70-80 ms measured) | hooks/hooks.json:22-27,44-50; measured node -e 0 65-75 ms | M | blocked | 010 |
| IC-033 | P2 | 2.0 | UX & accessibility | Windows Git Bash instruction gives no default path or fallback | skills/on/SKILL.md:30; skills/init/SKILL.md:37; cycle 003 proposal: generate verify.ps1 when bash is missing (skills/init/SKILL.md:37) | M | done | 010 |
| IC-034 | P2 | 2.0 | New features | Proposal: in-plugin help command and changelogs moved out of README | skills/ (no help); README.md:31-46,71-117,143-166 | M | done | 010 |
| IC-035 | P2 | 2.0 | New features | Proposal: store key from repo identity instead of truncated path | hooks/session-info.mjs:52; skills/learn/reference.md:12; docs/ideas/token-saving.md:52 | M | done | 010 |
| IC-036 | P3 | 1.0 | Stability | long-session marker and cache writes are non-atomic | hooks/long-session.mjs:132,148,172,184 | S | done | 010 |
| IC-037 | P1 | 9.0 | Observability & ops | Guards: active line is printed even with ORCH_GUARD=off and only proves SessionStart ran | hooks/session-info.mjs:56; hooks/guard-edit.mjs:29; skills/status/SKILL.md:14; README.md:70 | S | done | 002 |
| IC-038 | P1 | 9.0 | UX & accessibility | modes.md still says nothing is committed without commit=batch, contradicting its new chat exception (regression of IC-001) | skills/on/modes.md:15 vs :20 | S | done | 002 |
| IC-039 | P1 | 4.0 | UX & accessibility | Guard-limits bullet says the model can call orchestrator:off, but off sets disable-model-invocation (regression of IC-008) | README.md:68; skills/off/SKILL.md:4; hooks/guard-edit.mjs:145-146 | S | done | 002 |
| IC-040 | P1 | 9.0 | Observability & ops | Inner catches that change guard decisions stay silent under ORCH_DEBUG; README overclaims | hooks/guard-edit.mjs:56,92,104,119; hooks/long-session.mjs:33,82,94,120,129,134,149,188; hooks/session-info.mjs:33,48,65,78,88,106; README.md:69 | S | done | 002 |
| IC-041 | P1 | 4.5 | Code quality & tests | Store-key cross-check silently skipped on Windows CI, PowerShell line never executed, substring checks only | scripts/validate.mjs:576,590; .github/workflows/validate.yml:13 | M | done | 002 |
| IC-042 | P1 | 6.0 | UX & accessibility | status report cap of 12 rows cannot hold the 14+ rows its Collect and Caps sections require | skills/status/SKILL.md:12-23,26 | S | done | 002 |
| IC-043 | P1 | 4.0 | Security | ORCH_DEBUG prints full stack and JSON.parse message, which can include stdin snippets (tool input, secrets) | hooks/guard-edit.mjs:23; hooks/guard-review.mjs:27; hooks/long-session.mjs:19; hooks/session-info.mjs:24; hooks/trim-output.mjs:34 | S | done | 005 |
| IC-044 | P1 | 4.0 | Stability | Root-fallback smoke test inherits GIT_* env and ignores git init failure | scripts/validate.mjs:495-510 | S | done | 010 |
| IC-045 | P1 | 4.0 | Code quality & tests | ORCH_DEBUG smoke tests cover 2 of 5 hooks and do not assert empty stdout | scripts/validate.mjs:484-492 | S | done | 010 |
| IC-046 | P1 | 6.0 | DX/CI-CD/dependencies | Always-loaded context budget headroom is 790 B (comment promises ~1 KB) and the comment is stale | scripts/validate.mjs:213-216; `cat hooks/rules.md skills/on/SKILL.md \| wc -c` -> 13410 vs 14200 | S | done | 002 |
| IC-047 | P1 | 6.0 | Code quality & tests | New smoke block duplicates trim payload and session-info helpers already in validate.mjs | scripts/validate.mjs:325-334 vs 462-470; ~415-420 vs ~573-600 | S | done | 002 |
| IC-048 | P1 | 4.0 | Stability | New smoke tests write ~3 MB of temp fixtures with unguarded cleanup and a tmpdir scan in finally | scripts/validate.mjs section 8a2/8a3 finally blocks | S | done | 010 |
| IC-049 | P3 | 1.0 | Performance | validate.mjs gained ~15 child spawns per run (estimate, unmeasured) | scripts/validate.mjs:461-616 | S | done | 010 |
| IC-050 | P3 | 1.0 | New features | Proposal: ORCH_DEBUG writes to a debug log file because hook stderr on exit 0 is not shown in chat | README.md:69 | M | done | 010 |
| IC-051 | P0 | 9.0 | Stability | budget.mjs --mark prints `mark 0` when the transcript is unreadable, so later spend covers the whole session | scripts/budget.mjs:72-76 | S | done | 003 |
| IC-052 | P1 | 6.0 | Stability | budget.mjs auto picks the newest jsonl, which can be a parallel session or a parent project's transcript, with no warning | scripts/budget.mjs:11-37,72 | S | done | 003 |
| IC-053 | P1 | 9.0 | DX/CI-CD/dependencies | eval-compare prints PASS when nothing was measured (all SKIP/NEW, model mismatch exits 0, missing arms unreported) | scripts/eval-compare.mjs:98-120 | S | done | 003 |
| IC-054 | P1 | 6.0 | Observability & ops | budget/trace-tokens drop the failure cause and resolved file on unreadable transcripts | scripts/budget.mjs:85,140; scripts/trace-tokens.mjs:15-17,218-222 | S | done | 004 |
| IC-055 | P2 | 3.0 | Performance | readTranscript loads the whole file even with --from; digest reads all for the last 60 messages | scripts/transcript.mjs:7-10; scripts/digest.mjs:16-17 | M | done | 010 |
| IC-056 | P1 | 4.0 | Security | eval-compare and trace-tokens read tracePath from result JSON without confining it to the results folder | scripts/trace-tokens.mjs:190,205; scripts/eval-compare.mjs:16,51 | S | done | 006 |
| IC-057 | P1 | 4.0 | DX/CI-CD/dependencies | validate.yml has no timeout-minutes or concurrency on a 3-OS matrix | .github/workflows/validate.yml:11-20 | S | done | 010 |
| IC-058 | P1 | 4.0 | Security | Executor agents have Bash+Write with no path limit and read-only planner/reviewer have Bash; no hook checks shell writes | agents/haiku-coder.md:4; agents/sonnet-dev.md:4; agents/opus-planner.md:4; agents/opus-reviewer.md:4; hooks/hooks.json:19-30 | S | done | 005 |
| IC-059 | P2 | 2.0 | Observability & ops | Eval workflow cannot tell a failed run from no baseline; artifact upload ignores missing files | .github/workflows/eval.yml:67-73 | S | done | 010 |
| IC-060 | P1 | 9.0 | UX & accessibility | Autopilot says any BLOCKED batch ends the run but also that only dependent batches are skipped | skills/autopilot/SKILL.md:16,38,40 | S | done | 003 |
| IC-061 | P1 | 9.0 | UX & accessibility | team and autopilot runs show no progress line per wave or batch | skills/team/SKILL.md:41; skills/autopilot/SKILL.md:36; skills/on/modes.md:11 | S | done | 003 |
| IC-062 | P1 | 9.0 | UX & accessibility | Autopilot has no path when every batch passes but the final project check fails | skills/autopilot/SKILL.md:38-43; skills/on/modes.md:12 | S | done | 003 |
| IC-063 | P1 | 9.0 | UX & accessibility | Non-Opus reviewer rule: autopilot says never per batch, non-opus.md/reference.md say final or batch diff | skills/autopilot/SKILL.md:18; skills/on/non-opus.md:5; skills/on/reference.md:29; agents/opus-reviewer.md:3 | S | done | 003 |
| IC-064 | P1 | 6.0 | UX & accessibility | init has no path for a failed Haiku pass or zero verified commands; report omits store path and --refresh | skills/init/SKILL.md:16-17,33,37,40-42 | S | done | 006 |
| IC-065 | P1 | 6.0 | UX & accessibility | learn promises "say remove that" but has no remove command | skills/learn/SKILL.md:4,35; skills/learn/reference.md:14-17 | S | done | 006 |
| IC-066 | P2 | 3.0 | UX & accessibility | isolate=worktree precondition worded differently in README and team skill | README.md:37; skills/team/SKILL.md:21 | S | done | 010 |
| IC-067 | P1 | 6.0 | UX & accessibility | --dry-run stops after an undefined "stage" and never defines how to continue | skills/team/SKILL.md:19; skills/autopilot/SKILL.md:19 | S | done | 006 |
| IC-068 | P1 | 6.0 | UX & accessibility | README install/update/uninstall lacks prerequisites (Node 18+, git 2.31+, bash), restart and store cleanup notes | README.md:8-29,46,65,70 | S | done | 006 |
| IC-069 | P1 | 6.0 | UX & accessibility | Short-path file limit is <=2 in on/SKILL.md but 1 for non-Opus elsewhere | skills/on/SKILL.md:21; skills/on/non-opus.md:4; README.md:157 | S | done | 006 |
| IC-070 | P1 | 4.5 | UX & accessibility | Budget rule in modes.md is one ~250-word bullet that contradicts itself (never sum notices vs sum notices), gives UNKNOWN no action, uses three stop wordings, and tells the model to pass an unquoted `?` (shell glob) | skills/on/modes.md:10; skills/autopilot/SKILL.md:44; README.md:35; scripts/budget.mjs:151 | M | done | 004 |
| IC-071 | P2 | 3.0 | UX & accessibility | Ideas doc says open: none while ideas 13-17 are open | docs/ideas/token-saving.md:3,46-53 | S | done | 010 |
| IC-072 | P2 | 3.0 | New features | Proposal: read guard for large whole-file main-session reads (idea 14) | docs/ideas/token-saving.md:49 | M | done | 010 |
| IC-073 | P2 | 2.0 | New features | Proposal: trim statistics row in status (idea 15) | docs/ideas/token-saving.md:50; skills/status/SKILL.md:12-26 | M | done | 010 |
| IC-074 | P1 | 9.0 | Code quality & tests | budget UNDER and UNKNOWN verdicts are never asserted | scripts/budget.mjs:133-136; scripts/validate.mjs:766-776 | S | done | 003 |
| IC-075 | P1 | 6.0 | Code quality & tests | trace-tokens lacks the tracePath basename fallback that eval-compare has | scripts/trace-tokens.mjs:178,193; scripts/eval-compare.mjs:27-29 | S | done | 003 |
| IC-076 | P1 | 6.0 | DX/CI-CD/dependencies | evals README says guard-review enforces reviewer-after-PRD order; it only checks the PRD exists | evals/README.md:26; hooks/guard-review.mjs:32-45 | S | done | 003 |
| IC-077 | P1 | 6.0 | Code quality & tests | Weak checkpoint grader still counts toward autopilot-budget-stop pass rate | evals/autopilot-budget-stop/graders/checkpoint.md:1-5; evals/README.md:96 | S | done | 003 |
| IC-078 | P1 | 4.5 | Code quality & tests | Validator skips nested grader keys and never checks grader enums or min/max | scripts/validate.mjs:38-40,972-975 | M | done | 010 |
| IC-079 | P1 | 6.0 | Code quality & tests | Untested branches in eval-compare, trace-tokens, transcript; MAIN assertion accepts any output | scripts/eval-compare.mjs:84-87,98,109-110; scripts/trace-tokens.mjs:140,209-210; scripts/transcript.mjs:12; scripts/validate.mjs:786 | S | done | 003 |
| IC-080 | P2 | 3.0 | DX/CI-CD/dependencies | README says CI runs on every push; it runs on main pushes and PRs only | README.md:173; .github/workflows/validate.yml:4-6 | S | done | 010 |
| IC-081 | P1 | 4.0 | DX/CI-CD/dependencies | Eval CI pins Claude Code 2.1.318 while trace fields were measured on 2.1.317 | .github/workflows/eval.yml:47; evals/README.md:52 | S | done | 010 |
| IC-082 | P1 | 6.0 | DX/CI-CD/dependencies | .gitignore misses evals/ci-result.json (token and cost data) | .gitignore:1; evals/README.md:34 | S | done | 004 |
| IC-083 | P1 | 6.0 | Code quality & tests | Script CLIs mishandle bad args (unguarded --write, --limit 0, --last 0, unknown flags) | scripts/eval-compare.mjs:4,88; scripts/budget.mjs:80-81; scripts/digest.mjs:11; scripts/trace-tokens.mjs:162 | S | done | 003 |
| IC-084 | P1 | 6.0 | DX/CI-CD/dependencies | eval-compare still exits 0 on EMPTY, model SKIP and MISSING pairs, so the CI gate stays green (regression of IC-053, partial); proposal: --strict and a verdict file | scripts/eval-compare.mjs:98-100,129-131; .github/workflows/eval.yml:64,69-71; evals/README.md:110 | S | done | 004 |
| IC-085 | P1 | 9.0 | UX & accessibility | Autopilot FINAL CHECK FAILED has no owner, brief or cap counter, and team has no final-check outcome (extends IC-062) | skills/autopilot/SKILL.md:40; skills/on/modes.md:13-14; skills/team/SKILL.md:55-56 | S | done | 004 |
| IC-086 | P1 | 6.0 | DX/CI-CD/dependencies | Always-loaded context headroom is 801 B again and the budget comment lacks 1.13.0 (regression of IC-046) | scripts/validate.mjs:215-217; LF bytes hooks/rules.md 3041 + skills/on/SKILL.md 10658 = 13699 vs 14500 | S | done | 004 |
| IC-087 | P1 | 6.0 | UX & accessibility | 1.13.0 release notes: Indonesian line omits half the changes and English overstates budget auto (outside git it still walks to root) | README.md:76-81,182; scripts/budget.mjs:42-43 | S | done | 004 |
| IC-088 | P1 | 4.0 | Observability & ops | budget auto stderr line pollutes 2>&1 output before the offset and exposes the home path | scripts/budget.mjs (process.stderr.write in main); skills/on/modes.md:10 | S | done | 010 |
| IC-089 | P1 | 4.0 | UX & accessibility | Progress line has undefined name placeholders, no delegation counter source and no states for DONE/BUDGET | skills/on/modes.md:12 | S | done | 007 |
| IC-090 | P2 | 2.0 | Stability | budget auto git top-level cutoff may miss a transcript of a session launched above the repo (needs investigation) | scripts/budget.mjs:26-45 | S | done | 010 |
| IC-091 | P3 | 1.0 | Performance | budget auto spawns git on every call | scripts/budget.mjs:26-33 | S | done | 010 |
| IC-092 | P1 | 6.0 | New features | Proposal: cache-break detector in budget (flag turns where cache reads collapse and name the turn) | scripts/budget.mjs:65-69; https://codex.danielvaughan.com/2026/07/28/token-reduction-is-not-cost-reduction-prompt-cache-economics-codex-cli-tool-output-compaction-billing/ | S | done | 009 |
| IC-093 | P1 | 6.0 | New features | Proposal: guard-edit denial streak switches to stop-and-ask after 3 denials in a row | hooks/guard-edit.mjs:22-23; https://anthropic.com/engineering/claude-code-auto-mode | S | done | 009 |
| IC-094 | P1 | 4.5 | New features | Proposal: eval CI runs only the cases affected by changed skills, hooks or agents | .github/workflows/eval.yml:64; https://www.fast.io/resources/ai-agent-prompt-regression-testing.md | M | done | 009 |
| IC-095 | P1 | 4.0 | New features | Proposal: delegation outcome ledger that turns past PASS/FAIL per tier into routing hints | hooks/hooks.json:32,42; https://arxiv.org/abs/2607.00053 | M | done | 009 |
| IC-096 | P2 | 3.0 | New features | Proposal: export orchestration runs as OpenTelemetry GenAI spans (invoke_agent, execute_tool, token usage) | scripts/trace-tokens.mjs:79,128; https://github.com/open-telemetry/semantic-conventions-genai | M | done | 009 |
| IC-097 | P2 | 2.0 | New features | Proposal: PRD task table compiled into a file-dependency DAG that derives parallel lanes and skips unchanged tasks | skills/team/SKILL.md:3; https://arxiv.org/pdf/2603.16104v1 | L | done | 009 |
| IC-098 | P2 | 3.0 | Code quality & tests | validate.mjs (~1500 lines, shared top-level state) still one file; split into modules deferred from IC-028 | scripts/validate.mjs | M | proposed | 010 |
| IC-099 | P1 | 6.0 | DX/CI-CD/dependencies | Cycle 010 features (read guard, help skill, store key, trim stats, debug log) have no CHANGELOG entry and version is still 1.13.0, so plugin update will not ship them | .claude-plugin/plugin.json:4; CHANGELOG.md | S | done | 010 |
| IC-100 | P3 | 1.0 | Code quality & tests | Eval fixtures on-learned-errors and on-learned-errors-write compute the store key with the old path-only bash rule | evals/on-learned-errors/fixture.sh; evals/on-learned-errors-write/fixture.sh | S | proposed | 010 |

## Status legend

- `proposed`: found and scored, awaiting user choice.
- `picked`: user chose it for the current cycle.
- `in-progress`: being executed on the cycle branch.
- `done`: committed and verified. Never re-proposed.
- `blocked`: attempted, failed or reverted; reason recorded in the cycle report.
- `deferred`: user chose not to do it now; re-validated next cycle.
- `stale`: evidence no longer present; kept for history.
- `rejected`: user declined permanently; not re-proposed.

## Dimensions

Performance, Security, Stability, New features, UI, UX & accessibility, Code quality & tests, DX/CI-CD/dependencies, Observability & ops.
