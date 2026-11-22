# PRD: cycle 018 picks (IC-217, 207, 213, 208, 221, 212, 218, 219)

Repo root (R): C:\Users\bagus\OneDrive\Documents\Claude-Orchestrator-Skill\.claude\worktrees\orchestrator-skill-global-install-7d0718. Run every command from R. Branch: improve/cycle-018.

## Goal
Six small fixes so hooks stay quiet, safe and honest (plain-language long-session warning, safe Digest line, no empty "()", corrupt trim stats reported, eval inputs checked, fewer PowerShell cold starts). Then prep release 1.15.2, plus a docs-only first slice for the direct-edit lane.

## Non-goals
No tag, push or merge. No change to hooks/guard-edit.mjs. No batching of the per-repo PowerShell store-key checks in hooks-smoke (only the duplicate probe goes). No edits to BACKLOG.md, DASHBOARD.md or the cycle report (the main session does those).

## Shared verify helpers (standalone module runners, about 10-60 s)
- SMOKE_S: `node --input-type=module -e "import {createContext} from './scripts/validate/context.mjs'; import * as m from './scripts/validate/scripts-smoke.mjs'; const c=createContext(process.cwd()); await m.run(c); console.log(c.errors.join('\n')||'OK'); process.exit(c.errors.length?1:0)"`
- SMOKE_H: hooks-smoke needs `ctx.hooksJson`, which only layout.mjs sets. Use: `node --input-type=module -e "import {createContext} from './scripts/validate/context.mjs'; import * as l from './scripts/validate/layout.mjs'; import * as m from './scripts/validate/hooks-smoke.mjs'; const c=createContext(process.cwd()); await l.run(c); c.errors.length=0; await m.run(c); console.log(c.errors.join('\n')||'OK'); process.exit(c.errors.length?1:0)"`. (If layout.mjs exports a different entry than `run`, read it and adapt.)

## Tasks (T1, T2, T3, T4, T6 may run in parallel; T5 after T4; T7 last)

**T1 (IC-208 + IC-221). File: hooks/session-info.mjs**
- IC-221 (~line 98): `return \`${f.replace(/\.md$/, '')}${task ? \` (${task})\` : ''}${stale}\`;`. Example: `fix-login (stale 40d)`, not `fix-login () (stale 40d)`. A file with a Task line still prints `fix-login (Fix login bug)`.
- IC-208 (~lines 114-117): replace the Digest block with:
```js
// IC-208: the Digest line is a bash command; omit it when a path could expand ($, backtick) or break the quoting
const tp = typeof input?.transcript_path === 'string' ? fwd(input.transcript_path) : '';
const pluginRoot = fwd(dirname(dirname(fileURLToPath(import.meta.url))));
const unsafe = /["\r\n$`\\]/;
if (tp !== '' && !unsafe.test(tp) && !unsafe.test(pluginRoot)) lines.push(`Digest: node "${pluginRoot}/scripts/digest.mjs" "${tp}" --last 60`);
```
  Test after fwd() (a raw backslash test would drop the Digest line on every Windows session). Example: `C:/t/a$(id).jsonl` prints no Digest line; `C:\t\ok.jsonl` prints `Digest: node ".../scripts/digest.mjs" "C:/t/ok.jsonl" --last 60`. Keep the existing variable names of the file where they differ; read the block first.
- Verify payload: every run of the hook uses stdin `{cwd: <a temp dir>, transcript_path: ...}` (cwd is required, else the hook prints nothing), no session_id, and the temp HOME/USERPROFILE for all three checks (not only (c)).
- Verify: `node --check hooks/session-info.mjs`, then a node heredoc that (a) runs the hook with transcript_path `C:/t/a$(id).jsonl`, ``C:/t/a`id`.jsonl``, `C:/t/a"b.jsonl` and expects no `Digest:` in stdout, (b) runs with `C:\t\ok.jsonl` and expects `Digest: node`, (c) with a temporary HOME/USERPROFILE and ORCH_STALE_DAYS empty, writes checkpoints `no-task.md` (content `notes`) and `with-task.md` (content `Task: fix x`) into the store's checkpoints folder (store path read from the `Orchestrator store:` line) and expects `no-task` present, `no-task ()` absent, `with-task (fix x)` present. Exit 1 with FAIL on any miss, print OK otherwise.
- Guard: `grep -qF 'IC-208' hooks/session-info.mjs`

