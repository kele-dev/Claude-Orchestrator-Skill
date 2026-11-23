# PRD: improvement cycle 019 picks

Branch `improve/cycle-019`. One commit per item, in the order below. Each task: edit, verify, commit before the next task. Never run git checkout, restore or stash. Do not touch files outside a task's list. Lines cited are as of commit e580c0f. Revised after the opus-reviewer PRD review (8 fixes applied).

## Goal

Fix the 8 items the user picked in cycle 019: IC-225, IC-226, IC-179, IC-227, IC-228, IC-238, IC-229, IC-230.

## Non-goals

- IC-232 (PowerShell spawn timeout), IC-237 (dbg for an omitted Digest), IC-234 (dead backslash check; T6 removes it as a side effect), IC-231, IC-019: not picked.
- No version bump and no release; CHANGELOG gets no new entry except the T5 wording fix.

## Global verify

`node scripts/validate.mjs` must print `OK: 9 skills, 4 agents, version 1.15.2`. Run it after every task. The validator does not parse YAML, so workflow tasks are checked by reading the step and by the guard.

## Tasks

### T1 IC-225: first long-session warning is conditional (hooks/long-session.mjs)
- At hooks/long-session.mjs:231 the `tail` of the first warning starts unconditionally with "Write a checkpoint per orchestrator:resume and hand off ...". Hoist the second `say()` argument of the repeat warning at :213 (the string starting `If a multi-step task is in progress`) into one module-level `const HANDOFF = '...'` and use `HANDOFF` both at :213 and as `tail` at :231.
- Commit: `improve(ux): first long-session warning asks for a checkpoint only during a multi-step task (IC-225)`.
- Guard (fails before the edit, passes after): `grep -qF 'HANDOFF' hooks/long-session.mjs`. Also check by hand that `grep -c "'Write a checkpoint per orchestrator:resume and hand off" hooks/long-session.mjs` prints 0.

### T2 IC-226: validate model and changed_since, cap runs and cost (.github/workflows/eval.yml)
Replace the whole `Validate inputs` step (eval.yml:39-46) with exactly this (bash `[[ =~ ]]` matches the whole value, so a newline never passes; `grep` would test each line separately):

```yaml
      - name: Validate inputs
        env:
          RUNS: ${{ inputs.runs || '1' }}
          MAX_COST: ${{ inputs.max_cost_usd || '3' }}
          MODEL: ${{ inputs.model || 'claude-opus-5-5' }}
          BASE: ${{ inputs.changed_since }}
        run: |
          case "$RUNS" in ''|*[!0-9]*|0*) echo "::error::runs must be a whole number of at least 1, got '$RUNS'"; exit 1;; esac
          [ "$RUNS" -le 10 ] 2>/dev/null || { echo "::error::runs must be at most 10, got '$RUNS'"; exit 1; }
          re='^[0-9]+(\.[0-9]+)?$'
          [[ $MAX_COST =~ $re ]] || { echo "::error::max_cost_usd must be a number such as 3 or 2.5, got '$MAX_COST'"; exit 1; }
          awk -v c="$MAX_COST" 'BEGIN{exit !(c>0)}' || { echo "::error::max_cost_usd must be above 0"; exit 1; }
          awk -v c="$MAX_COST" 'BEGIN{exit !(c<=20)}' || { echo "::error::max_cost_usd must be at most 20, got '$MAX_COST'"; exit 1; }
          re='^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
          [[ $MODEL =~ $re ]] || { echo "::error::model must be a model id such as claude-opus-5-5, got '$MODEL'"; exit 1; }
          re='^[A-Za-z0-9][A-Za-z0-9._/~^@-]{0,199}$'
          [ -z "$BASE" ] || [[ $BASE =~ $re ]] || { echo "::error::changed_since must be a git ref such as main or HEAD~3, got '$BASE'"; exit 1; }
```
- Input descriptions: `runs` -> `"runs per case (1-10)"`; `max_cost_usd` -> `"cost cap in USD (above 0, at most 20)"`.
- Commit: `improve(security): eval workflow validates model and changed_since and caps runs and cost (IC-226)`.
- Guard: `grep -qF 'changed_since must be a git ref' .github/workflows/eval.yml`

### T3 IC-179: validate case and write outputs with printf (.github/workflows/eval.yml)
- In `Validate inputs` add the env line `CASE_IN: ${{ inputs.case || '*' }}` after `BASE`, and append these two lines at the end of its `run`:

```bash
          re='^[A-Za-z0-9*?][A-Za-z0-9*?._-]{0,99}$'
          [[ $CASE_IN =~ $re ]] || { echo "::error::case must be a case name or glob such as * or delegation-*, got '$CASE_IN'"; exit 1; }
```
- In `Select cases`, the no-BASE branch (eval.yml:63-66) becomes exactly:

```bash
          if [ -z "$BASE" ]; then
            printf 'case=%s\nskip=false\npartial=false\n' "$CASE_IN" >> "$out"
            exit 0
          fi
```
- Commit: `improve(security): eval workflow validates the case input before writing it to GITHUB_OUTPUT (IC-179)`.
- Guard: `grep -qF 'case must be a case name or glob' .github/workflows/eval.yml`

### T4 IC-227: trim stats keep recording after a failed compaction (hooks/trim-output.mjs)
- hooks/trim-output.mjs:100: today `!compact(file)` returns from record(), so a failed compaction silently stops all stats for the session. Change to `if (existsSync(file) && statSync(file).size > 65536 && !compact(file)) dbg(new Error('trim stats: compaction failed, appending instead'));` (no return; the append below still runs).
- In compact() (:111-113): `const ok = writeAtomic(...same args...); if (!ok) dbg(new Error('trim stats: compaction write failed')); return ok;`.
- Commit body notes the known limit: while the file stays over 64 KB each later trim retries compaction and re-reads it; accepted, since it needs an unwritable temp file.
- No new smoke test (forcing a failed compaction is hard; the 64 KB boundary smoke at hooks-smoke.mjs:133-141 must still pass).
- Commit: `improve(observability): trim stats keep recording and log when compaction fails (IC-227)`.
- Guard: `grep -qF 'compaction failed, appending instead' hooks/trim-output.mjs`

### T5 IC-228: one PowerShell spawn for the store-key cases (scripts/validate/hooks-smoke.mjs, README.md, CHANGELOG.md)
Section 8a4 (hooks-smoke.mjs:735-790):
- `check()` keeps its session-info and bash checks but no longer spawns PowerShell: when `psShell && block('powershell')`, push `{ name, dir, want }` to a `psQueue` array declared before `check`.
- Every case must keep its own folder state when all PowerShell runs happen at the end. Case "old path dir kept" tests an old path-key folder with NO remote-key folder, so give it its own repo: `const legacy5 = mkRepo('https://example.com/legacy/proj5.git');` with `fs.mkdirSync(path.join(shome, '.claude', 'orchestrator', pathKey(fwdSlash(legacy5))), { recursive: true });` and `check('old path dir kept', legacy5, base + pathKey(fwdSlash(legacy5)));`. Never create an `example-com-legacy-proj5` folder. Case "path dir wins when remote dir also exists" keeps the existing `legacy` repo: create its oldKey folder and the `example-com-legacy-proj` folder, then `check(...)` as today.
- After the six `check(...)` calls, still inside `try` (before `finally` removes dirs), when `psQueue.length`:

```js
    const script = psQueue.map((q) => `Set-Location -LiteralPath '${q.dir.replace(/'/g, "''")}'; & { ${block('powershell')} }; '---ORCH---'`).join('\n');
    const p = spawnSync(psShell, ['-NoProfile', '-Command', script], { encoding: 'utf8', env: { ...process.env, HOME: shome, USERPROFILE: shome } });
    const parts = (p.stdout ?? '').split('---ORCH---');
    if (p.status !== 0 || parts.length !== psQueue.length + 1) {
      err(refPath, `store key smoke: one PowerShell run for ${psQueue.length} cases exited ${p.status} with ${parts.length - 1} results`);
    } else {
      psQueue.forEach((q, i) => { if (norm(parts[i]) !== norm(q.want)) err(refPath, `store key smoke "${q.name}": powershell "${parts[i].trim()}" vs "${q.want}"`); });
    }
```
- Wording: README.md:138 and CHANGELOG.md:113 say `smoke Windows memanggil PowerShell sekali`; change both to `smoke Windows memeriksa PowerShell sekali per run dan menjalankan semua kasus store key dalam satu panggilan PowerShell`.
- Verify on this Windows machine with the global verify (the win32 branch runs here); the result must have no `store key smoke` errors.
- Commit: `improve(performance): store-key smoke runs PowerShell once for all cases (IC-228)`.
- Guard: `grep -qF -- '---ORCH---' scripts/validate/hooks-smoke.mjs`

### T6 IC-238: always print a usable Digest command (hooks/session-info.mjs)
- Design: quote both paths with POSIX single quotes, which make `$`, backtick, `"` and `\` literal. The Digest line is run with the Bash tool (Git Bash on Windows) only; `'\''` does not work in PowerShell. Add this helper exactly:

```js
const sq = (s) => `'${s.replace(/'/g, "'\\''")}'`;
```
- The line becomes `` `Digest: node ${sq(pluginRoot + '/scripts/digest.mjs')} ${sq(tp)} --last 60` ``.
- Omit the line only when either path contains CR or LF: replace the `unsafe` regex with `/[\r\n]/`. Update the IC-208 comment: single quotes make the command safe; only CR/LF omit it (IC-238).
- Examples: tp `/home/o'neil/t.jsonl` -> `'/home/o'\''neil/t.jsonl'`; tp `C:/Users/a$b/t.jsonl` -> `'C:/Users/a$b/t.jsonl'`.
- Run `grep -rn "Digest:" skills README.md docs/ideas` and update any literal example that still shows the double-quoted form (list the files in the report; if a hit is outside this task's file list, report it instead of editing).
- Commit: `improve(features): Digest line always printed with single-quoted paths (IC-238)`.
- Guard: `grep -qF 'IC-238' hooks/session-info.mjs`

### T7 IC-229: smoke tests for the Digest line and the checkpoint line (scripts/validate/hooks-smoke.mjs)
- Inside the session-info stale smoke block (hooks-smoke.mjs:288-310, where `sh`, `scwd`, `cd` exist), call the hook with `runHook` (already in ctx at hooks-smoke.mjs:22):

```js
const dig = (tp) => runHook('session-info.mjs', { hook_event_name: 'SessionStart', source: 'startup', cwd: scwd, transcript_path: tp }, { HOME: sh, USERPROFILE: sh, ORCH_STALE_DAYS: '' })?.stdout ?? '';
const p1 = '/tmp/a$b' + String.fromCharCode(96) + 'c"d/t.jsonl';
const p2 = "/tmp/o'neil/t.jsonl";
const p3 = '/tmp/x\ny/t.jsonl';
```
  1. `dig(p1)` has a line starting `Digest: node '` and contains `'` + p1 + `'`.
  2. `dig(p2)` contains `"'\\''"` (the JS string for `'\''`).
  3. `dig(p3)` has no `Digest:` line, while case 1 had one (paired allow/deny on the same code path).
  4. Write `notask.md` with content `# notes\n` in `cd`; `sess({})` output contains `notask` and does not contain `notask ()`.
- Every error message starts exactly with `smoke "session-info digest":` (cases 1-3) or `smoke "session-info checkpoint":` (case 4).
- Commit: `improve(tests): smoke tests for the Digest line and task-less checkpoints (IC-229)`.
- Guard: `grep -qF 'smoke "session-info digest":' scripts/validate/hooks-smoke.mjs`

### T8 IC-230: ORCH_STALE_DAYS=off turns stale marks and the delete offer off (hooks/session-info.mjs, skills/help/SKILL.md, README.md, scripts/validate/hooks-smoke.mjs)
- hooks/session-info.mjs:23-26: if `(process.env.ORCH_STALE_DAYS ?? '').trim().toLowerCase() === 'off'`, STALE_DAYS is `Infinity` (nothing counts as stale); other values keep today's rule.
- The offer (session-info.mjs:103) becomes `` `. Stale = untouched over ${STALE_DAYS} days: offer the user to delete them (ORCH_STALE_DAYS=off stops this note).` ``
- skills/help/SKILL.md:22: after `ORCH_STALE_DAYS` (default 14, ...) add `; off disables stale marks`. README.md:84 (the ORCH_STALE_DAYS mention): add the same `off` note in a few words.
- Smoke (hooks-smoke.mjs:303-307): add `const c = sess({ ORCH_STALE_DAYS: 'off' });` and a separate check with its own error `smoke "session-info stale off": expected no stale marker with ORCH_STALE_DAYS=off` when `c.includes('stale')`, plus require `a.includes('ORCH_STALE_DAYS=off stops this note')` in the existing condition.
- Commit: `improve(ux): ORCH_STALE_DAYS=off stops stale marks and the delete offer (IC-230)`.
- Guard: `grep -qF 'ORCH_STALE_DAYS=off stops this note' hooks/session-info.mjs`

## Risks

- T5: the PowerShell batch changes test structure; a wrong split gives false errors on win32 only. The global verify runs the win32 branch on this machine.
- T6 then T7 then T8 touch session-info and hooks-smoke in sequence; never in parallel.
- T2/T3: an over-strict regex would reject a valid glob or ref; case allows `* ? . _ -`, refs allow `. _ / ~ ^ @ -`.

## Assumptions

- The Digest line is a Bash-tool command (Git Bash on Windows), as the SessionStart rules print it for the Bash tool; POSIX single quoting is therefore correct.
- Limits 10 runs and 20 USD are generous for this repo's evals (defaults 1 run, 3 USD).
