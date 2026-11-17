# Improvement Backlog

Project: orchestrator (Claude Code plugin, kele-dev marketplace)
Last updated: 2026-11-17 (cycle 002)

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
| IC-011 | P1 | 6.0 | DX/CI-CD/dependencies | CI runs only Node 20 while README promises Node 18+ and current LTS is untested | .github/workflows/validate.yml:19; eval.yml:39,59; README.md:65,68 | S | deferred | 001 |
| IC-012 | P1 | 6.0 | UX & accessibility | Indonesian quick-start omits status, budget, init and resume | README.md:135-142 vs README.md:35,41-43; cycle 002: Ringkasan also lacks the Guard limits, Debugging and Guards: active bullets (README.md:68-70) | S | deferred | 001 |
| IC-013 | P1 | 6.0 | UX & accessibility | User-visible hook messages are English-only despite reply-in-user-language promise | hooks/long-session.mjs:173,190-193; hooks/guard-edit.mjs:18; README.md:3; hooks/rules.md:12 | S | proposed | 001 |
| IC-014 | P1 | 6.0 | UX & accessibility | Token and budget symbols (?, UNKNOWN, spent ?) never explained to users | README.md:55,98; skills/on/modes.md:10; scripts/budget.mjs:134-135 | S | proposed | 001 |
| IC-015 | P1 | 6.0 | UX & accessibility | status delegation count omits opus-planner | skills/status/SKILL.md:18; agents/opus-planner.md | S | proposed | 001 |
| IC-016 | P1 | 6.0 | UX & accessibility | Deny messages do not name the blocked file; review guard omits its escape hatch | hooks/guard-edit.mjs:18,31; hooks/guard-review.mjs:21 | S | proposed | 001 |
| IC-017 | P1 | 6.0 | UX & accessibility | resume tells user to run team/autopilot with a placeholder instead of the exact command | skills/resume/SKILL.md:51 vs :29 | S | proposed | 001 |
| IC-018 | P1 | 4.5 | Stability | Transcripts over 16 MB with an old off line are wrongly denied edits | hooks/guard-edit.mjs:94-106 | M | proposed | 001 |
| IC-019 | P1 | 4.5 | DX/CI-CD/dependencies | Token-regression gate in eval CI is dead: evals/baseline.json not committed | .github/workflows/eval.yml:89; README.md:165; `ls evals/baseline.json` -> No such file | M | proposed | 001 |
| IC-020 | P1 | 4.0 | Security | Predictable tmp marker files written with writeFileSync (symlink follow) and never cleaned | hooks/long-session.mjs:132,156-157,172,184 | S | proposed | 001 |
| IC-021 | P1 | 4.0 | Security | SessionStart injects user-store text into model context unescaped; raw transcript_path in digest command | hooks/session-info.mjs:255-259,262,279-281,293,305 | S | proposed | 001 |
| IC-022 | P1 | 4.0 | DX/CI-CD/dependencies | Eval fixture scripts have inconsistent executable bits, unchecked by validate | git ls-files -s evals/*/fixture.sh (5x 100755, 5x 100644); scripts/validate.mjs:802-803 | S | proposed | 001 |
| IC-023 | P1 | 4.0 | UX & accessibility | /orchestrator:on with no task has no defined behavior | skills/on/SKILL.md:8; README.md:35 | S | proposed | 001 |
| IC-024 | P1 | 4.0 | UX & accessibility | Chat style rule asks for terse telegraphic and not cryptic in the same bullet | hooks/rules.md:10 | S | proposed | 001 |
| IC-025 | P2 | 3.0 | Stability | trim-output blanks stderr and can drop failure lines without keywords | hooks/trim-output.mjs:251,277-283 | M | proposed | 001 |
| IC-026 | P2 | 3.0 | Performance | long-session re-reads up to 2 MB per prompt and reads whole transcript when no cache | hooks/long-session.mjs:52-61,72-75,98-99,166,186 | M | proposed | 001 |
| IC-027 | P2 | 3.0 | Code quality & tests | Hook helpers (stdin read, read windows, posInt, sidechain filter) copy-pasted across hooks | hooks/trim-output.mjs:75-78,123; hooks/guard-review.mjs:9-12; hooks/guard-edit.mjs:81-85; hooks/long-session.mjs:22,36,39-48,103-107,122 | M | proposed | 001 |
| IC-028 | P2 | 3.0 | Code quality & tests | validate.mjs is 824 lines in one flow and README version check is a substring match | scripts/validate.mjs:245 | M | proposed | 001 |
| IC-029 | P2 | 3.0 | UX & accessibility | Legacy heading still says removal planned in v1.8.0 (plugin is 1.12.1) | skills/learn/legacy.md:3 | S | proposed | 001 |
| IC-030 | P2 | 2.0 | Stability | guard-review PRD_PATH regex may go quadratic on long path-like prompts (needs investigation) | hooks/guard-review.mjs:158,189 | S | proposed | 001 |
| IC-031 | P2 | 2.0 | Observability & ops | rules hook depends on cat and hooks on node PATH with no failure signal | hooks/hooks.json:8 | S | proposed | 001 |
| IC-032 | P2 | 2.0 | Performance | Every Bash/Edit tool call spawns Node (~70-80 ms measured) | hooks/hooks.json:22-27,44-50; measured node -e 0 65-75 ms | M | proposed | 001 |
| IC-033 | P2 | 2.0 | UX & accessibility | Windows Git Bash instruction gives no default path or fallback | skills/on/SKILL.md:30; skills/init/SKILL.md:37 | M | proposed | 001 |
| IC-034 | P2 | 2.0 | New features | Proposal: in-plugin help command and changelogs moved out of README | skills/ (no help); README.md:31-46,71-117,143-166 | M | proposed | 001 |
| IC-035 | P2 | 2.0 | New features | Proposal: store key from repo identity instead of truncated path | hooks/session-info.mjs:52; skills/learn/reference.md:12; docs/ideas/token-saving.md:52 | M | proposed | 001 |
| IC-036 | P3 | 1.0 | Stability | long-session marker and cache writes are non-atomic | hooks/long-session.mjs:132,148,172,184 | S | proposed | 001 |
| IC-037 | P1 | 9.0 | Observability & ops | Guards: active line is printed even with ORCH_GUARD=off and only proves SessionStart ran | hooks/session-info.mjs:56; hooks/guard-edit.mjs:29; skills/status/SKILL.md:14; README.md:70 | S | done | 002 |
| IC-038 | P1 | 9.0 | UX & accessibility | modes.md still says nothing is committed without commit=batch, contradicting its new chat exception (regression of IC-001) | skills/on/modes.md:15 vs :20 | S | done | 002 |
| IC-039 | P1 | 4.0 | UX & accessibility | Guard-limits bullet says the model can call orchestrator:off, but off sets disable-model-invocation (regression of IC-008) | README.md:68; skills/off/SKILL.md:4; hooks/guard-edit.mjs:145-146 | S | done | 002 |
| IC-040 | P1 | 9.0 | Observability & ops | Inner catches that change guard decisions stay silent under ORCH_DEBUG; README overclaims | hooks/guard-edit.mjs:56,92,104,119; hooks/long-session.mjs:33,82,94,120,129,134,149,188; hooks/session-info.mjs:33,48,65,78,88,106; README.md:69 | S | done | 002 |
| IC-041 | P1 | 4.5 | Code quality & tests | Store-key cross-check silently skipped on Windows CI, PowerShell line never executed, substring checks only | scripts/validate.mjs:576,590; .github/workflows/validate.yml:13 | M | proposed | 002 |
| IC-042 | P1 | 6.0 | UX & accessibility | status report cap of 12 rows cannot hold the 14+ rows its Collect and Caps sections require | skills/status/SKILL.md:12-23,26 | S | done | 002 |
| IC-043 | P1 | 4.0 | Security | ORCH_DEBUG prints full stack and JSON.parse message, which can include stdin snippets (tool input, secrets) | hooks/guard-edit.mjs:23; hooks/guard-review.mjs:27; hooks/long-session.mjs:19; hooks/session-info.mjs:24; hooks/trim-output.mjs:34 | S | proposed | 002 |
| IC-044 | P1 | 4.0 | Stability | Root-fallback smoke test inherits GIT_* env and ignores git init failure | scripts/validate.mjs:495-510 | S | proposed | 002 |
| IC-045 | P1 | 4.0 | Code quality & tests | ORCH_DEBUG smoke tests cover 2 of 5 hooks and do not assert empty stdout | scripts/validate.mjs:484-492 | S | proposed | 002 |
| IC-046 | P1 | 6.0 | DX/CI-CD/dependencies | Always-loaded context budget headroom is 790 B (comment promises ~1 KB) and the comment is stale | scripts/validate.mjs:213-216; `cat hooks/rules.md skills/on/SKILL.md \| wc -c` -> 13410 vs 14200 | S | done | 002 |
| IC-047 | P1 | 6.0 | Code quality & tests | New smoke block duplicates trim payload and session-info helpers already in validate.mjs | scripts/validate.mjs:325-334 vs 462-470; ~415-420 vs ~573-600 | S | proposed | 002 |
| IC-048 | P1 | 4.0 | Stability | New smoke tests write ~3 MB of temp fixtures with unguarded cleanup and a tmpdir scan in finally | scripts/validate.mjs section 8a2/8a3 finally blocks | S | proposed | 002 |
| IC-049 | P3 | 1.0 | Performance | validate.mjs gained ~15 child spawns per run (estimate, unmeasured) | scripts/validate.mjs:461-616 | S | proposed | 002 |
| IC-050 | P3 | 1.0 | New features | Proposal: ORCH_DEBUG writes to a debug log file because hook stderr on exit 0 is not shown in chat | README.md:69 | M | proposed | 002 |

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
