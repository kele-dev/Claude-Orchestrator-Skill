---
name: init
description: Maps a project for the orchestrator in one cheap pass. Haiku reads manifest and config files and writes the learned-map lesson with verified test/build/lint commands. Use when the user types /orchestrator:init, or at the start of the first task in a project that has no learned-map.
argument-hint: "[--refresh]"
---

# Project init: one-pass map

Arguments: $ARGUMENTS

`<store>` is defined in the `learn` skill (per-project folder under `~/.claude/orchestrator/`, same from every git worktree, writable from worktree sessions); use the session-start `Orchestrator store:` line, or run the Store command once, and put the absolute path in the brief. The main session never reads the manifests itself.

## 1. Skip
- If `<store>/lessons/learned-map.md` exists and there is no `--refresh`, say so in one line and stop. Also skip if a legacy learned-map exists (`legacy.md` in the `orchestrator:learn` folder; only if legacy files exist), unless `--refresh`.

## 2. Delegate once (`orchestrator:haiku-coder`, `TYPE: CREATE`)
The brief tells Haiku to read only top-level files that exist:
- package.json and workspace files, pyproject.toml, requirements*.txt, Cargo.toml, go.mod, composer.json, Gemfile.
- Makefile, justfile, Dockerfile, compose files, CI workflows (.github/workflows).
- CLAUDE.md (if present).
- The first 60 lines of README.
- A per-folder file count from `git ls-files` (top 2 levels, counts only, not the full list).

Same delegation: also copy missing legacy topics (`legacy.md` in the `orchestrator:learn` folder; only if legacy files exist).

## 3. Derive (same delegation)
- Stack, key folders and their purpose, entry points.
- Test, build, lint, and typecheck commands.
- Generated or do-not-edit paths.

## 4. Verify commands (same delegation)
- Run each detected test/lint/typecheck command once. Run-only: no edits, no fixes. Trim the output.
- Mark each one: verified, broken (with the first error), or not run (needs services, env, or secrets, or is slow, such as e2e or deploy).

## 5. Write the map (same delegation)
- Write `<store>/lessons/learned-map.md` in the `learn` format: the frontmatter description line plus at most 20 lesson lines (shorter is fine). Do not repeat facts CLAUDE.md already states.
- Also write `<store>/verify.sh` (bash, LF line endings, portable to bash 3.2 on macOS): `set -o pipefail`; for each **verified** test/lint/typecheck command, capture its output (`2>&1`) and print `PASS <name>`, or on failure `FAIL <name>` followed by the last 15 lines of its output; end with one line `VERIFY: PASS (n/m)` or `VERIFY: FAIL (n/m)` and exit non-zero on any failure. No broken or not-run commands. Run it once and confirm the last line.
- Add one map line: `Verify: bash <absolute store path>/verify.sh`, using the absolute store path from the brief, never the literal `<store>` (counts toward the 20 lines).

## 6. Report
- The main session reads only the Haiku report and the written map.
- Report in one short block (stack, commands with their status, the verify.sh result, anything broken) plus the token line.
