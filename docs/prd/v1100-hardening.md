# PRD: orchestrator v1.10.0 (evals, validator, budget script, review guard, learned-errors hits, docs)

Source: opus-planner output, saved by the main session. Note: the harness escaped angle-bracket control tags in the planner's report as `<\`; in this file `<\task-notification>` style text is restored to the real tag `<task-notification>` (it is only data for a regex/test fixture).

Repo: `/Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill` (branch `feat/budget-learned-errors-v1.9.0`, tree clean, `node scripts/validate.mjs` currently prints `OK: 8 skills, 4 agents, version 1.9.0`). Below, `R` means this path.

## Goal
Ship all 7 approved items as v1.10.0:
1. 3 new eval cases.
2. Validator checks for stop-name consistency and "Baru di" order, plus the README reorder.
3. A script that counts the budget, replacing model arithmetic.
4. A PreToolUse review guard, plus a clearer guard-edit message.
5. A softened cache claim, plus a token log in evals.
6. `hits:` tracking and least-hit pruning for learned-errors.
7. An English "What's new" section in the README.
The version bump comes last.

## Non-goals
- No changes to `.github/workflows/*`, `hooks/rules.md` (stays 2544 bytes before the terse-reply line commit; do not touch it), existing eval cases (`evals/on-small-edit`, `evals/on-sonnet-guardrails`, `evals/status-slash`), or existing validator checks (only additions).
- No new dependencies, no network, no commits or pushes.
- No budget support for plain `on` mode. No migration of existing learned-errors files (a missing `hits:` means 0).

## Batches and parallelism
- T1-T8 are mutually file-disjoint and depend on nothing. Suggested batches: B1 = {T1, T2, T3}; B2 = {T4, T5}; B3 = {T6, T7, T8}.
- B4 = {T9}: edits `scripts/validate.mjs` (T1 also edits it) and its smoke tests need T2 and T3. Runs after B1.
- B5 = {T10}: docs plus version bump. LAST batch only, after everything passes. The final `validate` runs after T9 and T10.

## Atomic tasks

### T1 - Validator: stop names and "Baru di" order; fix README order (item 2)
**Files:** `scripts/validate.mjs`, `README.md`

**Stop-name check** (new section after section 7):
- Read `skills/on/modes.md` and collect stop names with three regexes:
  - `/\bstatus ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g`
  - `/\b([A-Z]{4,}(?: [A-Z]{4,})*) stop\b/g`
  - `/\bis ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g`
- Exclude `PASS` (a unit status, not a stop). Add a code comment saying so.
- Today this yields BUDGET, DECISION NEEDED and BLOCKED.
- Autopilot rule: each name must appear as a bullet `^- <NAME>:` inside the section of `skills/autopilot/SKILL.md` that starts at the `## ` heading containing `STOP` and ends at the next `## `.
- Resume rule: each name except DONE must match `\b<NAME>\b` inside the `## When to write` section of `skills/resume/SKILL.md`.
- Error text, exactly: `stop status "<NAME>" from skills/on/modes.md missing in <section heading>`. A missing section is an error too. Skip silently if a file is absent.

**README order check:**
- Parse lines matching `^- Baru di (\d+(?:\.\d+){1,2})\b` and compare numerically as `[maj, min, patch || 0]` (1.10 > 1.9).
- Versions must be strictly ascending. Ignore `Juga di` lines.
- Error: `README.md:<line>: "Baru di <v>" must come after "Baru di <prev>" (ascending order)`.

**README fix:**
- Rule (from the file: oldest first from 1.4 to 1.8.0): ascending, new lines appended last.
- Move lines without changing their text, to this order: 1.4, 1.5, 1.6, 1.6.1, 1.7.0, Juga di 1.7.0, 1.7.1, 1.7.2, 1.7.3, 1.7.4, 1.8.0, 1.8.1, 1.8.2, 1.8.3, 1.8.4, 1.8.5, 1.9.0. `- Mode orkestrasi aktif otomatis...` stays last.
- In the Maintainers section, add one sentence: append the new `Baru di X.Y.Z` line after the newest one (ascending; the validator fails otherwise).

