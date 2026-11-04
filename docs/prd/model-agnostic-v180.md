# PRD: v1.8.0 model-agnostic orchestrator

## Goal
The orchestrator works with any main-session model. Rules name roles (main session / orchestrator, planner, reviewer, executor), not models. Add a transcript digest script and a one-time long-session warning hook.

## Non-goals
- No change to the Opus-class main-session flow (it behaves exactly as v1.7.4), except that `opus-reviewer` is now pinned to Opus (accepted: a main session stronger than Opus gets an Opus reviewer).
- No model detection in hooks: the main session knows its own model from its system prompt and applies the rule itself.
- No change to haiku-coder / sonnet-dev behaviour, team/autopilot caps, the store layout, or the eval suite.

## Terms (use the same words in every file)
- "main session": the model the user talks to; it orchestrates.
- "Opus-class": Opus or a model at least as capable (e.g. Fable). Anything else (Sonnet, Haiku, others) is "not Opus-class".
- `opus-planner`, `opus-reviewer`: agents pinned to `model: opus`.

## Design
1. Opus-class main session: unchanged flow (thinks, writes the PRD, verifies).
2. Not Opus-class main session:
   - Short path: unchanged, the main session does it.
   - Full path: the main session delegates design to `opus-planner` (brief: task, constraints, digest command); the planner returns the PRD text and design decisions; the main session saves it to `docs/prd/<slug>.md` unchanged and builds haiku briefs from it. The final (or batch) diff MUST go to `opus-reviewer`.
   - Escalation: when the step 4 ladder has failed (where Opus-class would "rewrite the PRD/brief"), the main session sends the error, diff and PRD to `opus-planner` for diagnosis and a rewritten brief, then follows the same remaining attempts.
3. Haiku main session: when a task that changes files arrives, first say in one line that switching to a stronger main model (Opus recommended, Sonnet minimum) is advised, then continue.
4. Digest: `scripts/digest.mjs` turns a transcript into a compact conversation summary the planner can read without the full transcript.
5. Long-session warning: a `UserPromptSubmit` hook warns once per session when the transcript is long.

