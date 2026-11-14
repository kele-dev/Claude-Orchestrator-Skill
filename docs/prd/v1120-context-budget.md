# PRD: orchestrator v1.12.0, a size budget for the always-loaded context

## Goal
Make the context that loads on every task smaller, and stop it from growing back without anyone noticing.
- Split `skills/on/SKILL.md`. Rules that only some situations need go to files that are read on demand.
- Add a byte budget to the validator.
- Add a script that compares eval token totals with a baseline.
- Mark stale checkpoints at session start.
- Release as v1.12.0.

## Non-goals
- No rule is dropped or changes meaning.
- No hook or guard behavior changes, except the stale-checkpoint text in `session-info.mjs`.
- `hooks/rules.md` and step 6 REPORT are not edited.
- No eval run and no API spend.
- No cron trigger.
- No commit.
- No committed `evals/baseline.json` (decision: not now, see Decisions).

## Facts found (these constrain the design)
- On-disk sizes are CRLF: `SKILL.md` is 12,669 B, which is 12,588 B plus 81 `\r`. Any byte check must count LF-normalized text (`text.replace(/\r\n/g,'\n')`), or CI on Linux and Windows will disagree.
- `scripts/validate.mjs:660` treats every folder under `evals/` except `results` as an eval case. An `evals/fixtures/` folder would fail validation, so fixtures must live in temp dirs created by the validator.
- `validate.mjs:268-279` requires `on/SKILL.md` to keep the `budget=` pointer to the Budget bullet in `modes.md` (step 3). The Budget bullet stays in step 3, unchanged.
- `validate.mjs:231` requires `Baru di <manifest version>` in the README. Lines 282-294 require the `Baru di` lines in ascending order. So the manifests and README change in one task.
- Nothing in `hooks/*.mjs` or `evals/*/graders` greps SKILL.md text; graders check behavior in traces.
  - `hooks/rules.md:4` points to `orchestrator:on "Main-session model"`, so that heading must stay.
  - `skills/on/modes.md:13` points to the `SendMessage` rule in "token rules", so a core one-liner must stay.
- Eval result shape (from the trace-tokens smoke test at `validate.mjs:632`): `{startedAt, suite:{modelOverride, plugins:[{version}]}, cases:[{name, arms:{with|without:[{passed, costUsd, tracePath}]}}]}`.
  - Per-case token totals are not in the result file. They come from `analyzeTrace(traceText).sum` in `scripts/trace-tokens.mjs`.
  - That function is not exported, and the module runs `main()` at import (lines 219-225).
- `eval.yml` is only `workflow_dispatch`. The "Run eval" step writes `evals/ci-result.json`.

## Tasks (exclusive file ownership)
**T2: split `on/SKILL.md`** (sonnet-dev)
- Files: `skills/on/SKILL.md`, `skills/on/reference.md`, `skills/on/non-opus.md` (new).
- **`non-opus.md`:**
  - Title line: `# orchestrator:on for a main session that is NOT Opus-class (read at task start)`.
  - Body: old SKILL.md lines 16, 18, 19 and 21, verbatim. Old line 20 ("Ambiguous target") is NOT moved: it applies to every main model and stays in SKILL.md under "Main-session model", verbatim, after the 2-line stub (review finding 1).
- **SKILL.md, "## Main-session model":** replace the body with a 2-line stub:
  - `- Opus-class (Opus or at least as capable, e.g. Fable): flow as written; do not read non-opus.md.`
  - `- NOT Opus-class (Sonnet, Haiku, others; you know your model from your system prompt): read non-opus.md in this skill's folder before step 0; where it is stricter, it wins.`
- **SKILL.md, step 2:** add one bullet with the parts of old line 18 that apply to every main model:
  - the planner brief (task, constraints, files to read max ~8, the `Digest:` command);
  - the PRD stays in the conversation;
  - the main session saves it unchanged to `docs/prd/<slug>.md` with Write only when step 2 requires a file;
  - if that Write is denied, a haiku-coder `TYPE: CREATE`.