**Verify:** AT-1, AT-2.

### T2 - Budget script plus a shared transcript parser (item 3)
**Files:** `scripts/transcript.mjs` (new), `scripts/digest.mjs`, `scripts/budget.mjs` (new), `skills/on/modes.md`

**`scripts/transcript.mjs`** exports:
- `readTranscript(file, from = 0)`: returns `string[]` lines, throws if unreadable. When `from > 0`, start at that byte offset and drop the partial first line unless the byte before the offset is `\n`. `from` past the end gives an empty list.
- `*entries(lines, types = null)`: yields parsed objects. Skips blank lines, unparsable lines and lines with `isSidechain === true`. When `types` is given, first check the substring `"type":"<t>"` and then that `o.type` is in `types`.
- `textOf(content)`: moved from digest.

**`scripts/digest.mjs`:** import these from `./transcript.mjs`. Behaviour and output stay byte-identical: the existing validator digest smoke tests must still pass, it keeps its own `isMeta` skip, and an unreadable file still gives exit 1 with the same stderr.

**`scripts/budget.mjs`:**
- Usage: `node scripts/budget.mjs <transcript.jsonl> [--mark] [--from <bytes>] [--limit <N>k]`. `--limit` accepts `50k`, `50K`, `50` and `--limit=50k`; an invalid value is ignored. Always exits 0.
- Before `JSON.parse`, skip any line containing none of `tool_use`, `toolUseResult` or `subagent_tokens`. Passes:
  1. Launches: tool_use ids of `Agent` or `Task` in non-sidechain assistant entries.
  2. Results: an entry with a `toolUseResult` object and a `tool_result` whose `tool_use_id` is a launch. Map the launch to `toolUseResult.agentId`, or to the tool_use id if none. If `toolUseResult.totalTokens` is a number, record it.
  3. Notifications: for any non-sidechain line containing `subagent_tokens`, run `/<task-notification>([\s\S]*?)<\/task-notification>/g` on the raw line. In each block take `<task-id>X</task-id>` and `<subagent_tokens>N</subagent_tokens>`.
  4. For each id keep the MAX value (the same notification appears in queue-operation, user, attachment and api-request-blob entries, and the same id repeats after SendMessage).
  5. Ignore ids that do not map to a launch in range.
- Sum known launches; the rest count as "without usage".
- Output is exactly one line. X = `Math.round(sum/1000)`. `agent` when count is 1, else `agents`.
  - All known: `BUDGET: spent <X>k (<A> agents)`
  - Some unknown: `BUDGET: spent <X>k+? (<A> agents, <U> without usage)`
  - Launches but none known: `BUDGET: spent ? (<A> agents, <U> without usage)`
  - Unreadable file: `BUDGET: spent ? (transcript unreadable)`
  - `--mark` prints `BUDGET: mark <file size in bytes>` (or `mark 0` if unreadable).
  - `--limit` appends ` of <N>k: OVER` when the exact sum >= N*1000; otherwise ` of <N>k: UNKNOWN` if any agent lacks usage, else ` of <N>k: UNDER`.