## Tasks
| # | Files | Executor | Spec | Verify |
|---|-------|----------|------|--------|
| T1 | `scripts/digest.mjs` (new) | haiku | Spec T1 | A1 |
| T2 | `hooks/long-session.mjs` (new), `hooks/hooks.json` | haiku | Spec T2 | A2, `node scripts/validate.mjs` |
| T3 | `hooks/session-info.mjs` | haiku | Spec T3 | A3 |
| T4 | `agents/opus-planner.md` (new), `agents/opus-reviewer.md` | haiku | Spec T4 | `node scripts/validate.mjs` |
| T5 | `hooks/rules.md`, `skills/on/SKILL.md`, `skills/on/reference.md`, `skills/on/modes.md`, `skills/team/SKILL.md`, `skills/autopilot/SKILL.md`, `skills/init/SKILL.md`, `skills/learn/SKILL.md`, `skills/status/SKILL.md`, `agents/sonnet-dev.md` (only these) | sonnet | Spec T5 | A5, `node scripts/validate.mjs` |
| T6 | `scripts/validate.mjs` | haiku | Spec T6 | `node scripts/validate.mjs` prints OK |
| T7 | `README.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | haiku | Spec T7 | `node scripts/validate.mjs` prints `version 1.8.0` |

Order: T1, T2, T3, T4 (independent, sequential delegations), then T5, T6 (needs T1-T2), T7.

## Spec T1: `scripts/digest.mjs`
- Usage: `node scripts/digest.mjs <transcript.jsonl> [--last N]` (default N = 60 messages). Node 18+, no dependencies, ESM, header comment like other scripts.
- Read the JSONL line by line; skip unparseable lines, lines with `isSidechain: true` or `isMeta: true`, and lines whose `type` is not `user` or `assistant`.
- Keep only text: `message.content` as a string, or the `text` of items with `type: "text"`. Drop `tool_use`, `tool_result`, `thinking`, images.
- Slash commands: a user text that contains `<command-name>` becomes `/<name> <args>` from the `<command-name>` and `<command-args>` values (name without a leading slash duplicated), e.g. `U: /orchestrator:on fix X`; drop it if both are empty.
- Otherwise remove `<system-reminder>...</system-reminder>` blocks and only these wrapper blocks: `<command-message>`, `<command-name>`, `<local-command-stdout>`, `<local-command-stderr>`, `<local-command-caveat>`; drop the message if nothing but whitespace is left.
- Claude Code writes one line per content block: merge consecutive kept assistant texts with the same `message.id` (or, without an id, consecutive assistant texts) into one message before applying `--last N`.
- Collapse runs of blank lines; cap each message at 2000 chars (append ` [...]`).
- Output: one block per message, `U: <text>` or `A: <text>`, separated by a blank line; only the last N messages. Missing/unreadable file: message to stderr, exit 1.

## Spec T2: `hooks/long-session.mjs` + `hooks/hooks.json`
- New entry in hooks.json, no matcher field: `"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/long-session.mjs\"", "timeout": 10}]}]`.
- Reads stdin JSON (`session_id`, `transcript_path`). Fails open (any error -> no output, exit 0), same style as `session-info.mjs`.
- Long = transcript size >= 2 MB (`ORCH_LONG_BYTES` overrides), or >= 30 delegations (`ORCH_LONG_DELEGATIONS` overrides) counted as occurrences of the value form `"subagent_type":"` (not the schema form `"subagent_type":{`); read the file only when it is >= 256 KB. An override applies only if it parses to a positive integer, else the default (like `posInt` in `hooks/trim-output.mjs`).
- Check order: `ORCH_LONG=off` -> exit; sanitize `session_id` with `.replace(/[^A-Za-z0-9-]/g, '')`, empty -> exit; marker exists -> exit; stat; read only if needed.
- Once per session: marker file `<os.tmpdir()>/orchestrator-long-<sanitized session_id>`; if it exists, print nothing; create it when warning. `ORCH_LONG=off` disables.
- Output when long, on stdout as JSON: `{"systemMessage": "<line>", "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "<line>"}}`, line = `orchestrator: this session is long (<(bytes/1048576).toFixed(1)> MB, <n> delegations). Write a checkpoint per orchestrator:resume and continue in a new session with /orchestrator:resume.`

## Spec T3: `hooks/session-info.mjs`
- If `input.transcript_path` is a non-empty string, add one line: `Digest: node "<pluginRoot>/scripts/digest.mjs" "<transcript_path>" --last 60` with both paths forward-slashed and absolute; `pluginRoot` = `dirname(dirname(fileURLToPath(import.meta.url)))` (never `new URL(...).pathname`).
- Everything else unchanged.

## Spec T4: agents
- `agents/opus-planner.md`: frontmatter `name: opus-planner`, `description` (called by a main session that is not Opus-class: writes the PRD and design decisions for full-path work, and diagnoses after the escalation ladder fails; read-only), `tools: Read, Grep, Glob, Bash`, `model: opus`, `effort: high`. Body (<= 25 lines, style of `opus-reviewer.md`): read-only, Bash only for reading/verifying; if a digest command is given, run it first for the conversation context; read only needed files; output the PRD in the structure of `skills/on/SKILL.md` step 2 (goal, non-goals, atomic tasks with files and verify command, signatures/examples, acceptance tests, risks, assumptions), ready for haiku briefs; for a diagnosis: root cause, evidence file:line, the rewritten brief; limit command output with `tail`.
- `agents/opus-reviewer.md`: `model: inherit` -> `model: opus`; nothing else.