- **"## Token rules (all paths)", unchanged:** old lines 32, 33, 34, 35, 36, 37, 39, 40, 41 and 43.
- **"## Token rules (all paths)", rewritten as pointers:**
  - 38 becomes `Failing test/build: first check Known errors (reference.md "Token rules (situational)", read it before any TYPE: TRIAGE); if no match, ...`, with the rest as before.
  - 42 becomes a one-liner: `Housekeeping due at the same time: ONE haiku-coder brief as ordered typed steps; format in reference.md (read it when housekeeping is due).`
  - 44 becomes a one-liner: `Fix brief for a unit whose agent finished this session: send it to that agent with SendMessage (rules in reference.md, read before any fix round).`
  - Add a final pointer: `Situational rules (incremental review snapshot, brief order, full Known errors/housekeeping/reuse rules): reference.md "## Token rules (situational)"; read it before a second review group, a fix round, TRIAGE, or housekeeping.`
- **`reference.md`:** append `## Token rules (situational)` with old lines 42, 44, 45, 46 and 47, verbatim.
- **Keep:** every `## 0.` through `## 6.` heading and all step text outside the bullets above.
- **Verify** (run from the repo root):
  ```
  node scripts/validate.mjs 2>&1 | tail -n 5; node -e "const fs=require('fs');const r=p=>fs.readFileSync('skills/on/'+p,'utf8');const all=['SKILL.md','reference.md','non-opus.md'].map(r).join('\n');const k=['orch-review-index','SendMessage','learned-errors.md','Brief order','TRAILER:','# notrim','verify.sh','Turn economy','you apply its findings BEFORE','Ambiguous target','Haiku main session','Short path: only for 1 file','Digest:','TYPE: CREATE','## Main-session model'];const s=r('SKILL.md');const miss=k.filter(x=>!all.includes(x));const h=[0,1,2,3,4,5,6].filter(n=>!s.includes('\n## '+n+'. '));const o=require('child_process').execSync('git show HEAD:skills/on/SKILL.md',{encoding:'utf8'}).replace(/\r\n/g,'\n').split('\n');const A=all.replace(/\r\n/g,'\n');const lost=[16,18,19,20,21,42,44,45,46,47].filter(n=>!A.includes(o[n-1]));console.log(miss.length||h.length||lost.length||!s.includes('## Main-session model')?'FAIL '+miss+' | '+h+' | lost '+lost:'PASS',Buffer.byteLength(s.replace(/\r\n/g,'\n')))"
  ```
- **Accept:**
  - prints PASS;
  - the LF size of SKILL.md is at most 10,500 B (the verify also proves old lines 16, 18-21, 42, 44-47 survive verbatim in the three files);
  - the validator prints OK.

**T3: eval-compare** (sonnet-dev)
- Files: `scripts/eval-compare.mjs` (new), `scripts/trace-tokens.mjs`, `.github/workflows/eval.yml`, `evals/README.md`.
- **`trace-tokens.mjs`:** `export` `analyzeTrace` and `readText`. Wrap lines 219-225 in a "run as main" guard: compare `realpathSync(fileURLToPath(import.meta.url))` with `realpathSync(process.argv[1])` inside try/catch. The CLI output must stay byte-identical; the existing 8d smoke test proves it.
- **`eval-compare.mjs` CLI:** `node scripts/eval-compare.mjs <current.json> [baseline.json=evals/baseline.json] [--threshold 15] [--write <out.json>]`.
  - The current file is an eval result. For each case and arm, take the mean of `analyzeTrace(readText(run.tracePath)).sum` over readable runs. Round it to an integer.
  - The baseline is either baseline format `{"model":"<id>","plugin":"<ver>","cases":{"<case>":{"<arm>":<tokens>}}}` or another result file (`cases` is an array, computed the same way).
  - `--write` saves the current values in baseline format and exits 0, but exits 2 (writing nothing) when no case/arm had a readable run, so an empty baseline can never disable the gate (review finding 4).
  - When `run.tracePath` is unreadable, also try the same file name inside the result file's own folder; document this fallback in `evals/README.md`.
  - Output: one line per pair, `CMP: <case> <arm> base <n> now <m> <+x.x%> OK|OVER|NEW|SKIP`, then a summary line `EVAL-COMPARE: PASS|FAIL <k> over, threshold <t>%`.
  - The status is OVER when `now > base*(1+t/100)` (strictly greater). Example: base 100000, now 116000, t=15 gives +16.0% OVER, exit 1. Now 115000 gives OK.
  - NEW means the case is missing in the baseline. SKIP means there is no readable trace. Neither fails.
  - If both sides name a model and the models differ, print `EVAL-COMPARE: SKIP model <a> vs <b>` and exit 0.
  - Exit codes: 1 if any OVER; 2 if the current file or baseline is unreadable or the args are bad; otherwise 0.