**`skills/on/modes.md`:** replace the Budget bullet (line 10) with this text, adjusting wording only:
> Budget (`budget=<N>k`, optional): count with the budget script, never by adding notices yourself. Command: the session-start `Digest:` command with `scripts/budget.mjs` in place of `scripts/digest.mjs` and without `--last`. Before the first group run it once with `--mark` and keep the printed offset; after each group's verify and fix loop run it with `--from <offset> --limit <N>k`; it prints one line `BUDGET: spent <X>k (...) of <N>k: UNDER|OVER|UNKNOWN` (main session excluded; agents without usage show `?`, never guessed). On OVER start no new group; write a checkpoint per `orchestrator:resume` (a stop that is not DONE), run the final project-level check once on what passed, and report status BUDGET with the script's line and the groups not run. No `Digest:` line, or the script fails: sum the completion notices instead (`?` for a notice without usage). The opus-reviewer final pass and COMMIT of passed groups still apply if otherwise due. A resumed run takes a new mark and counts against the full budget in its arguments. Without the argument there is no budget.
- Keep the literal phrase `status BUDGET`.
- Do not add any other `status <CAPS>`, `<CAPS> stop` or `is <CAPS>` phrases (T1's regexes parse this file).

**Verify:** AT-3.

### T3 - Review guard hook plus guard-edit message (item 4)
**Files:** `hooks/guard-review.mjs` (new), `hooks/hooks.json`, `hooks/guard-edit.mjs`

**`hooks/guard-review.mjs`:**
- Read stdin like `guard-edit.mjs`. Wrap everything in try/catch. If allowed or on any error, print nothing and exit 0.
- Deny only when all hold: `process.env.ORCH_GUARD !== 'off'`; `tool_input.subagent_type === 'orchestrator:opus-reviewer'`; `tool_input.prompt` is a string; some extracted path does not exist.
- Extract paths with: `/(?<![A-Za-z0-9_.\/\\:-])(?:\/|\.{1,2}\/)?(?:[A-Za-z0-9_.-]+[\/\\])*docs[\/\\]prd[\/\\][A-Za-z0-9_.-]+\.md(?![A-Za-z0-9_.\/-])/g` (never matches URLs, globs, `<slug>` placeholders or Windows drive paths, so those fail open).
- Existence check: absolute path: `fs.existsSync(p)`. Relative path: exists if found under `path.resolve(input.cwd, p)` or under `path.resolve(process.env.CLAUDE_PROJECT_DIR, p)` when set. No string `cwd` and no env var: allow.
- On deny print:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"orchestrator: <p> does not exist yet. Save the PRD first (the main session may Write to docs/prd/), confirm with ls, then launch orchestrator:opus-reviewer."}}
```

**`hooks/hooks.json`:** add a second PreToolUse entry:
```json
{"matcher":"Agent|Task","hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-review.mjs\"","timeout":10}]}
```

**`hooks/guard-edit.mjs` line 18:** the reason becomes:
> orchestrator: the main session must not edit project files. Delegate this change to orchestrator:haiku-coder. docs/prd/ is writable: the main session may Write/Edit PRD files there itself (e.g. a PRD from orchestrator:opus-planner). /orchestrator:off disables this guard.

**Verify:** AT-4.

### T4 - Cache claim plus token log (item 5)
**Files:** `skills/on/SKILL.md`, `evals/README.md`, `docs/ideas/token-saving.md`

**`skills/on/SKILL.md` line ~45.** Replace the bullet starting `- Cache-friendly briefs:` with:
> `- Brief order: fixed parts first (TYPE, report format, relevant lesson lines, verification command), variable parts last (files, PRD excerpt, error, diff). This may help prompt caching; no token saving has been measured yet.`

**`evals/README.md`:**
- Add a `## Token log per plugin version` section: rows are filled from `evals/ci-result.json` after a run; a token-saving claim in skills or the README needs a before and an after row for the same case and model.
- Table columns: `Plugin version | Date | Case | Main model | Runs | Total tokens | Cost USD | Notes`. First row: `1.9.0 | - | - | - | - | not measured | - | baseline missing`.
- Under "Run on GitHub", add notes for the new cases: `autopilot-budget-stop` and `on-learned-errors` need Bash; `on-learned-errors` writes a lesson into the runner's `$HOME/.claude/orchestrator/<key>/` (delete after a local run); run `on-sonnet-prd-save` with `-f model=claude-sonnet-5-5`; reviewer-after-PRD ordering is enforced by `hooks/guard-review.mjs` and smoke-tested in `scripts/validate.mjs`, it cannot be graded with `tool_used` or `regex`.

**`docs/ideas/token-saving.md` status line:** mark 6 as "implemented v1.9.0, saving not measured (see evals/README.md token log)".

**Verify:**
```bash
cd "$R" && grep -q 'no token saving has been measured' skills/on/SKILL.md && ! grep -q 'shared prefix is cached' skills/on/SKILL.md && grep -q '^## Token log per plugin version' evals/README.md && grep -q 'not measured' docs/ideas/token-saving.md && node scripts/validate.mjs | tail -1
```