## Spec T5: role wording (sonnet-dev)
- Replace "Opus" where it means the main session/orchestrator by "the main session" (or "orchestrator" where it reads better). Keep "Opus" only in agent names, "Opus-class", and model recommendations.
- `skills/on/SKILL.md`: add a short section "Main-session model" right after the core rule: Design points 1-3 above, in <= 8 lines. Step 2: not Opus-class -> PRD comes from `opus-planner`. Step 4: not Opus-class -> diagnosis/rewrite comes from `opus-planner`. Step 5: not Opus-class -> final diff always to `opus-reviewer`. Agent list at the top gains `orchestrator:opus-planner`.
- `hooks/rules.md`: role wording; add one bullet: non-Opus-class main session uses `opus-planner`/`opus-reviewer` per `orchestrator:on`; Haiku main session suggests a stronger model in one line for file-changing tasks.
- `skills/on/modes.md`: agent list gains `orchestrator:opus-planner`; role wording.
- Keep every file's length within +10%, except `on/SKILL.md` (+14 lines max) and `hooks/rules.md` (+2 lines max); step 2/4/5 changes are inline clauses. No other behaviour changes.

## Spec T6: validator
- Syntax check already covers `scripts/` and `hooks/` (confirm digest.mjs and long-session.mjs are included).
- Smoke `digest.mjs`: temp JSONL (os.tmpdir) with: a user text line containing a `<system-reminder>` block plus text "hello", an assistant line with text "world" and a tool_use item, a user tool_result line, an `isSidechain: true` assistant line "secret"; plus an `isMeta: true` user line "meta", plus a user line `<command-message>x</command-message><command-name>/orchestrator:on</command-name><command-args>do X</command-args>`; expect exit 0, stdout contains `U: hello`, `A: world` and `U: /orchestrator:on do X`, not `system-reminder`, `secret` or `meta`.
- Smoke `long-session.mjs`: env passes `ORCH_LONG: ''`, `ORCH_LONG_DELEGATIONS: ''` explicitly and session_id `validate-<pid>-<Date.now()>`; temp transcript 10 bytes -> empty stdout; with `ORCH_LONG_BYTES=5` and a fresh session_id -> stdout JSON with `systemMessage`; same session_id again -> empty stdout. Clean up temp files and markers.
- Agents: `opus-planner` and `opus-reviewer` must have `model: opus`.

## Spec T7: release
- Both manifests `version` -> `1.8.0`.
- README: English section mentions `opus-planner` in the agent list and that any main model works (Opus-class recommended). Indonesian changelog bullet "Baru di 1.8.0: ..." (any main model; opus-planner; opus-reviewer pinned to opus; digest.mjs; long-session warning with `ORCH_LONG=off`, `ORCH_LONG_BYTES`, `ORCH_LONG_DELEGATIONS`), placed after the 1.7.4 bullet.

## Acceptance tests
- A1: digest of a real transcript runs < 5 s; output has no `<system-reminder>`, tool results, or sidechain text.
- A2: hook smoke as in T6 passes on Windows.
- A3: `session-info.mjs` with `{cwd, transcript_path}` prints the `Digest:` line; without `transcript_path` it does not.
- A5: `grep -rn "Opus" skills hooks/rules.md agents` shows only agent names, "Opus-class", or model recommendations.
- Final: `node scripts/validate.mjs` prints `OK: 8 skills, 4 agents, version 1.8.0`.

## Risks
- `UserPromptSubmit` output: if `systemMessage` is not shown, `additionalContext` still reaches the model, which relays it.
- Transcript schema may change: digest skips unknown shapes instead of failing.
- Reading a large transcript on every prompt: bounded by the 256 KB / 2 MB thresholds and the once-per-session marker.

## Assumptions
- `transcript_path` is present in SessionStart and UserPromptSubmit input (current Claude Code).
- The main session knows its own model name from its system prompt.
- The installed plugin (1.7.1) guard blocks `docs/prd/` inside worktrees; the PRD is copied in by haiku-coder.