- **`eval.yml`:**
  - Change the "Run eval" env to `${{ inputs.case || '*' }}`, `${{ inputs.runs || '1' }}`, `${{ inputs.model || 'claude-opus-5-5' }}` and `${{ inputs.max_cost_usd || '3' }}`. This lets a future schedule trigger run with the defaults.
  - Add a step after "Run eval" and before the upload step, with `if: hashFiles('evals/baseline.json') != ''`. It runs `node scripts/eval-compare.mjs evals/ci-result.json evals/baseline.json --threshold 15`.
  - No schedule trigger.
- **`evals/README.md`:** add a section covering:
  - how to create a baseline (`--write evals/baseline.json` from a downloaded `ci-result.json`, keeping the traces next to it, then commit);
  - the threshold flag;
  - the exit codes;
  - the one-line opt-in `schedule: [{cron: '0 3 * * 1'}]` under `on:`, with a cost warning that it spends the API key weekly and is the owner's decision.
- **Verify** (from the repo root):
  ```
  node -e "const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');const d=fs.mkdtempSync(path.join(os.tmpdir(),'orch-cmp-'));const tr=path.join(d,'t.jsonl');fs.writeFileSync(tr,[{type:'system',subtype:'init',model:'m'},{type:'result',num_turns:1,total_cost_usd:0.1,result:'x',modelUsage:{m:{inputTokens:1000,outputTokens:1000,cacheReadInputTokens:50000,cacheCreationInputTokens:48000}}}].map(x=>JSON.stringify(x)).join('\n')+'\n');const res=path.join(d,'r.json');fs.writeFileSync(res,JSON.stringify({suite:{modelOverride:'m'},cases:[{name:'c1',arms:{with:[{passed:true,tracePath:tr}]}}]}));const run=(...a)=>cp.spawnSync(process.execPath,['scripts/eval-compare.mjs',...a],{encoding:'utf8'});const b=path.join(d,'b.json');const w=run(res,'--write',b);const base=JSON.parse(fs.readFileSync(b,'utf8'));const n=base.cases.c1.with;const same=run(res,b);base.cases.c1.with=Math.round(n/1.2);fs.writeFileSync(b,JSON.stringify(base));const over=run(res,b);const loose=run(res,b,'--threshold','25');const bad=run(path.join(d,'none.json'),b);console.log(w.status===0&&n>0&&same.status===0&&over.status===1&&/OVER/.test(over.stdout)&&loose.status===0&&bad.status===2?'PASS':'FAIL',n,same.status,over.status,loose.status,bad.status);fs.rmSync(d,{recursive:true,force:true})"; node scripts/validate.mjs 2>&1 | tail -n 5
  ```
- **Accept:** prints PASS, and the validator prints OK (the 8d trace-tokens smoke test is unchanged).

**T4a: delete the stale checkpoint** (haiku-coder)
- File: outside the repo.
- Brief: `TYPE: RUN rm "C:/Users/bagus/.claude/orchestrator/c-users-bagus-onedrive-documents-claude-orchestrator-skill/checkpoints/plugin-eval-suite.md"`. Only that file.
- **Verify:** `test ! -e "<same path>" && echo PASS`.