### T5 - learned-errors hits (item 6)
**Files:** `skills/learn/SKILL.md`, `skills/learn/reference.md`

- `SKILL.md` (Known errors section): entry format becomes `- [YYYY-MM-DD] ERROR: <key> -> CAUSE: <cause> -> FIX: <fix>. Source: <few words>. hits: <N>` followed by: (`hits:` optional; missing means 0).
- Keep "max 15 entries". Replace the "(prune oldest first, since each entry is short and self-contained)" wording with: when full, prune the entry with the fewest hits first (missing = 0); ties: oldest date first.
- Append: when a matched entry's fix passed, add 1 to its `hits:` (or add `hits: 1`) in the end-of-task save delegation; this update does not count toward the 3-lessons limit.
- `reference.md`, `prune` bullet: append: `learned-errors` over 15 entries: remove the fewest-hit entries first (missing `hits:` = 0; ties: oldest date).

**Verify:**
```bash
cd "$R" && grep -q 'hits: <N>' skills/learn/SKILL.md && grep -q 'fewest hits first' skills/learn/SKILL.md && grep -q 'max 15 entries' skills/learn/SKILL.md && ! grep -q 'oldest first, since' skills/learn/SKILL.md && grep -q 'fewest-hit' skills/learn/reference.md && node scripts/validate.mjs | tail -1
```

### T6 - Eval `autopilot-budget-stop` (item 1a)
**Files:** `evals/autopilot-budget-stop/{case.yaml, prompt.md, fixture.sh, graders/budget-status.md, graders/checkpoint.md}`

- `case.yaml`: like `evals/on-small-edit/case.yaml`, with `name: autopilot-budget-stop`, `tags: [autopilot, budget]` and `scaffold_script: fixture.sh`.
- `fixture.sh`: `git init`, user config, a `README.md` with one line, commit `init`.
- `prompt.md` frontmatter: `runs: 1`, `max_turns: 60`, `timeout_seconds: 1200`, `allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]`. Body:
  > /orchestrator:autopilot budget=1k Do this in three batches, one file per batch, in order: 1) create notes/one.txt containing the line one; 2) create notes/two.txt containing the line two; 3) create notes/three.txt containing the line three.
- `graders/budget-status.md`: `type: regex`, `pattern: '\bBUDGET\b'`. Body: the run stopped with status BUDGET.
- `graders/checkpoint.md`: `type: tool_used`, `tool: Agent`, `input_match: 'checkpoints/'`, `min: 1`. Body: a checkpoint was written via a delegation.

**Verify:**
```bash
cd "$R" && d=evals/autopilot-budget-stop && grep -q 'name: autopilot-budget-stop' $d/case.yaml && bash -n $d/fixture.sh && [ "$(grep -l '^type: ' $d/graders/*.md | wc -l | tr -d ' ')" = 2 ] && t=$(mktemp -d) && (cd "$t" && bash "$R/$d/fixture.sh" && git log --oneline | grep -q init) && rm -rf "$t" && echo T6 PASS
```

### T7 - Eval `on-learned-errors` (item 1b)
**Files:** `evals/on-learned-errors/{case.yaml, prompt.md, fixture.sh, graders/no-triage.md, graders/fixed.md}`

**`fixture.sh`:**
- `git init` plus config.
- `test.js`: if `config/defaults.json` is missing, `console.error('ORCH_E42: defaults config missing'); process.exit(1)`. Otherwise assert `JSON.parse(...).mode === 'safe'` and print ok.
- `package.json` with `"test": "node test.js"`. Commit `init`.
- Then `store=$(<the bash Store command from skills/learn/reference.md, verbatim>)`, `mkdir -p "$store/lessons"`, and write `$store/lessons/learned-errors.md`:
```
---
name: learned-errors
description: Verified error patterns of this project (error text, cause, fix). Read when a test/build fails, before TRIAGE.
---

# Learned: errors

- [2026-01-01] ERROR: ORCH_E42 defaults config missing -> CAUSE: config/defaults.json is not generated and must be created by hand -> FIX: create config/defaults.json with {"mode": "safe"}. Source: eval fixture. hits: 1
```

