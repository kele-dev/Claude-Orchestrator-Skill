# PRD: orchestrator v1.16.0, Maestro (Codex and Gemini as workers)

## Goal
Add `/orchestrator:maestro <task>`: a user-invoked mode where Claude plans and verifies, OpenAI Codex CLI writes code, and Google Antigravity CLI (Gemini) reads and reviews.
- Main purpose: spend less Claude quota by using ChatGPT and Gemini subscriptions that the user already pays for.
- `orchestrator:on` stays the default and keeps its behavior.
- Release as v1.16.0.

## Non-goals
- No behavior change to `orchestrator:on`, `team` or `autopilot`. Always-loaded text changes only by adding `orchestrator:maestro` to two exception lists and one command list (T5).
- Gemini never writes files and never gets tools in v1.
- No API keys. Both CLIs use the user's own subscription login.
- The plugin never logs in, and never edits `~/.codex/config.toml` or `~/.gemini/antigravity-cli/settings.json`.
- No parallel Codex runs, no `--verify` inside the script, no forcing subcommands (`codex <task>`, `gemini <task>`), no continuing from partial work. All are v2 candidates.
- No eval case and no API spend in this release. No task commits.
- No WSL or container isolation.

## Facts found (spike on Windows 11, Codex CLI 0.172.0, Antigravity CLI 1.5.16; these constrain the design)
- Gemini CLI stopped serving Google AI Pro and Ultra users on 2026-06-18. The Google worker is Antigravity CLI, command `agy`.
- Codex:
  - `codex exec -C <dir> -s workspace-write --ephemeral --json --output-schema <schema> -o <last-message-file> -` reads the prompt from stdin. Effort is `-c model_reasoning_effort="high"`.
  - `workspace-write` also makes the temp folders writable. A write to `../outside` inside `%TEMP%` succeeded until both `-c sandbox_workspace_write.exclude_tmpdir_env_var=true` and `-c sandbox_workspace_write.exclude_slash_tmp=true` were passed. With them, the write was blocked.
  - The sandbox blocks writes to `.git` (`index.lock: Permission denied`). Codex cannot commit; it reports `status: partial`.
  - A usage-limit stop shows as a JSONL event `{"type":"turn.failed","error":{"message":"Your workspace is out of credits..."}}` with exit 1 (seen on a 5-hour limit).
  - Final usage is in the `turn.completed` event (`usage.input_tokens`, `output_tokens`). A tiny task used about 227k input tokens because Codex loaded the user's own plugins and skills. `--ignore-user-config` exists ("auth still uses CODEX_HOME") but was not tested.
  - On this machine `codex` resolves to `codex.exe` (not an npm `.cmd` shim).
- Antigravity:
  - Long prompts go through stdin: `agy --print= --input-format stream-json --output-format stream-json ...` with one stdin line `{"event":"user","message":{"role":"user","content":"<prompt>"}}`. A 48 KB prompt worked (41 s). The last stdout line is `{"event":"result","result":{"status":"SUCCESS"|"ERROR","response":...,"error":...,"usage":{...}}}`. `-p` needs an attached value (`--print=`); a bare `-p` before other flags takes the next flag as the prompt.
  - With `--json-schema` the structured answer is in the result (`structured_output`; for stream-json "only applicable to the final result"). Not yet tested together with stream-json: part of the live check.
  - `agy models` prints `<id>\t<label>` lines. Ids embed the effort, e.g. `gemini-4-neon-high`. The list also contains `claude-*` and `gpt-oss-*` ids.
  - `--settings` is session-only and never saved. Its `permissions.deny` rules beat the global allow rules: with `write_file(*)`, `read_file(*)`, `command(*)`, `read_url(*)`, `execute_url(*)`, `download_url(*)`, `mcp(*)` denied, a requested write outside the folder failed with "Matches user-configured deny rule".
  - `allowNonWorkspaceAccess: false` and a narrow `trustedWorkspaces` in `--settings` did NOT stop writes outside the workspace when the global settings trust the whole home folder. So any Gemini mode with write tools is unsafe on this machine.
  - A denied tool in headless mode is soft-denied: exit 0 and `"status":"SUCCESS"`, but `structured_output` is null and stderr contains `no output produced` / `auto-denied`.
  - A no-tools review with file content inline (65 s, about 22k tokens) found the seeded bug with file and line.
  - `agy` resolves to `agy.exe`.