**T4b: stale marker** (haiku-coder)
- File: `hooks/session-info.mjs`.
- At the top: `const STALE_DAYS_DEFAULT = 14;`. `STALE_DAYS` is `ORCH_STALE_DAYS` when it parses as a positive integer, otherwise 14.
- Keep the mtime in the map at lines 66-70 (return `{f, t}` through the sort).
- For each of the 5 shown checkpoints: if `Date.now() - t > STALE_DAYS*864e5`, append ` (stale ${Math.floor(age/864e5)}d)` after `(task)`.
- If any shown checkpoint is stale, append to the Checkpoints line: `. Stale = untouched over ${STALE_DAYS} days: offer the user to delete them.`
- The caps stay the same: 5 items, 80-char task text, and `+N more`.
- **Verify** (from the repo root; the stdin JSON is built with JSON.stringify):
  ```
  node -e "const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');const h=fs.mkdtempSync(path.join(os.tmpdir(),'orch-st-'));const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'orch-cwd-'));const run=(e)=>cp.spawnSync(process.execPath,['hooks/session-info.mjs'],{input:JSON.stringify({hook_event_name:'SessionStart',source:'startup',cwd}),encoding:'utf8',env:{...process.env,HOME:h,USERPROFILE:h,...e}}).stdout;const store=/Orchestrator store: (.*)/.exec(run({}))[1].trim();const d=path.join(store,'checkpoints');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'old.md'),'Task: old one\n');fs.writeFileSync(path.join(d,'new.md'),'Task: new one\n');const t=(Date.now()-20*864e5)/1000;fs.utimesSync(path.join(d,'old.md'),t,t);const a=run({}),b=run({ORCH_STALE_DAYS:'30'});console.log(a.includes('old (old one) (stale 20d)')&&a.includes('new (new one)')&&!a.includes('new (new one) (stale')&&a.includes('offer the user to delete')&&!b.includes('stale')?'PASS':'FAIL\n'+a+'\n'+b);fs.rmSync(h,{recursive:true,force:true});fs.rmSync(cwd,{recursive:true,force:true})"; node scripts/validate.mjs 2>&1 | tail -n 3
  ```
- **Accept:** prints PASS, and the validator prints OK.

**T5: docs and version** (haiku-coder)
- Files: `README.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `docs/ideas/token-saving.md`.
- Bump the version from 1.11.1 to 1.12.0 in both manifests.
- README English, "What's new" section: add 1.12.0 bullets covering the split (`non-opus.md`, situational token rules in `reference.md`), the validator size budget, `scripts/eval-compare.mjs` with the opt-in schedule, and stale checkpoints with `ORCH_STALE_DAYS`. If "Plugin contents" lists skill files or scripts, add the new ones there.
- README Indonesian: add `- Baru di 1.12.0: ...` directly after the 1.11.1 line (README.md:152).
- `docs/ideas/token-saving.md`: mark idea 16 "partially done (compare script; scheduled run is opt-in)" and idea 18 "done". Add `## Done in v1.12.0` with one line per task.
- **Verify:** `node scripts/validate.mjs 2>&1 | tail -n 3; grep -c "1.11.1" .claude-plugin/*.json; grep -c "Done in v1.12.0" docs/ideas/token-saving.md`.
- **Accept:** the validator prints OK with version 1.12.0, the manifest counts are 0, and the docs count is 1.

**T1: validator budget and smoke tests** (haiku-coder; sonnet-dev if the 40 KB file is too much)
- File: `scripts/validate.mjs`.
- **Measure first** (after T2): `node -e "const fs=require('fs');const b=p=>Buffer.byteLength(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'));console.log(b('hooks/rules.md')+b('skills/on/SKILL.md'))"`.
- **Budget check** in section 7, with the constant set to `Math.ceil((measured+1024)/100)*100`:
  ```
  // Always-loaded context budget (hooks/rules.md + skills/on/SKILL.md, LF-normalized bytes).
  // Raising it is a deliberate decision: state the release and reason in this comment.
  const CONTEXT_BUDGET_BYTES = <value>;
  ```
  - Helper: `const lfBytes = (t) => Buffer.byteLength(t.replace(/\r\n/g, '\n'))`.
  - On overflow: `err('skills/on/SKILL.md', \`always-loaded context ${n} B exceeds budget ${CONTEXT_BUDGET_BYTES} B (hooks/rules.md + skills/on/SKILL.md)\`)`.
