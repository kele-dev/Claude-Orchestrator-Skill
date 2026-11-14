# PRD: v1.12.1 improvement cycle (D01, V01, G01)

Source: docs/prd/improvement-log.md (audit of v1.12.0, 2026-11-15). Items: D01 = FT-01, DX-01, DX-02, DX-03, DX-08, DX-10; G01 = FN-01, DX-04, DX-05, DX-06, DX-07; V01 = FN-17 plus an English "What's new" block check.

## Goal
Fix the three highest impact/effort groups from the log without changing any skill rule: README EN/ID parity, a guard-review path bug plus guard/notice messages that name their escape hatches, and a validator that notices if a guard matcher or a hook registration regresses.

## Non-goals
- No change to skills/*, agents/*, hooks/rules.md (always-loaded budget stays 13,2xx B < 14,200 B).
- No new hook, no shell-write guard (FN-02 needs a design), no store-key change (FN-05/BL-17).
- No commit and no push by executors.

## Facts (from the audits; line numbers as reported, verify before editing)
- hooks/guard-review.mjs:7: the PRD-path pattern uses a lookbehind that rejects `\` and `:`, so a PRD given as a Windows absolute path (`C:\p\docs\prd\x.md`, `C:/p/docs/prd/x.md`) or with a non-ASCII slug (`docs/prd/rancangan-é.md`) is never checked and the reviewer launches without a PRD. Tests: "review C:\proj\docs\prd\nope.md" => allow (should deny when the file does not exist), "docs/prd/rancangan-é.md" => allow (should deny), "docs/prd/nope.md" => deny (correct).
- hooks/guard-edit.mjs:19 deny text names only `/orchestrator:off`; README.md:67 promises `ORCH_GUARD=off`. hooks/guard-review.mjs:21 deny text names no escape hatch; whether guard-review honors `ORCH_GUARD=off` must be checked in the file.
- hooks/trim-output.mjs:42,64 notices name only `# notrim` (README also promises `ORCH_NO_TRIM=1`). hooks/long-session.mjs has two messages: the repeat reminder at :173 and the first warning built from the `tail` constant at :190-193; neither names an env var (`ORCH_LONG`, `ORCH_LONG_TOKENS`, `ORCH_LONG_REPEAT` exist per README). validate.mjs:526,542 asserts the first warning does NOT contain the word "reminder".
- hooks/guard-review.mjs:32 already honors `ORCH_GUARD=off` (smoke-tested at validate.mjs:642). Existing smoke cases at validate.mjs:639-641: haiku-coder agent, the `docs/prd/*.md` glob, and `https://example.com/docs/prd/x.md` must stay allowed.
- CI (.github/workflows/validate.yml:13) runs the validator on ubuntu, windows and macos; `path.isAbsolute('C:\\x')` is false on POSIX.
- scripts/validate.mjs:110-148 checks hooks.json only for SessionStart matchers, non-empty PreToolUse/PostToolUse matchers and referenced files; it does not check matcher content, required events, or that each hooks/*.mjs is registered. Changing guard-edit's matcher to "Edit" still passes.
- README: English "What's new" has blocks 1.12.0, 1.11.0, 1.10.1 ... but no 1.11.1 (README.md:79-97), while the Indonesian summary has "Baru di 1.11.1" (README.md:158). The validator checks only that "Baru di" lines are in ascending order and that one exists for the manifest version.
- Existing smoke tests in validate.mjs may assert substrings of the hook messages (e.g. `trimmed`, `# notrim`): grep validate.mjs before changing a message; only append to a message, never rename an asserted substring.

## Tasks (exclusive file ownership)

### T-D01 (README + version), executor sonnet-dev
Files: README.md, .claude-plugin/plugin.json, .claude-plugin/marketplace.json.
1. Version 1.12.0 -> 1.12.1 in both manifests.
2. English "What's new": add `### 1.12.1` (this cycle: guard-review accepts Windows absolute and non-ASCII PRD paths; guard and trim/long-session notices name their escape hatches; validator checks hook matchers/registration and the English "What's new" block; README parity fixes) and `### 1.11.1` (take the content from the Indonesian "Baru di 1.11.1" line and `git log` of the v1.11.1 commit: hand-off of long sessions with a summary and a new-session card), in the same format and descending order as the existing blocks.
3. Indonesian summary: add `- Baru di 1.12.1: ...` directly after the 1.12.0 line (ascending order). Do NOT edit any historical "Baru di" bullet (they are history).
4. Indonesian summary, non-history places: the main command lines must mention `budget=<N>k`, `isolate=worktree` (one sentence with its conditions, taken from skills/team/SKILL.md and skills/status/caps.md), `lanes=N` / `batches=N` with the automatic raise (3 -> 4 lanes, 5 -> 8 batches, fix rounds 2 -> 4) and that an argument above the ceiling is clamped to it (lanes=6 becomes 4). Add the current trim numbers (over 80 lines and 4000 chars; first 3 lines, up to 10 error lines, last 30 lines; about 26k char cap) in the Indonesian Hooks text.
5. One table of all `ORCH_*` environment variables in the English Hooks section (find them with `grep -rho "ORCH_[A-Z_]*" hooks scripts`; name, default, effect). Keep the existing short mentions but point to the table. State that `ORCH_GUARD=off` disables both the edit guard and the review guard (T-G01 makes guard-review honor it).
Verify: `grep -c "^### 1.11.1" README.md` = 1, `grep -c "^### 1.12.1" README.md` = 1, `grep -n "Baru di 1.12.1" README.md`, `grep -c "1.12.0" .claude-plugin/*.json` = 0 each; run only these (other tasks edit other files in parallel; ignore `node scripts/validate.mjs` errors from files you do not own).

### T-G01 (hooks), executor sonnet-dev
Files: hooks/guard-review.mjs, hooks/guard-edit.mjs, hooks/trim-output.mjs, hooks/long-session.mjs.
1. guard-review: detect PRD paths written as Windows absolute (`C:\...\docs\prd\x.md`, `C:/.../docs/prd/x.md`) and with non-ASCII letters in the slug (use `\p{L}\p{N}` with the `u` flag), resolve them against the project root/cwd as the file already does for other forms, and deny when the file does not exist (same message). Existing behavior for relative and POSIX-absolute paths must not change, and a URL such as `https://example.com/docs/prd/x.md` must stay allowed. Drive-letter paths (`/^[A-Za-z]:[\\/]/`) are recognized on every platform (deny when the file is missing), because `path.isAbsolute('C:\\x')` is false on POSIX. `ORCH_GUARD=off` is already honored (guard-review.mjs:32): keep it.
2. Messages: guard-edit deny text adds "or set ORCH_GUARD=off"; guard-review deny text adds "(ORCH_GUARD=off disables this guard)"; trim-output notices add "or set ORCH_NO_TRIM=1" next to `# notrim`; long-session appends "ORCH_LONG=off disables it; ORCH_LONG_TOKENS sets the threshold" to BOTH messages (the repeat at ~:173 and the first warning from the `tail` constant at ~:190-193); the first warning must not contain the word "reminder". Append only, keep every existing substring (validator smoke tests assert some).
Verify (stdin JSON built with env vars + JSON.stringify): guard-review on a prompt referencing `C:\<tmp>\docs\prd\nope.md` (nonexistent) => deny; same path pointing to an existing file => allow; `docs/prd/rancangan-é.md` nonexistent => deny, existing => allow; `docs/prd/nope.md` => deny; ORCH_GUARD=off => allow; node --check on all four files; the message additions present. Also confirm the three existing smoke inputs still behave as before (haiku-coder agent, `docs/prd/*.md` glob, `https://example.com/docs/prd/x.md` => allow). You may run `node scripts/validate.mjs` read-only and must fix any error that comes from hooks/* (guard-review cases, the first long-session warning must not contain "reminder"); ignore errors from README, manifests or validate.mjs itself; never edit scripts/validate.mjs.

### T-V01 (validator), executor sonnet-dev, AFTER T-D01 and T-G01
File: scripts/validate.mjs.
1. hooks.json: require events SessionStart, PreToolUse, PostToolUse, UserPromptSubmit; require that a PreToolUse matcher covering Edit, Write and NotebookEdit exists whose command references guard-edit.mjs; a PreToolUse matcher matching Agent (or Task) whose command references guard-review.mjs; a PostToolUse matcher covering Bash and PowerShell whose command references trim-output.mjs; and that every `hooks/*.mjs` file is referenced by at least one command in hooks.json.
2. README: require an English `### <version>` block for the manifest version and for every version that has an Indonesian "Baru di <version>" bullet at or above the fixed threshold taken from the README heading `## What's new (1.9.0 and later)` (README.md:71; parse it and compare versions numerically as validate.mjs:302 does, never as strings); the check must pass on the README as fixed by T-D01 and fail if the `### 1.11.1` block is removed.
3. Smoke tests in the file's existing style, deterministic, in temp dirs, nothing under evals/: guard-review Windows absolute and non-ASCII cases (as in T-G01 Verify; a missing file => deny on every platform, an existing-file => allow case only when `process.platform === 'win32'`) and `ORCH_GUARD=off`; pure-function negative tests (the new hooks.json and README checks are pure functions over the parsed hooks.json, the list of hooks/*.mjs files and the README text, called on in-memory mutations; never spawn validate.mjs from inside itself and never copy the repo) that the checks fail (matcher changed to "Edit"; a hook registration removed; the English 1.11.1 block removed).
Verify: `node scripts/validate.mjs` prints OK (version 1.12.1); the negative tests assert failure messages; temp dirs removed.

## Order
Wave 1 (parallel): T-D01, T-G01 (no shared files). Wave 2: T-V01 (needs the README block and the guard-review behavior). Then: full `node scripts/validate.mjs` once, diff review (`opus-reviewer` on the final diff; main session is not Opus-class), commit v1.12.1 together with docs/prd/improvement-log.md (statuses updated) and this PRD.

## Risks
- Message wording changes may break existing validator smoke tests: mitigated by "append only".
- The validator's English-block rule must not hard-code an old threshold: T-V01 derives it from the README.
- README table of env vars can drift from code: T-V01 does not check it (out of scope; log as a new item if wanted).

## Acceptance
`node scripts/validate.mjs` OK with version 1.12.1; always-loaded size unchanged (hooks/rules.md + skills/on/SKILL.md <= 14,200 B LF); the log rows FT-01, DX-01..DX-08, DX-10, FN-01, FN-17 set to done.