- git (checked by the reviewer, git 2.40 Windows): `git apply --3way` fails on any file with unstaged edits ("does not match index"), and on a real conflict it writes conflict markers and changes the index. Plain `git apply` applied a non-overlapping patch cleanly.
- Repo:
  - The always-loaded context (`hooks/rules.md` + `skills/on/SKILL.md`) is 13,763 B against a budget of 14,700 B (`scripts/validate/layout.mjs:163`).
  - `layout.mjs:118-121` flags an `orchestrator:<name>` mention in `rules.md` or help as an unknown skill until `skills/<name>/SKILL.md` exists. `layout.mjs:131-134` requires README to list every skill. `layout.mjs:185` requires `disable-model-invocation: true` for user-invoked skills. `layout.mjs:191-210` requires help to list every skill.
  - `layout.mjs:219-292` requires `Baru di <version>` in README and ascending `Baru di` lines in README and CHANGELOG. `layout.mjs:20-24` requires the same version in `plugin.json` and `marketplace.json`.
  - `skills/on/SKILL.md:9` and `hooks/rules.md:2` exclude other planning/execution skills except `team` and `autopilot`.
  - `skills/on/non-opus.md` sends the PRD and the final diff of a non-Opus main session to `opus-reviewer` ("where it is stricter, it wins").
  - `hooks/lib.mjs:217` `storeInfo(cwd)` gives `.store` (per-project store under `homedir()/.claude/orchestrator/`). Its `.main` is the primary checkout, not the session checkout. `homedir()` follows `HOME`/`USERPROFILE`; `hooks-smoke.mjs:54` relies on that.
  - `guard-edit.mjs:83-89` blocks main-session Edit/Write inside the project except `docs/prd/`. Paths in the store are outside the project.
  - Smoke tests live in `scripts/validate/*.mjs`, each exporting `run(ctx)`, registered in `scripts/validate.mjs:16`. CI runs `node scripts/validate.mjs` on ubuntu, macos and windows. CI runners have no git identity.

## Decisions
1. One plugin, command `/orchestrator:maestro`. It reuses the store, lessons, PRD flow and the Claude agents for fallback.
2. Roles: Codex writes code. Gemini reads, reviews and analyzes, with content passed on stdin and every tool denied. Claude plans, routes, verifies and decides.
3. Running `node "${CLAUDE_PLUGIN_ROOT}/scripts/maestro-run.mjs" codex ...` is a delegation: the script is the executor. Only inside `/orchestrator:maestro`, never from `orchestrator:on`. Every other main-session shell write stays forbidden. The script applies a worker's patch to the session's working tree only after its own checks pass, and the script itself refuses `codex`/`gemini` with `DISABLED` when the project is not enabled.
4. Partial work is discarded, not continued. The user had picked "commit per step, continue from the last commit", but the Codex sandbox cannot commit and the hard rules forbid commits, so v1 restarts the task with the next worker. The failed run's summary goes into the next brief.
5. Model and effort: profiles per task type, overridable globally, per project and per call. No model name is hard-coded except the `gemini-` prefix rule.
6. Review in maestro: Gemini reviews the combined diff. For a non-Opus main session, a Gemini review that returns `PASS` with no `high` finding replaces the `opus-reviewer` final-diff pass. The `opus-reviewer` PRD review rule for non-Opus sessions stays. `opus-reviewer` still reviews the final diff when Gemini fails, finds a `high` issue, or the work is large or risky (>5 tasks, schema/auth/security). Sonnet is the recommended main model.
7. Per-project opt-in, because code leaves the machine.
8. One Codex task at a time. No other agent edits the working tree while a Codex run is active.

## Data and files
- Global config: `~/.claude/orchestrator/maestro.json`. Project config: `<store>/maestro.json` (wins per key). Shape and defaults:
  ```json
  {
    "enabled": false,
    "codex": { "model": "", "effort": "high", "ignoreUserConfig": true, "windowsSandbox": "elevated", "timeoutMin": 30 },
    "gemini": { "model": "", "effort": "high", "timeoutMin": 10, "dailyRuns": 100, "maxPromptKB": 400 },
    "profiles": {
      "code": { "worker": "codex", "effort": "high" },
      "fix": { "worker": "codex", "effort": "medium" },
      "review": { "worker": "gemini", "effort": "high" },
      "read": { "worker": "gemini", "effort": "medium" }
    }
  }
  ```
  - `enabled` is read from the project config only. An empty `model` means automatic.