- **More checks in section 7:**
  - add `skills/on/non-opus.md` to the required-files list (line 195);
  - add heading checks: `['skills/on/reference.md','## Token rules (situational)']`, `['skills/on/SKILL.md','## Main-session model']`, `['skills/on/SKILL.md','## Token rules']`, and `## 0.` through `## 6.` in `skills/on/SKILL.md`.
- **Smoke tests**, all in `fs.mkdtempSync` temp dirs and never under `evals/`:
  - `lfBytes('a\r\nb') === 3`;
  - session-info stale (port the T4b script into section 8, using the existing `runHook` with extraEnv `HOME`/`USERPROFILE`/`ORCH_STALE_DAYS`);
  - new section 8e: the eval-compare round trip (port the T3 script).
- **Verify:**
  - `node scripts/validate.mjs 2>&1 | tail -n 5` prints OK;
  - `grep -n "CONTEXT_BUDGET_BYTES" scripts/validate.mjs` shows the constant and the comment.
- **Accept:**
  - the validator prints OK;
  - the constant is at most `measured+1124`;
  - temporarily appending 2 KB to `rules.md` makes the validator fail with the budget message. That is a manual check on a scratch copy, not done in the repo.

## Order and parallelism
- Wave 1, run in parallel: T2, T3, T4a, T4b and T5. No files overlap. T5 only describes behavior. In wave 1 each task runs ONLY its own task-specific verify and ignores `node scripts/validate.mjs` errors that come from files owned by another task (they are half-edited); the full validator runs once after wave 1 finishes (review finding 3). An executor must never edit a file it does not own to silence such an error.
- Wave 2: T1, which needs the size after T2, the CLI from T3 and the output text from T4b.
- Then review: the main session reads the diff stat (about 11 files, so a `TYPE: SCAN`). `opus-reviewer` is recommended for T2, which changes rules. Finish with `node scripts/validate.mjs`.

## Risks
- **The split changes behavior even though the text is the same.** Rules that are only read on demand may be followed less often, for example Known errors before TRIAGE, or the non-Opus PRD review. The evals `on-learned-errors`, `on-sonnet-prd-save` and `on-sonnet-guardrails` cover this, but they cannot run on Windows. The owner should run them once on CI after merge (about $1-3).
- **Small rule duplication.** The general planner/PRD-save sentence ends up in both step 2 and `non-opus.md`. This is accepted so that neither audience loses it.
- **The run-as-main guard in `trace-tokens.mjs` could misfire** through symlinks or a different drive-letter case on Windows. Using realpath on both sides and the existing 8d smoke test cover this.
- **Unknown result fields.** If real `ci-result.json` runs have no `tracePath` or no readable traces in CI, every pair is SKIP and the step passes without checking anything. It prints SKIP lines, so the gap is visible.
- **Expected savings:** about 2.5-3 KB per task (estimate; T1 records the real figure).

## Assumptions
- `analyzeTrace(...).sum` is the per-run total tokens (from the final `modelUsage`, as the README describes) and is not null for a trace with an init line and a result line. The T3 verify checks `n>0`.
- `os.homedir()` follows `HOME` on POSIX and `USERPROFILE` on Windows. A temp cwd outside git makes `main=cwd`.
- The validator's skill checks (section 2) only check frontmatter in `SKILL.md`, so a new `non-opus.md` without frontmatter passes.
- The "budget" item in the brief means the existing step-3 Budget bullet. It is already a one-line pointer to `modes.md` and stays where it is.

## Amendments after the final review
- The T2 pointer for the situational rules triggers "when the first review group passes and more groups follow, and before a fix round, TRIAGE, or housekeeping" (the snapshot must be taken after group 1, so "before a second review group" was too late).
- eval-compare compares in integers (`now * 100 > base * (100 + threshold)`); base 100000 / now 115000 at 15% is OK. `--threshold` rejects missing or non-numeric values (exit 2).
- Validator smoke tests clear `ORCH_STALE_DAYS` by default.

## Decisions (open questions from the planner, answered by the orchestrator)
1. No baseline is committed now. No 1.12.0 measurements exist. The CI compare step stays inactive until the owner runs the eval once and commits the `--write` output.
2. `ORCH_STALE_DAYS=0` is not a "disable" value: 0 is invalid and falls back to 14.