**T2 (IC-217). File: hooks/long-session.mjs (lines ~209-233)**
- Change `say` to `say(user, model)`: `systemMessage: user`, `additionalContext: \`${user} ${model} Tell the user in their language.\``. Only the user line is shown to the user; the orchestrator:resume steps go only into `model`.
- User line, repeat warning: `orchestrator: this session is very long (+260k context tokens; reminder 1 of 2). Every new message re-sends the whole conversation, so each turn costs more. A fresh session is cheaper; Claude can save your progress first so you can continue there.`
- User line, first warning: `orchestrator: this session is long (+130k context tokens[, N delegations]). Every new message re-sends the whole conversation, so a fresh session is cheaper; Claude can save your progress first so you can continue there.`
- User line, MB branch (long-session.mjs ~234, used when the transcript has no usage data; smoke expects `2 delegations`): `orchestrator: this session is long (${MB} MB, ${delegations} delegations). Every new message re-sends the whole conversation, so a fresh session is cheaper; Claude can save your progress first so you can continue there.` Keep the existing variable names/format of that branch. Both first-warning branches use the same model text.
- Model text: the current instructions with `<slug>` replaced by "the real checkpoint name (never a placeholder)".
- Hard constraints from scripts-smoke.mjs:164-181 and :66: the first-warning output must not contain the word "reminder" in either field; keep the tokens `+130k`, `reminder N of M` and `2 delegations`; the user line must not contain `<slug>`, `new-session card`, `orchestrator:resume` or `hand off`.
- Verify: `node --check hooks/long-session.mjs`, SMOKE_S, and a node heredoc that runs the hook with `ORCH_LONG_BYTES=1`, a temp ORCH_STATE_DIR and a temp transcript file, parses stdout, checks `systemMessage` has none of `<slug>`, `new-session card`, `orchestrator:resume`, `hand off`, `reminder` and that `hookSpecificOutput.additionalContext` contains `orchestrator:resume`.
- Guard: `grep -qF 'Every new message re-sends the whole conversation' hooks/long-session.mjs`

**T3 (IC-207). File: .github/workflows/eval.yml**
- Add as the FIRST step of job `eval`, before checkout:
```yaml
      - name: Validate inputs
        env:
          RUNS: ${{ inputs.runs || '1' }}
          MAX_COST: ${{ inputs.max_cost_usd || '3' }}
        run: |
          case "$RUNS" in ''|*[!0-9]*|0*) echo "::error::runs must be a whole number of at least 1, got '$RUNS'"; exit 1;; esac
          printf '%s' "$MAX_COST" | grep -Eq '^[0-9]+(\.[0-9]+)?$' || { echo "::error::max_cost_usd must be a number such as 3 or 2.5, got '$MAX_COST'"; exit 1; }
          awk -v c="$MAX_COST" 'BEGIN{exit !(c>0)}' || { echo "::error::max_cost_usd must be above 0"; exit 1; }
```
  Match the indentation of the existing steps (read the file first). Examples: `runs=abc` fails before checkout; `max_cost_usd=0` fails; `runs=2, max_cost_usd=2.5` passes.
- Verify: `grep -qF 'name: Validate inputs' .github/workflows/eval.yml`, plus a bash check (write the three shell lines to a temp script outside the repo, run it) with runs=abc, 0, 00 expecting exit 1; max_cost=0, abc expecting exit 1; runs=2 with max_cost=2.5 expecting exit 0. The final validate run covers the rest (no YAML parse exists).
- Guard: `grep -qF 'max_cost_usd must be a number' .github/workflows/eval.yml`

**T4 (IC-213). Files: hooks/trim-output.mjs, scripts/validate/hooks-smoke.mjs**
- compact() reuses sumFile: `const { n, saved, bad } = sumFile(file); return writeAtomic(file, JSON.stringify({ ts: Date.now(), n, saved, ...(bad ? { bad } : {}), summary: true }) + '\n');`. Keep the try/catch and the `return false`.
- sumFile: on a parsed line also do `bad += Number(r.bad) || 0`.
- format(): when n > 0 and bad > 0, append `, ${bad} unreadable lines skipped` before the suffix. Example: `TRIM: 1001 trims, ~2500 tokens saved (10000 bytes), 3 unreadable lines skipped`. Output with bad = 0 is unchanged.
- Smoke: add a test after the IC-159 test (~line 116): write a file over 64 KB named `trim-stats-bigbad.jsonl` (1000 valid padded records plus 3 `not json` lines), run the hook once with session_id `bigbad`, expect `--stats` to match `/^TRIM: 1001 trims, ~\d+ tokens saved \(\d+ bytes\), 3 unreadable lines skipped$/` and the file to have exactly 2 non-empty lines, the first parsing with `bad === 3`. Follow the helper style already used by the neighbouring tests.
- Verify: `node --check hooks/trim-output.mjs && node --check scripts/validate/hooks-smoke.mjs`, then SMOKE_H.
- Guard: `grep -qF 'unreadable lines skipped' hooks/trim-output.mjs`