- Quota ledger (global, because quotas belong to the account): `~/.claude/orchestrator/maestro-quota.json`:
  `{"codex":{"blockedUntil":null,"lastError":""},"gemini":{"day":"YYYY-MM-DD","runs":0,"blockedUntil":null,"lastError":""}}`.
- Under `<store>/maestro/`: `briefs/<task>.md` (written by the main session with Write; outside the project, so the guard allows it), `runs/<runId>/` (`prompt.txt`, `events.jsonl` or `out.jsonl`, `stderr.txt`, `result.json`, `summary.json`, `patch.diff`), `wt/<runId>` (Codex worktree), `empty/<runId>/` (Gemini cwd, created fresh per run so overlapping runs do not share it, removed afterwards; "`empty/`" below means this folder).
- `runId` = `<YYYYMMDD-HHMMSS>-<worker>-<taskSlug>`, `taskSlug` matching `/^[a-z0-9][a-z0-9-]{0,40}$/`.
- Working tree ("main tree" below) = `git rev-parse --show-toplevel` of the script's cwd. `storeInfo` is used only for `.store`.

## Script contract: `scripts/maestro-run.mjs`
Node 18+, no dependencies, ESM. Every subcommand prints exactly one JSON line to stdout (the summary) and exits 0 when the summary was written, 1 on a usage error. Logs go to the run folder, never to stdout.
- Process spawning (all subcommands): argument arrays only, never `shell:true`, `windowsHide: true`. Resolve each binary from `MAESTRO_CODEX_BIN` / `MAESTRO_AGY_BIN`, else from `PATH` (on win32 try `.exe`, then `.cmd`). A `.js`/`.mjs` path, or a `.cmd` npm shim (parse it for its `node_modules/.../*.js` target), runs as `process.execPath [script, ...args]`. An `.exe` or a POSIX binary runs directly. A `.cmd` that cannot be parsed → `FAIL` "unsupported shim".
- `setup`: summary `{"cmd":"setup","node":"v22.13.1","git":true,"codex":{"installed":true,"version":"0.172.0","login":"ChatGPT"|"none"},"gemini":{"installed":true,"version":"1.5.16","models":["gemini-4-neon-high",...],"warnings":[...]},"enabled":false,"store":"<path>"}`.
  - Codex login: `codex login status`. Gemini models: `agy models`, ids starting with `gemini-` only.
  - Gemini warnings: read `~/.gemini/antigravity-cli/settings.json` if present; warn when `allowNonWorkspaceAccess` is true or `trustedWorkspaces` contains the home folder or a drive root. Only warn.
  - Missing CLI: `installed:false` plus an `install` hint (`npm install -g @openai/codex`; for Antigravity the page `https://antigravity.google/docs/cli/overview`).
