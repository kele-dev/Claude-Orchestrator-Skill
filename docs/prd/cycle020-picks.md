# PRD: improvement cycle 020 picks

Branch `improve/cycle-020`, one commit per item, message `improve(<dimension>): <title>`. Sequential tasks (T4 to T6 share `scripts/validate/hooks-smoke.mjs`). Every task ends with `node scripts/validate.mjs` printing `OK: 9 skills, 4 agents, version 1.15.2` (about 1 minute; run with `2>&1 | tail -n 5`). Reviewed by opus-reviewer: 9 fixes applied before execution.

Goal profile: token-saving plugin, Node 18+, no dependencies, hooks must never crash or block the session. Non-goals: version bump, CHANGELOG, any file not listed per task, other harnesses.

## T1 IC-243 + IC-211 (Code quality + Performance): validator sections isolated and timed
Files: `scripts/validate.mjs` only.
- Parsing: `const only = process.argv[2] === '--only' ? (process.argv[3] ?? '') : null; const rootArg = only === null ? process.argv[2] : process.argv[4];` then `const root = path.resolve(rootArg ?? path.join(scriptDir, '..'))`.
- Section map: `{ layout, 'hooks-smoke': hooksSmoke, 'scripts-smoke': scriptsSmoke, evals }`. No flag runs all four in that order (the CI default). `--only <name>` with a name other than `layout` runs layout first (it fills `ctx.hooksJson`, `skillDirs`, `agentFiles`, `version`), then the named section. An unknown name prints `unknown section <name>` and exits 1.
- Wrap each `await mod.run(ctx)` in try/catch. On a throw call `ctx.err('scripts/validate.mjs', \`section <name> crashed: ${e?.message ?? e}\`)` and continue, so the normal summary prints and the exit code stays 1.
- Time each section with `performance.now()`. Print one line `sections: layout 12.3 s, hooks-smoke 30.1 s, ...` (values `(ms / 1000).toFixed(1)`, joined by `, `, every section that ran) after the ERROR lines and immediately before the final line. The final `OK: ...` and `FAILED: ...` lines stay byte-identical to today.
- Verify: `node scripts/validate.mjs 2>&1 | tail -n 4` ends with the unchanged OK line; `node scripts/validate.mjs --only layout 2>&1 | tail -n 2`, `--only hooks-smoke` and `--only evals` (each `2>&1 | tail -n 2`) end with an OK line; `node scripts/validate.mjs --only nope; echo $?` prints the message and 1.
- Guard: `grep -qF -- '--only' scripts/validate.mjs`.

## T2 IC-244 (UX): define the checkpoint delete action
Files: `skills/resume/SKILL.md` only (do not touch its `## When to write` section).
- In section `## Finishing` add one bullet (max 2 lines, same style): when the user asks to delete a checkpoint (including after the SessionStart stale note), confirm the file name once, then delete only that file in `<store>` with one `TYPE: RUN` brief naming its absolute path and `rm "<path>"`; never delete legacy checkpoints. The bullet must contain the word `stale`.
- Verify: validate OK.
- Guard: `grep -qF 'stale' skills/resume/SKILL.md`.

## T3 IC-242 (Performance): remove restated rules from skills/on/SKILL.md
Files: `skills/on/SKILL.md` only.
- Remove exactly: the parenthetical ` (a hook blocks Edit/Write; shell writes such as `sed -i` or `>` are equally forbidden)` in the Forbidden bullet (line 13; same text is `hooks/rules.md` line 3), and the sentence `The flow is mandatory. ` on line 9. Change nothing else. Expected saving about 110 bytes; at least 100 bytes. Report `wc -c skills/on/SKILL.md` before and after.
- Verify: validate OK (14.7 KB budget gate in `scripts/validate/layout.mjs`); `grep -c 'equally forbidden' skills/on/SKILL.md` and `grep -c 'flow is mandatory' skills/on/SKILL.md` both print 0.
- Guard: `grep -qF 'Forbidden: Edit/Write on code' skills/on/SKILL.md`.

## T4 IC-237 (Observability): trace when the Digest line is omitted
Files: `hooks/session-info.mjs`, `scripts/validate/hooks-smoke.mjs`.
- In `hooks/session-info.mjs` at the Digest push (near line 118): when `tp !== ''` but the line is omitted because of CR/LF in `tp` or `pluginRoot`, call `dbg(new Error('digest omitted: CR/LF in path'))` (read `makeDbg` in hooks/lib.mjs first). The message must not contain the path (`fmt` only redacts quoted strings, hooks/lib.mjs:8). No change when the line is printed.
- In hooks-smoke after line 320 (existing newline case `p3`/`d3`) add `const d3d = runHook('session-info.mjs', { hook_event_name: 'SessionStart', source: 'startup', cwd: scwd, transcript_path: p3 }, { HOME: sh, USERPROFILE: sh, ORCH_STALE_DAYS: '', ORCH_DEBUG: '1', TMPDIR: sh, TMP: sh, TEMP: sh });` and call `err('hooks/session-info.mjs', 'smoke "session-info digest trace": ...')` unless `d3d.status === 0`, `!d3d.stdout.includes('Digest:')` and `d3d.stderr.includes('digest omitted')` (TMP/TEMP point at the fake home so the real debug log is not written). Adapt variable names to what exists at those lines.
- Guard: `grep -qF 'digest omitted' hooks/session-info.mjs`.

## T5 IC-241 (Stability): readStdin never throws and never hangs on an error
Files: `hooks/lib.mjs`, `scripts/validate/hooks-smoke.mjs`.
- `readStdin(cb)` becomes: `let raw = ''; let done = false; const finish = (s) => { if (done) return; done = true; try { cb(s); } catch { /* fail open */ } };` then `setEncoding('utf8')`, `'data'` appends, `'end'` calls `finish(raw)`, `'error'` calls `finish('')`. No timer.
- Smoke test right after the invalid-stdin loop (around line 390), in the array form used at hooks-smoke.mjs:158: define `const url = pathToFileURL(path.join(root, 'hooks', 'lib.mjs')).href` locally (import `pathToFileURL` from 'url' if not imported) and run `spawnSync(process.execPath, ['--input-type=module', '-e', \`import { readStdin } from ${JSON.stringify(url)}; readStdin(() => { throw new Error('x'); });\`], { input: 'x', encoding: 'utf8' })`; expect status 0 and empty stderr; repeat with `input: ''`.
- Guard: `grep -qF "'error'" hooks/lib.mjs`.

## T6 IC-232 (Stability): timeouts on PowerShell spawns in the smoke
Files: `scripts/validate/hooks-smoke.mjs`.
- Add `timeout: 30000` to the three PowerShell spawns: the probe in `winPs()` (line 12; keep its `status === 0` meaning, so a timeout means "shell not available") and the spawns near lines 728 and 803. At 728 and 803 the existing `err` calls already fire on a failed run; append `${p.error ? ' (' + p.error.code + ')' : ''}` (use the local result variable name) to both messages.
- Verify: validate OK on this win32 host (these spawns run); `grep -c "timeout: 30000" scripts/validate/hooks-smoke.mjs` is at least 3.
- Guard: `grep -qF 'timeout: 30000' scripts/validate/hooks-smoke.mjs`.

## Acceptance
All six: validate OK with the unchanged final line, git diff touches only the listed files, no test weakened. Risks: T1 must keep `node scripts/validate.mjs <root>` working (CI calls it with no argument); T3 must keep validator-asserted phrases.