**T5 (IC-212), after T4. File: scripts/validate/hooks-smoke.mjs (~682, ~723)**
- Add a module-level hoisted function (name `winPs`, not `psShell`: block 2 has a local `const psShell`, reusing that name would cause a TDZ error):
```js
// IC-212: probe PowerShell once per run (each cold start costs about 0.5-1 s on win32)
function winPs() {
  if (winPs.v === undefined) {
    const ok = (sh) => spawnSync(sh, ['-NoProfile', '-Command', 'exit 0']).status === 0;
    winPs.v = process.platform !== 'win32' ? null : ok('pwsh') ? 'pwsh' : ok('powershell') ? 'powershell' : null;
  }
  return winPs.v;
}
```
- Block 1: `const shell = winPs();`. Block 2: `const psShell = winPs();`. Delete both `psCheck` definitions. Keep the existing semantics of what each block did with the result (read both first).
- Verify: `node --check scripts/validate/hooks-smoke.mjs`, then SMOKE_H.
- Guard: `grep -qF 'function winPs' scripts/validate/hooks-smoke.mjs`

**T6 (IC-219, docs-only slice). File: docs/ideas/token-saving.md (item 13, ~line 48)**
Why docs-only: hooks/guard-edit.mjs denies every main-session Edit/Write outside docs/prd while orchestration is on, so a SKILL.md rule allowing direct edits would be dead; making it work means weakening the guard, which needs an owner decision.
Append a "First slice (cycle 018, proposal)" sub-bullet to item 13: scope (non-Opus main session; 1 file; at most 3 changed lines; old and new text known; the user explicitly says "edit directly"); mechanism options ((a) a one-shot hook allowance for that edit, (b) the existing `/orchestrator:off` for one edit); measure (compare the `plain-edit-ablation` and `on-small-edit` eval cases; gate: at most 60k tokens per run against 172k with the plugin and 51k without, evals/README.md:93, and pass rate unchanged); status: `owner decision; guard unchanged`.
- Verify: `grep -qF 'First slice' docs/ideas/token-saving.md`
- Guard: `grep -qF 'owner decision; guard unchanged' docs/ideas/token-saving.md`

**T7 (IC-218 release prep), LAST. Files: CHANGELOG.md, .claude-plugin/plugin.json, .claude-plugin/marketplace.json, README.md**
- CHANGELOG.md: rename `### Unreleased` (line 7) to `### 1.15.2`. It already holds a `Fixed:` and a `CI:` bullet (lines 8-9, from the earlier cycle 018 batch): append T1, T2, T4 and T5 to the existing Fixed bullet, T3 to the existing CI bullet, and add one `Docs:` bullet for T6. Do not create a second Fixed bullet. The Indonesian line and the README line must summarise all of 1.15.2 including the lines 8-9 items.
- In the Indonesian list insert `- Baru di 1.15.2: ...` directly after the `Juga di 1.15.1` line (~line 111); layout.mjs:283-292 requires ascending order.
- plugin.json:4 and marketplace.json:9: `"1.15.1"` to `"1.15.2"` (layout.mjs:22 requires them to match).
- README.md:138: replace the `Baru di 1.15.1: ...` line with `- Baru di 1.15.2: <one-line Indonesian summary>; daftar lengkap ada di [CHANGELOG.md](CHANGELOG.md).` (layout.mjs:219-221).
- Verify (final, about 3 min): `node scripts/validate.mjs 2>&1 | tail -n 15` must end with `OK: ... version 1.15.2`.
- Guard: `grep -qF '### 1.15.2' CHANGELOG.md`

## Acceptance tests
- Every task's verify and guard pass. The final `node scripts/validate.mjs` prints `OK ... version 1.15.2`.
- `git status` shows only the files listed above changed (plus the state files already modified). No tag, push or merge.

## Risks
- IC-208: raw-path backslash test would remove the Digest line on Windows; test after fwd().
- IC-217: the word "reminder" in the first warning breaks scripts-smoke.mjs:180; dropping `+Nk`, `reminder N of M` or `N delegations` breaks it too.
- IC-212: naming the function `psShell` causes a TDZ ReferenceError in block 2.
- IC-213: format() text changes when bad > 0; no existing smoke covers n > 0 with bad > 0.
- T4 and T5 both edit hooks-smoke.mjs: run in that order. T7 last (its bullets describe T1-T6).
- T1 checkpoint check uses a temporary HOME to stay environment independent.

## Assumptions
- `stateDir` honours ORCH_STATE_DIR (validate/context.mjs:74). SMOKE_H runs standalone; if it fails for context reasons use the final validate run. session-info prints `Orchestrator store: <path>` for a temporary HOME. No validator section checks eval.yml step order. No other file holds the 1.15.1 version string outside docs/improvement (plugin.json, marketplace.json, CHANGELOG.md, README.md only).