- `enable` / `disable`: set `enabled` in the project config. Summary `{"cmd":"enable","enabled":true,"file":"<path>"}`.
- `codex --task <slug> --brief <file> --files <a,b,...> [--profile code|fix] [--effort <e>] [--model <m>] [--keep]`:
  1. Not enabled → `DISABLED`. `codex.blockedUntil` in the future → `QUOTA` (no CLI call).
  2. No `HEAD` → `FAIL` "repository has no commit". Snapshot the main tree: `base` = `git stash create` output, or `HEAD` when empty (changes no refs, index or files). The snapshot is NOT the `base` SHA (each `stash create` call returns a new SHA for the same content). It is: the working-tree id (`git rev-parse <base>^{tree}`), the index id (`git rev-parse <base>^2^{tree}` when `base` is a stash commit, else `git write-tree`), and the sorted untracked files (`git ls-files -o --exclude-standard -z`) with `git hash-object` of each. Step 7 recomputes it the same way (a fresh `stash create`) and compares the three parts.
  3. `git worktree prune`, then `git worktree add --detach <wt> <base>`.
  4. Run `codex exec` with: `-C <wt>`, `-s workspace-write`, `-c sandbox_workspace_write.exclude_tmpdir_env_var=true`, `-c sandbox_workspace_write.exclude_slash_tmp=true`, `-c sandbox_workspace_write.writable_roots=[]`, `-c sandbox_workspace_write.network_access=false`, `-c model_reasoning_effort="<effort>"`, `--ephemeral`, `--json`, `--output-schema <code schema>`, `-o <run>/result.json`, `-m <model>` only when set, `--ignore-user-config` when `codex.ignoreUserConfig`, on win32 `-c windows.sandbox="<codex.windowsSandbox>"` when that value is non-empty (live check: with `--ignore-user-config` the user's `[windows] sandbox = "elevated"` is dropped and every Codex shell command is "blocked by policy", so Codex changes nothing), prompt on stdin = the brief plus a fixed footer (allowed files, "do not commit", "do not touch other files", "reply with the JSON schema"). Effort and model: flag, then profile, then config.
  5. Kill after `timeoutMin` minutes → `TIMEOUT`.
  6. Classify (first match wins; the QUOTA rule applies only when the exit code is non-zero or no `turn.completed` event exists, because Codex logs retried rate limits as `error` events and still finishes): limit text in a `turn.failed` or `error` event (`/out of credits|usage limit|rate limit|quota|try again (in|at)/i`) → `QUOTA`; set `blockedUntil` = `Date.parse` of the text after `try again at` when valid, else now + 5 h; store `lastError`. Other non-zero exit → `FAIL`.
  7. Checks: the main-tree snapshot equals step 2 (else `VIOLATION`). Changed paths in the worktree from `git -C <wt> status --porcelain=v1 -z --untracked-files=all` (renames count both paths; compare forward-slash paths, case-insensitive on win32 and darwin) are a subset of `--files` (else `VIOLATION`, list `extraFiles`). Before this check run `git -C <wt> add -A` and drop paths whose content equals `base` (`git -C <wt> diff --cached --quiet <base> -- <path>` exits 0), so CRLF/`text=auto` checkout noise is not a violation. At least one path changed (else `FAIL`).
  8. Patch: `git -C <wt> add -A`, then `git -C <wt> diff --cached --binary <base>` into `patch.diff`. A patch with a symlink (`120000`), gitlink (`160000`) or mode-only change → `VIOLATION`.
  9. Apply with T1 `applyPatch`: `git apply --check --whitespace=nowarn <patch>` in the main tree. Non-zero → `CONFLICT`, nothing written. Else `git apply --whitespace=nowarn <patch>` (working tree only; never `--3way`, `--index` or `--cached`; new files stay untracked) → `PASS`.
  10. Always `git worktree remove --force <wt>` unless `--keep`.
  - Summary: `{"cmd":"codex","runId","status":"PASS|FAIL|QUOTA|TIMEOUT|VIOLATION|CONFLICT|DISABLED","files":[...],"extraFiles":[...],"selfReport":{...},"tokens":{"input":0,"output":0},"seconds":0,"error":"","log":"<run folder>"}`.
- `gemini --task <slug> --prompt <file> [--files <a,b>] [--diff <range>] [--profile review|read] [--effort <e>] [--model <m>]`:
  1. Not enabled → `DISABLED`. Blocked, or `runs >= dailyRuns` today (reset the counter when the day changes) → `QUOTA`.
  2. Inputs: each `--files` path must resolve (real path) inside the main tree and not be git-ignored (`git check-ignore`), else `FAIL`. `--diff` must match `/^[^-]/`; list changed paths with `git diff --name-only -z -M <range>` (old and new names), exclude secret paths from the diff with `:(exclude,literal)<p>` pathspecs, run `git diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ <range> -- . <excludes>` (user `diff.noprefix`/`mnemonicPrefix` must not defeat the filter) and append untracked files (`git ls-files -o --exclude-standard`) as file blocks.
  3. Build the prompt: the instructions file, then each file as `=== FILE: <path> ===` with numbered lines (`<n>\t<line>`), then the diff. Skip secret paths (by basename: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `.npmrc`, `.netrc`, `.pypirc`, `secrets.*`, `credentials*`), drop diff sections for those paths, list them in `skipped`. Over `maxPromptKB` → `FAIL` "prompt too large" (no truncation).
  4. Write the deny-all settings file to the run folder (seven deny rules, `"allowNonWorkspaceAccess": false`).
  5. Run `agy --print= --input-format stream-json --output-format stream-json --mode plan --settings <file> --json-schema <review schema> --print-timeout <timeoutMin*60>s --model <resolved>`, cwd = `empty/`, stdin = one `{"event":"user","message":{"role":"user","content":<prompt>}}` line. Kill after `timeoutMin*60+30` s → `TIMEOUT`.
  6. Classify from the last `{"event":"result"}` line and stderr: quota text (`/429|RESOURCE_EXHAUSTED|quota|rate limit/i`) in stderr or `result.error` → `QUOTA`, block until local midnight. Other non-zero exit or `result.status` `ERROR` → `FAIL`. `structured_output` missing or stderr matching `/no output produced|auto-denied/i` → `DENIED`. `empty/` not empty afterwards → `VIOLATION`. Else `PASS`. Count one run for every call that reached the CLI.
  - Summary: `{"cmd":"gemini","runId","status":"PASS|FAIL|QUOTA|DENIED|VIOLATION|TIMEOUT|DISABLED","model":"<id>","findings":[...],"skipped":[...],"tokens":{...},"seconds":0,"error":"","log":"..."}`.
- `status`: summary with the ledger, the config in effect, and the last 5 run summaries.
- Model resolution: `--model`, then profile, then config. Gemini values must start with `gemini-`, else `FAIL` "only gemini models are allowed". Empty Codex model: pass no `-m`. Empty Gemini model: the first `gemini-` id from `agy models` ending in `-<effort>`; else the first ending in `-high`; else the first `gemini-` id; none → `FAIL`. The chosen id is in the summary.
- Bundled JSON schemas in `scripts/maestro/`: `code-result.schema.json` (`status` done|failed|partial, `files_changed`, `tests`, `notes`) and `review-result.schema.json` (`status` done|failed, `findings`: array of `{file, line, severity: high|medium|low, issue}`, `notes`). Both `additionalProperties: false`, all keys required.

## Skill flow: `skills/maestro/SKILL.md`
Frontmatter: `name: maestro`, `disable-model-invocation: true`, `argument-hint: "[setup | enable | disable | status] [effort=low|medium|high] [--dry-run] <task description>"`.
Body under about 60 lines; routing, profiles and the status table go to `skills/maestro/workers.md`, read on demand.
- Base rules: every `orchestrator:on` rule applies (load it first if it is not in context). Maestro only changes who executes and who reviews. Decision 3 verbatim. Script path: `node "${CLAUDE_PLUGIN_ROOT}/scripts/maestro-run.mjs" <sub> ...`. Briefs and prompts: Write to `<store>/maestro/briefs/<task>.md`.
- Step 0: run `setup`. Missing CLI, no login, or not enabled → one short table of what is missing, the install or login commands (login is the user's step), ask once to enable for this project; stop.
- Steps 1-2: plan and PRD as in `orchestrator:on`. Each task gets a profile (`code`, `fix`, `review`, `read`). Code-writing tasks always go to Codex. Untracked files are invisible to Codex: never route a task whose input is an untracked file; say so and use the ladder.
- Show one routing table (task → worker → effort), then run without waiting (unless `--dry-run`, which stops here).
- Step 3: one Codex task at a time, with `run_in_background: true`; Gemini runs may overlap a Codex run. Do not launch edit agents while a Codex run is active. Never poll.
- Step 4 by summary status (full table in `workers.md`):
  - `PASS`: review `git diff` of the task files yourself, run the project check.
  - `FAIL` / `VIOLATION`: one retry with a fixed brief; then the `orchestrator:on` ladder (`haiku-coder`, then `sonnet-dev`), with the failed summary in the brief.
  - `QUOTA`: no retry on that worker; Codex tasks go to the ladder, Gemini tasks to the `Explore` agent (haiku). One line to the user.
  - `DENIED`: retry once with "you have no tools; answer from the content below"; then `Explore`.
  - `CONFLICT`: re-run once on the current tree; then `sonnet-dev`.
  - `TIMEOUT`: split the task smaller once; then the ladder.
  - `DISABLED`: back to Step 0.
- Step 5 review: `gemini --profile review --diff HEAD`. Read only the findings and the lines they point to, decide each. Decision 6 for `opus-reviewer`.
- Step 6 report: the `orchestrator:on` table plus a `worker` column (codex, gemini, haiku, sonnet), and a quota line, e.g. `Quota: codex 2 runs (227k in) · gemini 3 of 100 runs today`. The token line still lists Claude agents.

## Tasks (exclusive file ownership; strictly sequential T1 → T6)
| Task | Files | Executor | Verification |
|---|---|---|---|
| T1 lib | `scripts/maestro/lib.mjs`, `scripts/maestro/code-result.schema.json`, `scripts/maestro/review-result.schema.json` | haiku-coder | `node -e "import('./scripts/maestro/lib.mjs').then(m=>console.log(Object.keys(m).sort().join(',')))"` prints `applyPatch,buildReviewPrompt,classifyCodex,classifyGemini,denyAllSettings,isSecretPath,ledgerBlocked,loadConfig,parseResetTime,readLedger,resolveGeminiModel,saveProjectConfig,writeLedger` |
| T2 runner | `scripts/maestro-run.mjs` | sonnet-dev | `node scripts/maestro-run.mjs setup` prints one JSON line with `"cmd":"setup"` |
| T3 smoke | `scripts/validate/maestro-smoke.mjs`, `scripts/validate.mjs` | sonnet-dev | `node scripts/validate.mjs` ends with `OK:` |
| T4 skill | `skills/maestro/SKILL.md`, `skills/maestro/workers.md` | haiku-coder | `node scripts/validate.mjs` shows exactly two errors, `README.md ... /orchestrator:maestro` and `skills/help/SKILL.md: help misses /orchestrator:maestro`, and nothing else |
| T5 wiring | `scripts/validate/layout.mjs`, `skills/help/SKILL.md`, `hooks/rules.md`, `skills/on/SKILL.md`, `skills/on/non-opus.md` | haiku-coder | `node scripts/validate.mjs` shows only the README error |
| T6 release | `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | haiku-coder | `node scripts/validate.mjs` ends with `OK:` and `version 1.16.0` |

**T1 lib** (no side effects at import; I/O only in the load, save, ledger and `applyPatch` functions):
- `applyPatch({ tree, patchFile })` → `{ok, error}`: runs `git apply --check --whitespace=nowarn` then `git apply --whitespace=nowarn` with cwd = `tree` (argument arrays, no shell). Used by T2 step 9.
- `loadConfig({ home, store })` → defaults, then global, then project (deep merge per key; `enabled` from project only).
- `saveProjectConfig(store, patch)`; `readLedger(home)` / `writeLedger(home, ledger)` (atomic: temp file, then rename).
- `ledgerBlocked(ledger, worker, now, dailyRuns)` → `{blocked, reason, ledger}`; resets the Gemini day counter when `day` differs from the local date of `now`.
- `parseResetTime(message, now)` → `Date` (text after `try again at` if `Date.parse` is valid, else now + 5 h).
- `classifyCodex({ exitCode, events })` → `{status: 'ok'|'QUOTA'|'FAIL', error, tokens}`.
- `classifyGemini({ exitCode, result, stderr })` (`result` = the `result` object of the last result event, or null) → `{status: 'ok'|'QUOTA'|'DENIED'|'FAIL', findings, tokens, error}`.
- `isSecretPath(p)` (basename rules above); `buildReviewPrompt({ instructions, files: [{path, text}], diff, maxKB })` → `{prompt, skipped}`, throws `Error('prompt too large')`.
- `resolveGeminiModel({ wanted, effort, available })` → id, or throws.
- `denyAllSettings()` → the settings object.
- Acceptance examples (asserted by T3):
  - `classifyCodex({exitCode:1, events:[{type:'turn.failed',error:{message:'Your workspace is out of credits. Ask your workspace owner to refill in order to continue.'}}]}).status === 'QUOTA'`.
  - `classifyCodex({exitCode:0, events:[{type:'turn.completed',usage:{input_tokens:226681,output_tokens:1420}}]})` → `status:'ok'`, `tokens:{input:226681, output:1420}`.
  - `classifyCodex({exitCode:2, events:[]}).status === 'FAIL'`.
  - `classifyGemini({exitCode:0, result:{status:'SUCCESS', structured_output:null}, stderr:'jetski: no output produced — a tool required the "command" permission'}).status === 'DENIED'`.
  - `classifyGemini({exitCode:0, result:{status:'SUCCESS', structured_output:{status:'done', findings:[]}}, stderr:''}).status === 'ok'`.
  - `classifyGemini({exitCode:1, result:null, stderr:'Error: 429 RESOURCE_EXHAUSTED'}).status === 'QUOTA'`; `classifyGemini({exitCode:1, result:null, stderr:'flag needs an argument: -p'}).status === 'FAIL'`.
  - `isSecretPath('.env.local')`, `isSecretPath('keys/id_rsa')`, `isSecretPath('a/b/.npmrc')` are true; `isSecretPath('src/env.ts')` is false.
  - `resolveGeminiModel({wanted:'', effort:'high', available:['gemini-4-neon-high','gemini-4-neon-medium']}) === 'gemini-4-neon-high'`; with `effort:'low'` and the same list → `'gemini-4-neon-high'`; `wanted:'claude-opus-5-5-high'` throws.
  - `buildReviewPrompt` with file `a.js` = `"x\ny"` contains `=== FILE: a.js ===`, `1\tx` and `2\ty`; with file `.env` it lists `.env` in `skipped` and the prompt does not contain its text.
  - `parseResetTime('Usage limit reached. Try again at 2026-11-25T18:00:00Z.', now)` → that instant; `parseResetTime('out of credits', now)` → now + 5 h.

**T2 runner**: implements the script contract, importing T1 and `storeInfo` from `hooks/lib.mjs`.

**T3 smoke** (new module, registered in `scripts/validate.mjs:16` after `scriptsSmoke`):
- Temp dir as `HOME` and `USERPROFILE` for every spawned run (as `hooks-smoke.mjs:54`), so the store and ledger land in the temp dir. A git repo with one commit (`git -c user.name=t -c user.email=t@t commit`). The project enabled via `maestro-run.mjs enable` (cwd = repo).
- Mocks are `.mjs` files passed through `MAESTRO_CODEX_BIN` / `MAESTRO_AGY_BIN`; behavior from `MOCK_MODE`. Every mock writes a marker file when invoked.
  - codex `pass`: edits the allowed file in its `-C` dir, prints `turn.completed`, writes the `-o` file → `PASS`; the change is in the repo working tree; the index is unchanged.
  - Sequential: a second `pass` task on another file sees the first task's change in its worktree (mock asserts the first file's new content and exits 3 otherwise) → `PASS`.
  - codex `quota`: prints the out-of-credits event, exit 1 → `QUOTA` and `blockedUntil` set; a second call → `QUOTA` and no marker.
  - codex `extra`: also writes a file not in `--files` → `VIOLATION`, repo working tree byte-identical.
  - Dirty start: the repo has an uncommitted edit to file A before the run; the mock edits file B → `PASS`, and the worktree saw the edit to A (it is in `base`), A is byte-identical afterwards.
  - Edit during the run: the mock also changes file A in the repo working tree (path from env `MOCK_REPO`) while it runs → `VIOLATION`; A keeps the mock's edit (the user's state), nothing is applied, the index is unchanged.
  - `CONFLICT` is only reachable when the tree changes between the snapshot check and `git apply`; it is covered by a direct test of T1 `applyPatch` on a temp repo instead: a patch that does not apply returns `ok:false` and leaves the file byte-identical and the index unchanged.
  - agy `pass`: reads the stdin line, prints a result event with `structured_output` → `PASS` with findings.
  - agy `denied`: `structured_output:null` and the stderr text → `DENIED`.
  - Model guard: `--model claude-opus-5-5-high` → `FAIL` and no marker. Not enabled (`disable` first) → `DISABLED` and no marker.
- Run every T1 example as an assertion.
- Clean up in `finally`. Failures: `ctx.err('scripts/maestro-run.mjs', '<case>: expected X, got Y')`.

**T4 skill**: write per "Skill flow". `workers.md`: the routing table by task type, the profile table and override order (call flag > project > global > defaults), the status → action table, the secret-path list, and the privacy note (code is sent to OpenAI and Google; Codex sees every tracked file, including tracked secrets; opt-in per project).

**T5 wiring** (exact edits):
- `layout.mjs:185`: add `'maestro'` to the list.
- `skills/help/SKILL.md`: after the autopilot line add `- \`/orchestrator:maestro <task>\` - Codex writes, Gemini reviews, Claude verifies (\`setup\` first)`.
- `hooks/rules.md:2`: `(except \`orchestrator:team\` and \`orchestrator:autopilot\`, which extend it)` → `(except \`orchestrator:team\`, \`orchestrator:autopilot\` and \`orchestrator:maestro\`, which extend it)`.
- `hooks/rules.md:8`: `` `/orchestrator:team <task>` and `/orchestrator:autopilot <task>` `` → `` `/orchestrator:team <task>`, `/orchestrator:autopilot <task>` and `/orchestrator:maestro <task>` ``.
- `skills/on/SKILL.md:9`: `(except \`orchestrator:team\` and \`orchestrator:autopilot\`, which extend it when the user invokes them)` → `(except \`orchestrator:team\`, \`orchestrator:autopilot\` and \`orchestrator:maestro\`, which extend it when the user invokes them)`.
- `skills/on/non-opus.md`: append one line: `- In \`/orchestrator:maestro\`, a Gemini review with status PASS and no high finding replaces the opus-reviewer final-diff pass, also for the step 6 report check; the PRD review stays (see the maestro skill).`
- The context budget must still pass; report the new byte count.

**T6 release**: version 1.16.0 in both manifests. CHANGELOG: an English entry and a new `- Baru di 1.16.0: ...` line after the 1.15.2 line. README: replace the single `Baru di 1.15.2` line with the 1.16.0 line, list `/orchestrator:maestro` with the other commands, and add a short "Maestro" section (what it does; requirements: Codex CLI logged in with ChatGPT, Antigravity CLI logged in with Google AI Pro; `/orchestrator:maestro setup`; the privacy note; how to turn it off with `disable`). Indonesian line: "`/orchestrator:maestro` (opsional): Codex menulis kode, Gemini lewat Antigravity CLI membaca dan mereview tanpa akses tool, Claude merencanakan dan memverifikasi; hemat kuota Claude dengan memakai langganan ChatGPT dan Gemini."

## Acceptance (main session, after T6)
1. `node scripts/validate.mjs` → `OK: ... version 1.16.0`; report the context byte count.
2. Live check in a scratch git repo outside the plugin repo, with one CRLF file:
   - `setup` shows both CLIs logged in and the warning about the global Antigravity settings.
   - One `codex` run on a one-line task → `PASS`; the patch lands in the working tree; the CRLF file is not rewritten.
   - One `gemini --profile review` run → `PASS` with `structured_output` findings through stream-json (confirms `--json-schema` with stream-json).
   - The plugin repo is unchanged by the live check.
3. `git diff --stat` touches only the files in the task table plus this PRD.

## Risks
- CLI flags and output shapes change between versions. Mitigation: `setup` prints versions; small classifiers covered by smoke tests; the live check is repeated per release.
- `--ignore-user-config` may change auth or model defaults. Mitigation: config switch `codex.ignoreUserConfig`; the live check confirms login still works.
- Usage-limit texts differ. Mitigation: broad regex; any unknown non-zero exit is `FAIL`, which still falls back to the ladder.
- Gemini quota per run is unknown for Antigravity. Mitigation: a conservative `dailyRuns` and a block on the first quota error.
- Code privacy. Mitigation: per-project opt-in, secret paths and ignored files skipped for Gemini, the README note about tracked secrets and Codex.
- The user edits the same files during a run. Mitigation: snapshot compare gives `VIOLATION`; `git apply --check` gives `CONFLICT`; both leave the working tree and index as they were.
- `--json-schema` might not combine with stream-json. Mitigation: the live check; fallback is a prompt instruction to answer in the schema and parse `result.response` as JSON.

## Assumptions
- Users run Node 18+ and Git (already required by the plugin).
- `agy models` lists the recommended model first within each family.
- A Codex limit lasts 5 hours when the message has no reset time.
- One `agy` no-tools call uses about one request of the daily quota.