**`prompt.md`:** same frontmatter as T6 but `max_turns: 40`, `timeout_seconds: 900`. Body: `/orchestrator:on npm test fails. Make it pass; do not change test.js.`

**Graders:**
- `graders/no-triage.md`: `type: tool_used`, `tool: Agent`, `input_match: 'TYPE:\s*TRIAGE'`, `min: 0`, `max: 0`.
- `graders/fixed.md`: `type: regex`, `pattern: '"mode"\s*:\s*"safe"'`, `target: {source: file, path: config/defaults.json}`.

**Verify:**
```bash
cd "$R" && d=evals/on-learned-errors && bash -n $d/fixture.sh && t=$(mktemp -d) && mkdir "$t/repo" "$t/home" && (cd "$t/repo" && HOME="$t/home" bash "$R/$d/fixture.sh") && ls "$t"/home/.claude/orchestrator/*/lessons/learned-errors.md && (cd "$t/repo" && ! node test.js 2>&1 | grep -q x; node test.js 2>&1 | grep -q ORCH_E42) && [ "$(grep -l '^type: ' $d/graders/*.md | wc -l | tr -d ' ')" = 2 ] && rm -rf "$t" && echo T7 PASS
```

### T8 - Eval `on-sonnet-prd-save` (item 1c)
**Files:** `evals/on-sonnet-prd-save/{case.yaml, prompt.md, fixture.sh, graders/prd-write.md, graders/no-create-prd.md}`

- `fixture.sh`: a copy of `evals/on-sonnet-guardrails/fixture.sh`.
- `prompt.md`: frontmatter as in on-sonnet-guardrails (`model: claude-sonnet-5-5`, `max_turns: 60`, `timeout_seconds: 1200`). Body: `/orchestrator:on Add a function mul(a, b) to src/math.js, export it, and add an assertion that mul(2, 3) is 6 to test.js.`
- `graders/prd-write.md`: `type: tool_used`, `tool: Write`, `input_match: '"file_path"\s*:\s*"[^"]*docs/prd/[^"]+\.md"'`, `min: 1`. Body: the main session saved the planner PRD itself; reviewer ordering is enforced by `hooks/guard-review.mjs` and is not gradable here.
- `graders/no-create-prd.md`: `type: tool_used`, `tool: Agent`, `input_match: 'TYPE:\s*CREATE[^"]*docs/prd/'`, `min: 0`, `max: 0`.

**Verify:** same pattern as T6 with `d=evals/on-sonnet-prd-save`.

### T9 - Validator smoke tests for the new script and hook (B4; depends on T1-T3)
**File:** `scripts/validate.mjs`

**budget smoke** (inside the existing tmp block):
- Generate the AT-3 `known` and `mixed` transcripts.
- Assert exact trimmed stdout: `known` → `BUDGET: spent 46k (2 agents)`; `mixed --limit 40k` → `... of 40k: OVER`; a missing file → `BUDGET: spent ? (transcript unreadable)` with exit 0; `--mark`, then append, then `--from`.
- On failure: `err('scripts/budget.mjs', 'smoke "<name>": expected "<want>", got "<got>"')`.

**guard-review smoke:** tmp dir with `docs/prd/exists.md`; `cwd` = tmp dir, env `CLAUDE_PROJECT_DIR: tmp`.
- Missing path: deny. Existing path: empty output. `orchestrator:haiku-coder` with a missing path: empty. Glob or URL only: empty. `ORCH_GUARD=off`: empty. Raw stdin `not json` (spawnSync directly): empty, exit 0.

**guard-edit smoke:** the case `guard agents/x.md main thread denied` must also contain `docs/prd/ is writable`.

Do not remove or relax any existing check.

**Verify:**
```bash
cd "$R" && node scripts/validate.mjs | tail -1 | grep -q '^OK' && t=$(mktemp -d) && cp -R . "$t/a" && printf 'process.stdin.resume();\n' > "$t/a/hooks/guard-review.mjs" && node scripts/validate.mjs "$t/a" | grep -q 'guard-review' && cp -R . "$t/b" && perl -pi -e 's/BUDGET: spent/BUDGET spent/g' "$t/b/scripts/budget.mjs" && node scripts/validate.mjs "$t/b" | grep -q 'scripts/budget.mjs' && rm -rf "$t" && echo T9 PASS
```

### T10 - Docs plus version bump (item 7; LAST batch only)
**Files:** `README.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**README:**
1. Add a new `## What's new (1.9.0 and later)` section (English) before `## Plugin contents`, with `### 1.10.0` and `### 1.9.0` bullets.
   - 1.10.0: `scripts/budget.mjs` and its output line; the review guard (Agent/Task PreToolUse; denies `orchestrator:opus-reviewer` when its prompt names a missing `docs/prd/*.md`; fails open; `ORCH_GUARD=off`); guard-edit message now says `docs/prd/` is writable; `learned-errors` `hits:` and least-hit pruning (max 15); validator stop-name and "Baru di" order checks; 3 new evals and the token log; the cache claim is softened.
   - 1.9.0: `budget=<N>k` (team/autopilot, status BUDGET plus a checkpoint); the `learned-errors` lesson (checked before TRIAGE); brief order.
2. Under `### Hooks`, add a "Review guard" bullet. In `## Plugin contents`, add the review guard to the hooks line.
3. Append `- Baru di 1.10.0: ...` (Indonesian, summary of the same items) directly after the 1.9.0 line.

**Manifests:** `"version": "1.10.0"` in both files.

**Verify:**
```bash
cd "$R" && node scripts/validate.mjs | tail -1 | grep -q 'version 1.10.0' && grep -q "^## What's new" README.md && grep -q '^- Baru di 1.10.0' README.md && grep -q 'guard-review' README.md && grep -q 'budget.mjs' README.md && echo T10 PASS
```

## Acceptance tests
(Executors run each task's Verify command; the main session runs these.)

**AT-1** (stop names):
```bash
cd "$R" && t=$(mktemp -d) && cp -R . "$t/a" && perl -ni -e 'print unless /^- BUDGET:/' "$t/a/skills/autopilot/SKILL.md" && node scripts/validate.mjs "$t/a" | grep -q 'stop status "BUDGET"' && cp -R . "$t/b" && perl -pi -e 's/ BUDGET,//' "$t/b/skills/resume/SKILL.md" && node scripts/validate.mjs "$t/b" | grep -q 'stop status "BUDGET"' && rm -rf "$t" && echo AT1 PASS
```

**AT-2** (order, numeric semver):
```bash
cd "$R" && node scripts/validate.mjs | tail -1 | grep -q '^OK' && t=$(mktemp -d) && cp -R . "$t/c" && perl -0pi -e 's/(- Baru di 1\.8\.1:[^\n]*\n)(- Baru di 1\.8\.2:[^\n]*\n)/$2$1/' "$t/c/README.md" && node scripts/validate.mjs "$t/c" | grep -q 'ascending' && cp -R . "$t/d" && perl -pi -e 's/^(- Baru di 1\.10\.0:.*)$/$1\n- Baru di 1.11.0: x/' "$t/d/README.md" && node scripts/validate.mjs "$t/d" | tail -1 | grep -q '^OK' && perl -pi -e 's/^(- Baru di 1\.11\.0:.*)$/$1\n- Baru di 1.8.9: y/' "$t/d/README.md" && node scripts/validate.mjs "$t/d" | grep -q 'ascending' && rm -rf "$t" && echo AT2 PASS
```

**AT-3** (budget script):
```bash
cd "$R" && t=$(mktemp -d) && node -e '
const fs=require("fs"),d=process.argv[1],J=JSON.stringify;
const launch=(id,name)=>J({type:"assistant",message:{id:"m"+id,content:[{type:"tool_use",id,name:name||"Agent",input:{subagent_type:"orchestrator:haiku-coder",prompt:"p"}}]}});
const result=(id,tur)=>J({type:"user",message:{content:[{type:"tool_result",tool_use_id:id,content:"r"}]},toolUseResult:tur});
const block=(a,n)=>"<task-notification>\n<task-id>"+a+"</task-id>\n<status>completed</status>\n<usage><subagent_tokens>"+n+"</subagent_tokens><tool_uses>3</tool_uses></usage>\n</task-notification>";
const qop=(a,n)=>J({type:"queue-operation",operation:"enqueue",content:block(a,n)});
const unote=(a,n)=>J({type:"user",message:{content:block(a,n)}});
const A=[launch("tu1"),result("tu1",{status:"async_launched",agentId:"ag1"}),qop("ag1",12000),unote("ag1",12000),launch("tu2","Task"),result("tu2",{status:"completed",agentId:"ag2",totalTokens:30500}),J({type:"assistant",isSidechain:true,message:{content:[{type:"tool_use",id:"tu9",name:"Agent",input:{}}]}}),unote("agX",99999),unote("ag1",15000)];
const U=[launch("tu3"),result("tu3",{status:"async_launched",agentId:"ag3"})];
const w=(f,L)=>fs.writeFileSync(d+"/"+f,L.length?L.join("\n")+"\n":"");
w("known.jsonl",A);w("mixed.jsonl",A.concat(U));w("unknown.jsonl",U);w("empty.jsonl",[]);w("m.jsonl",A);' "$t" && B="node scripts/budget.mjs" && chk(){ [ "$1" = "$2" ] || { echo "FAIL: got [$1] want [$2]"; return 1; }; } && \
chk "$($B "$t/known.jsonl")" "BUDGET: spent 46k (2 agents)" && \
chk "$($B "$t/known.jsonl" --limit 50k)" "BUDGET: spent 46k (2 agents) of 50k: UNDER" && \
chk "$($B "$t/known.jsonl" --limit 45k)" "BUDGET: spent 46k (2 agents) of 45k: OVER" && \
chk "$($B "$t/mixed.jsonl")" "BUDGET: spent 46k+? (3 agents, 1 without usage)" && \
chk "$($B "$t/mixed.jsonl" --limit 40k)" "BUDGET: spent 46k+? (3 agents, 1 without usage) of 40k: OVER" && \
chk "$($B "$t/mixed.jsonl" --limit 50k)" "BUDGET: spent 46k+? (3 agents, 1 without usage) of 50k: UNKNOWN" && \
chk "$($B "$t/unknown.jsonl")" "BUDGET: spent ? (1 agent, 1 without usage)" && \
chk "$($B "$t/empty.jsonl")" "BUDGET: spent 0k (0 agents)" && \
chk "$($B "$t/none.jsonl"; echo "exit=$?")" "BUDGET: spent ? (transcript unreadable)
exit=0" && \
chk "$($B "$t/known.jsonl" --from 5)" "BUDGET: spent 31k (1 agent)" && \
s=$(wc -c < "$t/m.jsonl" | tr -d ' ') && chk "$($B "$t/m.jsonl" --mark)" "BUDGET: mark $s" && \
cat "$t/unknown.jsonl" >> "$t/m.jsonl" && chk "$($B "$t/m.jsonl" --from "$s")" "BUDGET: spent ? (1 agent, 1 without usage)" && \
grep -q 'status BUDGET' skills/on/modes.md && grep -q 'scripts/budget.mjs' skills/on/modes.md && node scripts/validate.mjs | tail -1 | grep -q '^OK' && rm -rf "$t" && echo AT3 PASS
```

**AT-4** (review guard and guard-edit):
```bash
cd "$R" && H=hooks/guard-review.mjs && p(){ printf '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"%s","prompt":"%s"},"cwd":"%s"}' "$1" "$2" "$R"; } && export CLAUDE_PROJECT_DIR="$R" ORCH_GUARD= && \
p orchestrator:opus-reviewer 'Review docs/prd/no-such-prd-xyz.md' | node $H | grep -q '"permissionDecision":"deny"' && \
p orchestrator:opus-reviewer 'Review /tmp/nowhere-xyz/docs/prd/a.md' | node $H | grep -q '"permissionDecision":"deny"' && \
[ -z "$(p orchestrator:opus-reviewer 'Review docs/prd/model-agnostic-v180.md' | node $H)" ] && \
[ -z "$(p orchestrator:haiku-coder 'Create docs/prd/no-such-prd-xyz.md' | node $H)" ] && \
[ -z "$(p orchestrator:opus-reviewer 'Review docs/prd/*.md and https://x.io/docs/prd/no.md and docs/prd/<slug>.md' | node $H)" ] && \
[ -z "$(p orchestrator:opus-reviewer 'Review docs/prd/no-such-prd-xyz.md' | ORCH_GUARD=off node $H)" ] && \
out=$(printf 'not json' | node $H); rc=$?; [ $rc -eq 0 ] && [ -z "$out" ] && \
node -e 'const h=JSON.parse(require("fs").readFileSync("hooks/hooks.json","utf8")).hooks.PreToolUse;process.exit(h.some(e=>e.matcher==="Agent|Task"&&JSON.stringify(e).includes("guard-review.mjs"))?0:1)' && \
printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"%s/agents/x.md"},"transcript_path":"/nonexistent-xyz.jsonl","cwd":"%s"}' "$R" "$R" | node hooks/guard-edit.mjs | grep -q 'docs/prd/ is writable' && \
node scripts/validate.mjs | tail -1 | grep -q '^OK' && echo AT4 PASS
```

**AT-5:** the T4, T5, T6, T7 and T8 verify commands print PASS (or the validator OK line for T4/T5).

**AT-6:** the T9 verify prints `T9 PASS`.

**AT-7** (final, after T10): `node scripts/validate.mjs` prints version 1.10.0; `.github`, `hooks/rules.md`, `evals/on-small-edit`, `evals/on-sonnet-guardrails`, `evals/status-slash` unchanged (`git diff --quiet -- <those>`); then re-run AT-1 through AT-4.

**Review:** more than 5 tasks, so the final diff goes to `orchestrator:opus-reviewer` with this PRD.

## Risks
- Budget semantics: max per agentId assumes `subagent_tokens` is cumulative across SendMessage re-runs. If per run, the script undercounts.
- `toolUseResult.totalTokens` was not seen in any local transcript; secondary source; absent means `?` (fails open).
- `--mark` offset must be carried by the main session; if lost, overcount (safe failure).
- Review guard false denies when a reviewer prompt names a deleted/planned PRD path; workaround `ORCH_GUARD=off`. Windows paths and URLs fail open.
- Validator stop-name regexes depend on modes.md wording; T2's text must not add new matches.
- digest.mjs refactor could regress digest output; covered by existing digest smoke tests.
- T1 parses modes.md while T2 rewrites it: validate the combined tree after B1.
- Eval runs make real model calls under `--max-cost-usd`.

## Cannot be verified without running Claude
- All three evals (T6-T8) grader results; whether autopilot stops at `budget=1k`, TRIAGE is skipped, a Sonnet main session uses Write to `docs/prd/`.
- Whether Claude Code fires PreToolUse for the `Agent` tool with `tool_input.subagent_type/prompt`, and whether the deny reason reaches the model.
- Whether the main session runs `budget.mjs` with `--mark`/`--from` instead of arithmetic; whether the SessionStart `Digest:` line is present in eval sessions.
- Reviewer-after-PRD ordering is enforced only by the hook (deterministic smoke test), not gradable by the known grader types.

## Assumptions
- The eval schema accepts `Bash` in `allowed_tools`, `tool_used` with `input_match` plus `min: 0`/`max: 0`, and a `regex` grader without `target` checks the final output (as `status-slash` does).
- The `on-learned-errors` fixture can write to `$HOME/.claude/orchestrator/<key>/`, the same HOME the session-info hook reads.
- Tool name is `Agent`; the matcher also covers `Task` for older versions.
- `ORCH_GUARD=off` is the only bypass for the review guard.
- "Changelog lines" means the README `Baru di` lines; there is no CHANGELOG file.
- `cp -R .`, `perl` and `mktemp` are available (macOS).
