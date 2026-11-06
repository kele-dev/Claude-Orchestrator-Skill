# PRD: orchestrator v1.11.0 (measure: startup cost, long-session reminders, honest graders, new evals, budget for plain `on`)

Source: opus-planner output, saved by the main session as `docs/prd/v1110-measure.md`.

Paths used below:
- `R` = `/Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill`. Branch `feat/budget-learned-errors-v1.9.0`. The tree has uncommitted v1.10.1 changes (budget.mjs `auto`, PRD-rule alignment, manifests at 1.10.1). Build on them and do not revert or commit them. `node scripts/validate.mjs` currently prints `OK: 8 skills, 4 agents, version 1.10.1`.
- `W` = `/private/tmp/claude-501/orch-v1110`. This is the scratch dir for verify temp files, eval JSON and copies. Every `rm` below uses a literal path, never a shell variable.
- `CLAUDE` = `"$HOME/Library/Application Support/Claude/claude-code/2.1.317/91184d3d9ba3/claude.app/Contents/MacOS/claude"` (quoted; `claude` is not on PATH).

## Evidence already collected (planner, read-only)
Four eval traces from today still exist in `/private/tmp/e-*/out/trace.jsonl` (temporary; they may disappear).

**Per-delegation fixed cost is about 10k.** First-turn context of each subagent (input + cache_creation + cache_read):
- `haiku-coder`: 10,567 / 10,626 / 10,713 / 10,783 / 11,027 / 11,090 tokens, for briefs of 256 to 1,297 chars.
- `opus-planner`: 9,283. `opus-reviewer`: 9,194.
- A shared cached prefix of exactly 6,258 tokens appears in every `haiku-coder` start (Claude Code system prompt plus tool schemas).
- Completion totals: 10,850 / 10,914 for 1 tool use; 11.9k to 13.3k for 3 to 5 tool uses.
- Conclusion: about 10.5k of a tiny `haiku-coder` task is fixed. Only `agents/haiku-coder.md` (3,560 B, about 0.9k tokens) is under plugin control. User CLAUDE.md and memory add more in real sessions, which explains the 10-20k seen earlier.

**Eval CLI 2.1.317 grader schema** (from the bundled code):
- Grader types: `regex` (`target: last_message|trace|files|{source: file, path}`, `match: contains|not_contains|count:N`), `tool_used`, `tool_order` (`before`/`after` = `{tool, input_match}`), `file_exists` (created-files list only), `llm`, `baseline`. Any grader accepts `arm: with-only|both`.

**`tool_used` / `tool_order` count subagent tool calls too.** The run parser (`Np`) collects `tool_use` blocks from every `assistant` trace entry and has no `parent_tool_use_id` filter. Consequences:
- `on-sonnet-prd-save/graders/prd-write.md` cannot tell the main session from a subagent.
- `on-small-edit/graders/no-main-edit.md` and `on-sonnet-guardrails/graders/no-main-edit.md` (`tool: Edit, max: 0`) would FAIL whenever haiku-coder uses Edit. In trace e-XMWfPL, a similar task had 2 subagent Edits. This is a flag only; see Open decisions. R1 confirms it.

**Checkpoint grader false pass.** In run 2026-11-05T15:25:49 (trace e-6G2yNH), `checkpoint` passed ("Agent called 1x"). But the checkpoint agent got `permission_denied` for both Bash mkdir and Write, because `<store>` = `$HOME/.claude/orchestrator/<key>/` is outside the run dir. The final message admitted "Checkpoint not saved".

**`budget.mjs` in the eval sandbox printed "transcript unreadable"**, so the session summed notices instead.

**Trace text facts** (verified on all 4 traces, both as raw JSONL and as a one-line `JSON.stringify` array):
- Write success: `File created successfully at: <path>`.
- Edit success: `The file <path> has been updated successfully.`
- Main-session entries carry `"parent_tool_use_id":null` after `message`.
- tool_use blocks contain `"caller":{"type":"direct"}`.

## Goal
Ship v1.11.0:
1. Measure per-delegation fixed cost against task cost (script plus eval), and document it.
2. Repeated long-session reminders at higher thresholds, with a checkpoint suggestion.
3. Evals that measure plugin value, with real token-log rows.
4. Honest graders: checkpoint write success, main-thread PRD save, reviewer-after-PRD ordering.
5. New evals: team lanes, learned-errors write path, terse-reply effect.
6. `budget=<N>k` for plain `/orchestrator:on`.

## Non-goals
- No change to `hooks/rules.md` (stays at most 2,544 bytes), `.github/workflows/*`, or the agent files.
- No change to existing eval cases `on-small-edit`, `on-sonnet-guardrails`, `status-slash`, `on-learned-errors` (not touched at all).
- No removal or relaxing of any validator check (additions only, 0 removed lines in `git diff -U0 scripts/validate.mjs`).
- No new dependencies (Node 18+). No commits or pushes. No store override feature.
- No startup-cost "reduction" code change (see T14 decision rule).
- Hooks stay fail-open.

## Batches and parallelism
- **B1, code/doc/eval creation:** T1-T12. All are file-disjoint; run as parallel lanes (max 4 per wave) or sequentially.
- **B2:** T13 (`scripts/validate.mjs`). Depends on T1-T3 and T4-T12.
- **B3, RUN steps:** R0-R10, after B2 passes. Run each eval in the background, at most 3 at once, one case per command.
- **B4:** T14, post-run docs. Needs the R outputs.
- **B5:** T15, version bump and README. LAST, after AT-1 to AT-6 pass.
- More than 5 tasks: the final diff goes to `orchestrator:opus-reviewer` with this PRD (save the PRD first and confirm with `ls`).

## Shared constants (exact regex text, used in grader files as YAML single-quoted strings; no `''` inside)
- **MAIN_PRD_WRITE:**
  ```
  "name":"Write","input":\{"file_path":"[^"]*/docs/prd/[^"]+\.md"(?:(?!\{"type":"(?:assistant|user|system|result)")[^\n])*"parent_tool_use_id":null
  ```
- **MAIN_EDIT** (main-session Edit/Write/NotebookEdit outside docs/prd/):
  ```
  "name":"(?:Edit|Write|NotebookEdit)","input":\{(?:(?!"file_path"|\{"type":"(?:assistant|user|system|result)")[^\n])*"file_path":"(?![^"]*/docs/prd/)[^"]*"(?:(?!\{"type":"(?:assistant|user|system|result)")[^\n])*"parent_tool_use_id":null
  ```
- **CHECKPOINT_OK:**
  ```
  File created successfully at: [^"\s]*/checkpoints/[^"\s]+\.md|The file [^"\s]*/checkpoints/[^"\s]+\.md has been updated successfully
  ```
- **LESSON_OK:**
  ```
  File created successfully at: [^"\s]*/lessons/learned-errors\.md|The file [^"\s]*/lessons/learned-errors\.md has been updated successfully
  ```

## Atomic tasks

### T1 - Long-session repeated reminders (item 2)
**File:** `hooks/long-session.mjs`

1. Header comment: replace "warns once per session" with "warns when the context has grown, then again at higher thresholds (ORCH_LONG_REPEAT)".
2. Add these two functions above `run`:
```js
// Extra growth thresholds after the first warning: ORCH_LONG_REPEAT = comma list (default 250000,400000) or "off".
function repeatLevels(v, first) {
  if (v === 'off') return [];
  const raw = v === undefined || v === '' ? '250000,400000' : v;
  const nums = raw.split(',').map((s) => s.trim()).filter((s) => /^[1-9]\d*$/.test(s)).map(Number).filter((n) => n > first);
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, 5);
}
// Highest warning level already shown (marker content); an empty or invalid marker (older versions) counts as 1.
function readLevel(marker) {
  try { const s = readFileSync(marker, 'utf8').trim(); return /^[1-9]\d*$/.test(s) ? Number(s) : 1; } catch { return 1; }
}
```
3. In `run`:
   - Keep the `ORCH_LONG`/id/marker/countPath/transcript checks, but move the `transcript_path` check before the marker check.
   - Replace `if (existsSync(marker)) return '';` with the code below. The `transcript_path` check sits between `countPath` and `tokensLimit`.
```js
const tokensLimit = posInt(process.env.ORCH_LONG_TOKENS, 120000);
const levels = [tokensLimit, ...repeatLevels(process.env.ORCH_LONG_REPEAT, tokensLimit)];
const warned = existsSync(marker) ? readLevel(marker) : 0;
if (warned >= levels.length) return '';
const size = statSync(path).size;
const g = contextGrowth(path, size);
const growth = g ? g.last - g.first : 0;
const level = levels.filter((t) => growth >= t).length;
const say = (line) => JSON.stringify({ systemMessage: line, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: line } });
if (warned > 0) {
  if (!g || level <= warned) return '';
  writeFileSync(marker, String(level));
  return say(`orchestrator: this session is very long (+${Math.round(growth / 1000)}k context tokens; reminder ${level - 1} of ${levels.length - 1}). Every turn re-reads the whole context. If a multi-step task is in progress, write a checkpoint per orchestrator:resume now (one haiku-coder delegation, bundled with any due housekeeping) and continue in a new session with /orchestrator:resume; otherwise suggest a new session or /compact in one line.`);
}
```
4. The rest of the first-warning path stays, with these changes:
   - `tokensLong = level >= 1`.
   - Remove the old duplicate `tokensLimit`/`size`/`g` declarations.
   - The marker write becomes `writeFileSync(marker, String(g ? Math.max(1, level) : levels.length));` (no usage data means no later reminders are possible).
   - Return `say(line)`. The first-warning message text is unchanged.

**Verify:**
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && CL='const fs=require("fs"),os=require("os"),p=require("path");for(const f of fs.readdirSync(os.tmpdir()))if(f.startsWith("orchestrator-long-prdT1"))fs.rmSync(p.join(os.tmpdir(),f),{force:true})' && node -e "$CL" && mkdir -p /private/tmp/claude-501/orch-v1110/t1 && \
mk(){ node -e 'const J=JSON.stringify,n=+process.argv[1];require("fs").writeFileSync("/private/tmp/claude-501/orch-v1110/t1/g.jsonl",J({type:"assistant",message:{usage:{input_tokens:10,cache_read_input_tokens:1000}}})+"\n"+J({type:"assistant",message:{usage:{input_tokens:10,cache_read_input_tokens:n+1000}}})+"\n")' "$1"; } && \
run(){ printf '{"session_id":"%s","transcript_path":"/private/tmp/claude-501/orch-v1110/t1/g.jsonl"}' "$1" | ORCH_LONG= ORCH_LONG_TOKENS= ORCH_LONG_BYTES=999999999 ORCH_LONG_DELEGATIONS= ORCH_LONG_REPEAT="$2" node hooks/long-session.mjs; } && \
mk 130000 && run prdT1a '' | grep -q '+130k' && [ -z "$(run prdT1a '')" ] && mk 260000 && run prdT1a '' | grep -q 'reminder 1 of 2' && [ -z "$(run prdT1a '')" ] && mk 400000 && run prdT1a '' | grep -q 'reminder 2 of 2' && mk 900000 && [ -z "$(run prdT1a '')" ] && \
mk 260000 && run prdT1b off | grep -q '+260k' && mk 500000 && [ -z "$(run prdT1b off)" ] && \
mk 450000 && run prdT1c '' | grep -q '+450k' && ! run prdT1c x | grep -q reminder && mk 460000 && [ -z "$(run prdT1c '')" ] && \
mk 130000 && run prdT1d '200000,abc,50000' | grep -q '+130k' && mk 210000 && run prdT1d '200000,abc,50000' | grep -q 'reminder 1 of 1' && mk 999000 && [ -z "$(run prdT1d '200000,abc,50000')" ] && \
node -e 'require("fs").writeFileSync(require("path").join(require("os").tmpdir(),"orchestrator-long-prdT1e"),"")' && mk 130000 && [ -z "$(run prdT1e '')" ] && mk 260000 && run prdT1e '' | grep -q 'reminder 1 of 2' && \
[ -z "$(printf 'not json' | node hooks/long-session.mjs)" ] && node -e "$CL" && rm -rf /private/tmp/claude-501/orch-v1110/t1 && node scripts/validate.mjs | tail -1 | grep -q '^OK' && echo T1 PASS
```
(Note: `run prdT1c x` uses session prdT1c, which is already at its top level, so it must print nothing.)

### T2 - `scripts/trace-tokens.mjs` (new; items 1 and 3)
**File:** `scripts/trace-tokens.mjs`

ESM, Node 18, no dependencies, always exits 0. Usage: `node scripts/trace-tokens.mjs <trace.jsonl | result.json> [--md]`.

**Mode detection.** If the file parses as one JSON object with an array `cases`, use result mode. Otherwise use trace mode (JSONL). A missing argument or unreadable file prints `TRACE: unreadable`.

**Trace mode, parsing.** Parse each non-empty line; skip unparsable lines.
- `r` = the LAST entry with `type === 'result'`.
- `init` = the first entry with `type === 'system' && subtype === 'init'`.

**Trace mode, line 1:**
`TRACE: total <T> tokens, cost <C>, turns <N>, main <model> out <O>, reply <R> chars, main text <M> chars`
- T = `Math.round(sum/1000)+'k'`, where sum is over `Object.values(r.modelUsage ?? {})` of `inputTokens+outputTokens+cacheReadInputTokens+cacheCreationInputTokens` (missing = 0). Use `?` if there is no result.
- C = `'$'+r.total_cost_usd.toFixed(4)`, or `?`.
- N = `r.num_turns ?? '?'`.
- model = `init?.model ?? '?'`.
- O = `r.modelUsage?.[model]?.outputTokens ?? '?'`.
- R = string `r.result` length, or `?`.
- M = sum of `text.length` over `type:'text'` blocks of assistant entries whose `parent_tool_use_id` is null or undefined (dedupe entries by `uuid` when present).

**Trace mode, agent lines.** Then one line per subagent, in order of `system/task_started` events:
`AGENT: <subagent_type> startup <S> cached <K> total <N> tools <U> brief <B>`
- S and K come from the first assistant entry with `parent_tool_use_id === tool_use_id`:
  - S = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`
  - K = `cache_read_input_tokens`
- N and U = `usage.total_tokens` / `usage.tool_uses` of the LAST `system/task_notification` with that `tool_use_id`.
- B = `prompt.length`.
- Unknown fields print `?`.

**Result mode (without `--md`).** For each case `c`, each `[arm, runs]` of `Object.entries(c.arms ?? {})` where `runs` is an array, and each run: print `RUN: <c.name> <arm> #<i+1> <PASS|FAIL>` (PASS iff `run.passed === true`), then the trace-mode lines of `run.tracePath`.

**Result mode with `--md`.** One row per case+arm:
`| <version> | <date> | <case> | <model> | <n> | <meanTotal> | <meanCost> | arm <arm>; pass <p>/<n>; agent startup <lo>-<hi>k; reply <meanReply> chars |`
- version = `suite.plugins?.[0]?.version ?? '?'`
- date = `String(startedAt ?? '').slice(0,10) || '?'`
- model = `c.model ?? suite.modelOverride ?? '?'`
- meanTotal = mean of known trace totals, as `Math.round(mean/1000)+'k'`, else `?`
- meanCost = mean of numeric `run.costUsd`, `.toFixed(4)`, else `?`
- lo/hi = min/max of known agent startups over the arm's runs, `(x/1000).toFixed(1)`; with none, print `agent startup -`
- meanReply = rounded mean of known reply lengths, else `?`

**Verify:**
```bash
mkdir -p /private/tmp/claude-501/orch-v1110/t2 && cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && node -e '
const fs=require("fs"),d="/private/tmp/claude-501/orch-v1110/t2",J=JSON.stringify;
const L=[{type:"system",subtype:"init",model:"m-main"},{type:"system",subtype:"task_started",tool_use_id:"tu1",subagent_type:"orchestrator:haiku-coder",prompt:"abc"},{type:"assistant",parent_tool_use_id:"tu1",uuid:"u1",message:{id:"s1",content:[{type:"tool_use",id:"x",name:"Bash",input:{}}],usage:{input_tokens:2,cache_creation_input_tokens:4000,cache_read_input_tokens:6000,output_tokens:5}}},{type:"assistant",parent_tool_use_id:"tu1",uuid:"u2",message:{id:"s2",content:[{type:"text",text:"sub text"}],usage:{input_tokens:2,cache_creation_input_tokens:100,cache_read_input_tokens:10000,output_tokens:5}}},{type:"system",subtype:"task_notification",tool_use_id:"tu1",usage:{total_tokens:10900,tool_uses:1}},{type:"result",num_turns:1,total_cost_usd:0.01,result:"x",modelUsage:{"m-main":{inputTokens:1,outputTokens:1,cacheReadInputTokens:1,cacheCreationInputTokens:1}}},{type:"assistant",parent_tool_use_id:null,uuid:"u3",message:{id:"m1",content:[{type:"text",text:"hello"}],usage:{input_tokens:1,output_tokens:1}}},{type:"result",num_turns:3,total_cost_usd:0.1234,result:"done!",modelUsage:{"m-main":{inputTokens:10,outputTokens:500,cacheReadInputTokens:20000,cacheCreationInputTokens:5000},"m-sub":{inputTokens:2,outputTokens:100,cacheReadInputTokens:6000,cacheCreationInputTokens:4000}}}];
fs.writeFileSync(d+"/t.jsonl",L.slice(0,6).map(x=>J(x)).join("\n")+"\nnot json\n"+L.slice(6).map(x=>J(x)).join("\n")+"\n");
fs.writeFileSync(d+"/r.json",J({startedAt:"2026-11-05T01:02:03Z",suite:{modelOverride:"m-main",plugins:[{version:"9.9.9"}]},cases:[{name:"c1",arms:{with:[{passed:true,costUsd:0.5,tracePath:d+"/t.jsonl"}],without:[{passed:false,tracePath:d+"/none.jsonl"}]}}]}));' && \
diff <(node scripts/trace-tokens.mjs /private/tmp/claude-501/orch-v1110/t2/t.jsonl) <(printf '%s\n' 'TRACE: total 36k tokens, cost $0.1234, turns 3, main m-main out 500, reply 5 chars, main text 5 chars' 'AGENT: orchestrator:haiku-coder startup 10002 cached 6000 total 10900 tools 1 brief 3') && \
diff <(node scripts/trace-tokens.mjs /private/tmp/claude-501/orch-v1110/t2/r.json --md) <(printf '%s\n' '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | 36k | 0.5000 | arm with; pass 1/1; agent startup 10.0-10.0k; reply 5 chars |' '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | ? | ? | arm without; pass 0/1; agent startup -; reply ? chars |') && \
node scripts/trace-tokens.mjs /private/tmp/claude-501/orch-v1110/t2/r.json | grep -c '^RUN: c1' | grep -q 2 && [ "$(node scripts/trace-tokens.mjs /private/tmp/claude-501/orch-v1110/t2/none.jsonl; echo "exit=$?")" = "TRACE: unreadable
exit=0" ] && rm -rf /private/tmp/claude-501/orch-v1110/t2 && echo T2 PASS
```

### T3 - `budget=<N>k` for plain `/orchestrator:on` (item 6)
**Files:** `skills/on/SKILL.md`, `skills/on/modes.md`

**`skills/on/SKILL.md`:**
- Frontmatter: `argument-hint: "<task description>"` becomes `argument-hint: "[budget=<N>k] <task description>"`.
- Append this bullet as the last line of `## 3. EXECUTION`:
  > - Budget (`budget=<N>k` in the task arguments, optional): follow the Budget bullet in `modes.md` in this skill's folder (read it only when the argument is given); a group is one task of the plan (the short path is one group). On OVER start no new task, write a checkpoint per `orchestrator:resume`, and report status BUDGET with the script's line.

**`skills/on/modes.md`, Budget bullet (line 10):**
- Fix the broken 1.10.1 text. Old: `(the folder printed in the skill header)). it uses the newest transcript` New: `(the folder printed in the skill header); it uses the newest transcript`
- Insert this sentence before `Without the argument there is no budget.`:
  > In plain `orchestrator:on` a group is one task of the plan with its verify and fix loop; the mark is taken before the first delegation.
- Do not add any other `status <CAPS>`, `<CAPS> stop` or `is <CAPS>` phrase.

**Verify:**
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && grep -q 'argument-hint: "\[budget=<N>k\] <task description>"' skills/on/SKILL.md && grep -q 'follow the Budget bullet in `modes.md`' skills/on/SKILL.md && grep -q 'report status BUDGET' skills/on/SKILL.md && grep -q 'In plain `orchestrator:on` a group is one task' skills/on/modes.md && ! grep -q 'header)). it uses' skills/on/modes.md && grep -q 'header); it uses' skills/on/modes.md && node scripts/validate.mjs | tail -1 | grep -q '^OK' && echo T3 PASS
```

### T4 - Honest graders for checkpoint and PRD save (item 4)
**Files:** `evals/autopilot-budget-stop/graders/checkpoint.md`, `evals/autopilot-budget-stop/graders/checkpoint-written.md` (new), `evals/on-sonnet-prd-save/graders/prd-write.md`, `evals/on-sonnet-prd-save/graders/prd-write-main.md` (new), `evals/on-sonnet-prd-save/graders/review-after-prd.md` (new)

In the two existing files, change only the body text; the frontmatter lines stay byte-identical.

**`checkpoint.md` body:**
> A checkpoint write was delegated (attempt only; tool_used cannot see whether the write succeeded, see checkpoint-written).

**`checkpoint-written.md`:**
```
---
type: regex
target: trace
pattern: '<CHECKPOINT_OK>'
---
The checkpoint file was actually written (Write/Edit success result in the trace). Expected to FAIL in a sandboxed local run: the store (~/.claude/orchestrator/<key>/) is outside the run directory and the write is denied.
```

**`prd-write.md` body:**
> A Write to docs/prd/*.md happened (tool_used may also count subagent calls; prd-write-main checks the main session). Reviewer ordering: review-after-prd.

**`prd-write-main.md`:**
```
---
type: regex
target: trace
pattern: '<MAIN_PRD_WRITE>'
---
The main session itself (parent_tool_use_id null) wrote the planner PRD to docs/prd/.
```

**`review-after-prd.md`:**
```
---
type: tool_order
before:
  tool: Write
  input_match: 'docs/prd/[^"]+\.md'
after:
  tool: Agent
  input_match: 'orchestrator:opus-reviewer'
---
The PRD file was written before orchestrator:opus-reviewer was launched.
```
(Replace `<CHECKPOINT_OK>` and `<MAIN_PRD_WRITE>` with the exact constants.)

**Verify:** AT-6 plus `git diff -U0 -- evals/autopilot-budget-stop/graders/checkpoint.md evals/on-sonnet-prd-save/graders/prd-write.md | grep -E '^[-+](type|tool|input_match|min|max|pattern|target):'` prints nothing.

### T5 - Eval `team-parallel`, part 1 (item 5a)
**Files:** `evals/team-parallel/case.yaml`, `prompt.md`, `fixture.sh`, `graders/lanes.md`, `graders/background.md`

**`case.yaml`:**
```
schema_version: "1.1"
name: team-parallel
tags: [team, parallel]
context:
  scaffold_script: fixture.sh
```

**`prompt.md`** frontmatter: `runs: 1`, `max_turns: 60`, `timeout_seconds: 1200`, `allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]`. Body:
> /orchestrator:team Two independent parts: 1) in src/a.js add and export a function double(x) that returns x * 2, and add an assertion to test-a.js that double(2) is 4; 2) in src/b.js add and export a function triple(x) that returns x * 3, and add an assertion to test-b.js that triple(2) is 6.

**`fixture.sh`:** the same header as `evals/on-small-edit/fixture.sh` (`set -e`, git init/config), then:
- `mkdir src`
- `src/a.js`: `function inc(x) { return x + 1; }` / `module.exports = { inc };`
- `src/b.js`: `function dec(x) { return x - 1; }` / `module.exports = { dec };`
- `test-a.js`: requires assert and `./src/a`, `assert.strictEqual(a.inc(1), 2); console.log('a ok');`
- `test-b.js`: same pattern with `b.dec(1)` equal to 0 and `'b ok'`.
- `package.json`: `{ "name": "fixture", "version": "1.0.0", "scripts": { "test": "node test-a.js && node test-b.js" } }`
- `git add -A`, `git commit -qm init`.

**Graders:**
- `lanes.md`: `type: tool_used`, `tool: Agent`, `input_match: '"subagent_type"\s*:\s*"orchestrator:(?:haiku-coder|sonnet-dev)"'`, `min: 2`. Body: "Team mode launched at least two executor lanes."
- `background.md`: `type: tool_used`, `tool: Agent`, `input_match: '"run_in_background"\s*:\s*true'`, `min: 2`. Body: "Lanes were launched in the background (parallel)."

**Verify:** AT-5 (team part).

### T6 - Eval `team-parallel`, part 2
**Files:** `evals/team-parallel/graders/no-main-edit.md`, `a-done.md`, `b-done.md`

- `no-main-edit.md`: `type: regex`, `target: trace`, `match: not_contains`, `pattern: '<MAIN_EDIT>'`. Body: "The main session (parent_tool_use_id null) never called Edit/Write/NotebookEdit outside docs/prd/; unlike tool_used this ignores subagent calls."
- `a-done.md`: `type: regex`, `pattern: 'module\.exports\s*=\s*\{[^}]*\bdouble\b|exports\.double\s*='`, `target: {source: file, path: src/a.js}` (nested YAML as in `on-small-edit/graders/renamed.md`). Body: "src/a.js exports double."
- `b-done.md`: the same with `triple` and `src/b.js`.

**Verify:** AT-5, AT-6.

### T7 - Eval `on-learned-errors-write`, part 1 (item 5b)
**Files:** `evals/on-learned-errors-write/case.yaml`, `prompt.md`, `fixture.sh`, `graders/fixed-defaults.md`, `graders/fixed-limits.md`

- `case.yaml`: `name: on-learned-errors-write`, `tags: [on, learned]`, scaffold `fixture.sh`.
- `prompt.md`: frontmatter `runs: 1`, `max_turns: 50`, `timeout_seconds: 1200`, `allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]`. Body: `/orchestrator:on npm test fails. Make it pass; do not change test.js.`

**`fixture.sh`:** a copy of `evals/on-learned-errors/fixture.sh` with one change. In `test.js`, add these checks after the `mode` check and before `console.log('ok')`:
```js
if (!fs.existsSync('config/limits.json')) {
  console.error('ORCH_E77: limits config missing');
  process.exit(1);
}
const lim = JSON.parse(fs.readFileSync('config/limits.json', 'utf8'));
if (lim.max !== 10) {
  console.error('ORCH_E77: limits.max must be 10');
  process.exit(1);
}
```
The `store=$(...)` line and the seeded `learned-errors.md` (ORCH_E42 entry, `hits: 1`) stay verbatim.

**Graders:**
- `fixed-defaults.md`: regex `'"mode"\s*:\s*"safe"'` on file `config/defaults.json`.
- `fixed-limits.md`: regex `'"max"\s*:\s*10\b'` on file `config/limits.json`.

**Verify:** AT-5 (learned part).

### T8 - Eval `on-learned-errors-write`, part 2
**Files:** `evals/on-learned-errors-write/graders/hits-update.md`, `new-entry.md`, `save-written.md`

- `hits-update.md`: `type: tool_used`, `tool: Agent`, `min: 1`, `input_match: 'hits[^\\"]{0,20}\b2\b|increment[^\\"]{0,40}hits|hits[^\\"]{0,40}(?:\+\s*1|by (?:1|one)|increment)'`. Body: "The end-of-task save raises hits of the matched ORCH_E42 entry (1 -> 2)."
- `new-entry.md`: `type: tool_used`, `tool: Agent`, `min: 1`, `input_match: 'ERROR:\s*ORCH_E77[^\\"]{0,200}(?:->|→)\s*CAUSE:'`. Body: "A new learned-errors entry for ORCH_E77 was sent to a save delegation after the verified fix."
- `save-written.md`: `type: regex`, `target: trace`, `pattern: '<LESSON_OK>'`. Body: "The lesson file was actually written. Expected to FAIL in a sandboxed local run (store outside the run directory)."

**Verify:** AT-5, AT-6.

### T9 - Eval `delegation-startup` (item 1)
**Files:** `evals/delegation-startup/case.yaml`, `prompt.md`, `graders/haiku-twice.md`, `graders/reviewer-once.md`, `graders/created.md`

- `case.yaml`: `name: delegation-startup`, `tags: [measure, tokens]`. No `context` (no fixture).
- `prompt.md`: frontmatter `runs: 2`, `max_turns: 20`, `timeout_seconds: 600`, `allowed_tools: [Read, Glob, Grep, Agent, Bash, Edit, Write]` (no Skill on purpose). Body:
```
This is a token measurement run. Do not plan and do not load any skill. Make exactly three Agent calls, one at a time, in the foreground (run_in_background false), waiting for each result:
1. subagent_type orchestrator:haiku-coder, prompt exactly: TYPE: RUN. Do not call any tool. Reply with exactly: STATUS: SUCCESS
2. subagent_type orchestrator:haiku-coder, prompt exactly: TYPE: CREATE. Create notes/a.txt containing the single line a. Verification: cat notes/a.txt prints a.
3. subagent_type orchestrator:opus-reviewer, prompt exactly: Do not call any tool. Reply with exactly: OK
Then reply with one line: DONE.
```
- **Graders:**
  - `haiku-twice.md`: tool_used Agent, `input_match: '"subagent_type"\s*:\s*"orchestrator:haiku-coder"'`, `min: 2`, `max: 2`.
  - `reviewer-once.md`: tool_used Agent, `'"subagent_type"\s*:\s*"orchestrator:opus-reviewer"'`, `min: 1`, `max: 1`.
  - `created.md`: regex `'^a$'`, `flags: m`, target file `notes/a.txt`.
- **Metric (R3):** call 1 = fixed cost per haiku delegation; call 2 total minus call 1 total = task cost; call 3 = fixed opus-agent cost.

**Verify:** AT-5.

### T10 - Eval `chat-terse` (item 5c)
**Files:** `evals/chat-terse/case.yaml`, `prompt.md`, `fixture.sh`, `graders/no-delegation.md`, `graders/answer.md`

- `case.yaml`: `name: chat-terse`, `tags: [style, tokens]`, scaffold `fixture.sh`.
- `prompt.md`: frontmatter `runs: 3`, `max_turns: 10`, `timeout_seconds: 300`, `allowed_tools: [Read, Glob, Grep]`. Body: `What does src/math.js do, and what happens if add receives two strings instead of two numbers? Do not change any file.`
- `fixture.sh`: a copy of `evals/on-small-edit/fixture.sh`.
- **Graders:**
  - `no-delegation.md`: tool_used Agent, `min: 0`, `max: 0`.
  - `answer.md`: regex `'concaten|string'`, `flags: i` (last message).
- **Metric:** `reply <R> chars` and `main ... out <O>` from trace-tokens, compared between this plugin and a copy without the terse sentence (R6/R7).

**Verify:** AT-5.

### T11 - Eval `plain-edit-ablation`, part 1 (item 3)
**Files:** `evals/plain-edit-ablation/case.yaml`, `prompt.md`, `fixture.sh`, `graders/renamed.md`, `graders/test-updated.md`

- `case.yaml`: `name: plain-edit-ablation`, `tags: [ablation, on]`, scaffold `fixture.sh`.
- `prompt.md`: frontmatter `runs: 2`, `max_turns: 40`, `timeout_seconds: 900`, `allowed_tools: [Read, Glob, Grep, Skill, Agent, Bash, Edit, Write]`. Body (no slash command, so the without-plugin arm is fair): `Rename the function add to sum in src/math.js and update its use in test.js.`
- `fixture.sh`, `renamed.md`, `test-updated.md`: byte copies of the `evals/on-small-edit` files.

**Verify:** AT-5.

### T12 - Eval `plain-edit-ablation`, part 2, plus pre-run eval docs
**Files:** `evals/plain-edit-ablation/graders/skill-fired.md`, `evals/plain-edit-ablation/graders/delegated.md`, `evals/on-sonnet-prd-save/graders/planner-used.md`, `evals/README.md`

- `skill-fired.md`: tool_used `Skill`, `input_match: 'orchestrator:on'`, `min: 1`, `arm: with-only`. Body: "Plugin-fired indicator: orchestrator:on was loaded."
- `delegated.md`: tool_used Agent, `input_match: '"subagent_type"\s*:\s*"orchestrator:haiku-coder"'`, `min: 1`, `arm: with-only`.
- `planner-used.md`: body only (frontmatter unchanged):
  > A non-Opus main session gets its PRD from orchestrator:opus-planner. Main-session PRD saving is checked by prd-write-main (trace regex); ordering by review-after-prd (tool_order).

**`evals/README.md`:**
- In item 5, replace `it cannot be graded with \`tool_used\` or \`regex\`.` with `it is graded with \`tool_order\` in \`on-sonnet-prd-save/graders/review-after-prd.md\`.`
- Add item 6:
  > 6. Cases added in 1.11.0: `team-parallel` (team lanes), `on-learned-errors-write` (lesson save after a verified fix; writes into `$HOME/.claude/orchestrator/<key>/` like `on-learned-errors`, delete after a local run), `delegation-startup` (per-delegation fixed token cost; `--ablation none --runs 2`), `chat-terse` (reply length; compare against a plugin copy without the terse sentence in `hooks/rules.md`), `plain-edit-ablation` (plugin value; run with `--ablation with-without`). Token rows: `node scripts/trace-tokens.mjs <result.json> --md`.

**Verify:**
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && grep -q 'review-after-prd.md' evals/README.md && grep -q '^6\. Cases added in 1.11.0' evals/README.md && ! grep -q 'cannot be graded with' evals/README.md && grep -q 'arm: with-only' evals/plain-edit-ablation/graders/skill-fired.md && echo T12 PASS
```

### T13 - Validator additions (B2; after B1)
**File:** `scripts/validate.mjs`. Additions only: no existing line changed or removed (`git diff -U0 -- scripts/validate.mjs | grep -c '^-[^-]'` must print 0).

**(a) Section 7d**, inside the existing `if (exists(path.join(root, modesFile))) { ... }` block, after the resume check, so `stopNames` is in scope:
```js
// 7d. orchestrator:on budget argument: hint, pointer to modes.md Budget, and only stop names known to modes.md
const onFile = 'skills/on/SKILL.md';
if (exists(path.join(root, onFile))) {
  const onText = readText(path.join(root, onFile));
  if (onText.includes('budget=')) {
    const hint = /^argument-hint:\s*(.*)$/m.exec(onText)?.[1] ?? '';
    if (!hint.includes('budget=<N>k')) err(onFile, 'argument-hint must include "budget=<N>k" when the body uses budget=');
    if (!/Budget[^\n]*modes\.md|modes\.md[^\n]*Budget/.test(onText)) err(onFile, 'budget= rule must point to the Budget bullet in modes.md');
  }
  for (const m of onText.matchAll(/\bstatus ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g)) {
    if (m[1] !== 'PASS' && !stopNames.has(m[1])) err(onFile, `stop status "${m[1]}" is not defined in ${modesFile}`);
  }
}
```

**(b) Section 8b, long-session repeat smoke.**
- Add a new line directly after the `markers` declaration: `markers.push(...['g','h','i','j','k'].flatMap((s) => [path.join(os.tmpdir(), \`orchestrator-long-${sidA}-${s}\`), path.join(os.tmpdir(), \`orchestrator-long-${sidA}-${s}.count\`)]));`
- After the existing `r5` test, loop over these steps. Each step rewrites `path.join(tmp,'repeat.jsonl')` with `usageTranscript(growth + 1000)` and runs the hook with session `${sidA}-<sfx>` and env `{ORCH_LONG:'', ORCH_LONG_DELEGATIONS:'', ORCH_LONG_BYTES:'999999999', ORCH_LONG_TOKENS:'', ORCH_LONG_REPEAT: rep}`. Expect = substring(s), `!reminder` = must not contain "reminder", or empty stdout:
  - **g** (rep `''`): 130000 → `+130k` and `!reminder`; 130000 → empty; 260000 → `reminder 1 of 2`; 260000 → empty; 400000 → `reminder 2 of 2`; 900000 → empty.
  - **h** (rep `'off'`): 260000 → `+260k` and `!reminder`; 500000 → empty.
  - **i** (first `fs.writeFileSync(<marker of i>, '')`, rep `''`): 130000 → empty; 260000 → `reminder 1 of 2`.
  - **j** (rep `''`): 450000 → `+450k` and `!reminder`; 460000 → empty.
  - **k** (rep `'200000,abc,50000'`): 130000 → `+130k`; 210000 → `reminder 1 of 1`; 999000 → empty.
- Error: `err('hooks/long-session.mjs', \`smoke "long repeat ${sfx} step ${n}": expected ${want}\`)`.

**(c) Section 8d, trace-tokens smoke** (new block with its own `fs.mkdtempSync(path.join(os.tmpdir(),'orch-trace-'))` and `finally` rmSync):
- Generate the T2 `t.jsonl` and `r.json` (same objects).
- Assert the exact trimmed stdout of the trace mode (2 lines) and the `--md` mode (2 rows).
- Assert a missing file gives `TRACE: unreadable` with exit 0.
- Error: `err('scripts/trace-tokens.mjs', \`smoke "${name}": expected "${want}", got "${got}"\`)`. A missing script gives `err('scripts/trace-tokens.mjs','missing, cannot smoke test')`.

**(d) Section 9, eval case structure** (before the final print):
```js
// 9. Eval cases: case.yaml name matches folder, prompt.md and scaffold script exist, graders use a known type with required keys
const GRADER_TYPES = new Set(['regex', 'tool_order', 'tool_used', 'file_exists', 'llm', 'baseline']);
const REQUIRED = { regex: ['pattern'], tool_order: ['before', 'after'], tool_used: ['tool'], file_exists: ['path'], llm: [], baseline: ['baseline_file'] };
for (const c of listDirs('evals').filter((d) => d !== 'results')) {
  const dir = `evals/${c}`, caseFile = `${dir}/case.yaml`;
  if (!exists(path.join(root, caseFile))) { err(caseFile, 'missing'); continue; }
  const cy = readText(path.join(root, caseFile));
  const name = /^name:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (name !== c) err(caseFile, `name "${name ?? ''}" must match folder "${c}"`);
  const scaffold = /^\s*scaffold_script:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (scaffold && !exists(path.join(root, dir, scaffold))) err(caseFile, `scaffold_script "${scaffold}" missing`);
  if (!exists(path.join(root, dir, 'prompt.md'))) err(`${dir}/prompt.md`, 'missing');
  const graders = listMd(`${dir}/graders`);
  if (!graders.length) err(`${dir}/graders`, 'no grader files');
  for (const g of graders) {
    const gf = `${dir}/graders/${g}`, fm = frontmatter(gf);
    if (!fm) continue;
    if (!GRADER_TYPES.has(fm.type)) { err(gf, `type "${fm.type ?? ''}" must be one of ${[...GRADER_TYPES].join(', ')}`); continue; }
    for (const k of REQUIRED[fm.type]) if (!fm[k]) err(gf, `${fm.type} grader needs "${k}"`);
    for (const [k, fl] of [['pattern', fm.flags ?? ''], ['input_match', '']]) {
      if (fm[k] && fm[k] !== '(block)') { try { new RegExp(fm[k], fl); } catch (e) { err(gf, `${k} is not a valid RegExp (${e.message})`); } }
    }
  }
}
```

**Verify:** AT-4.

### T14 - Post-run docs (B4; after R0-R10)
**Files:** `evals/README.md`, `docs/ideas/token-saving.md`

**`evals/README.md`:**
1. Add `## Grader notes` before `## Token log per plugin version`, with these bullets:
   - `tool_used`/`tool_order` scope as confirmed by R1. If confirmed: "count tool calls of the main session and of subagents (CLI 2.1.317); for main-session-only checks use `regex` with `target: trace` and `\"parent_tool_use_id\":null` (examples: `team-parallel/graders/no-main-edit.md`, `on-sonnet-prd-save/graders/prd-write-main.md`)".
   - The R9/R4 pilot result for `target: trace`.
   - "Writes to `<store>` (checkpoints, lessons) land outside the run directory; the local sandbox denies them, so `checkpoint-written` and `save-written` FAIL there by design." Add the R10 result: if the extra grant worked, give the exact `--allow-tools` flags.
2. Token log:
   - Add the sentence: "Total tokens and Cost USD are means per run over all models (final `modelUsage`)."
   - Append the rows printed by R0 and R1-R9 (`--md`). Rows from B3 runs use version `1.11.0-dev`, because the manifests still said 1.10.1 during the runs.
   - Keep the baseline row.
3. Add `### Findings (1.11.0)`, at most 6 bullets, numbers from the rows:
   - fixed cost per delegation (R3);
   - with vs without on plain-edit (R2: tokens, cost, pass);
   - terse A/B (R6 vs R7: mean reply chars and main out tokens; 3 runs each, directional only);
   - team lanes result (R4);
   - learned-errors write result (R5);
   - honest checkpoint grader result (R8).

**`docs/ideas/token-saving.md`:**
- Status line: append `, 13 (delegation startup measured v1.11.0: no change, see below)`.
- Append a section `## Measured in v1.11.0: per-delegation startup` covering:
  - The R3 numbers plus the planner evidence: haiku startup about 10.6k (cached prefix 6,258), opus agents about 9.2k, task part of a 1-file CREATE = R3 call2 - call1.
  - Plugin-controlled share: the agent file body, about 0.9k for `haiku-coder` (under 10%).
  - Decision: no reduction. Trimming `agents/haiku-coder.md` saves under 1k per delegation and risks TYPE-rule regressions. The real lever is fewer delegations: bundling, `SendMessage` reuse, the short path. All of these are already rules.
  - Revisit only if R3 shows the plugin-controlled share above 3k.

**Verify:**
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && grep -q '^## Grader notes' evals/README.md && [ "$(grep -c '^| 1\.1[01]' evals/README.md)" -ge 6 ] && grep -q '^### Findings (1.11.0)' evals/README.md && grep -q '^## Measured in v1.11.0' docs/ideas/token-saving.md && node scripts/validate.mjs | tail -1 | grep -q '^OK' && echo T14 PASS
```

### T15 - Version and README (B5; LAST)
**Files:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md`

- Manifests: `"version": "1.11.0"` in both files.
- README line 35 (`/orchestrator:on` bullet): append `; optional \`budget=<N>k\` (e.g. \`/orchestrator:on budget=50k <task>\`) stops with status BUDGET and a checkpoint once the agents' total tokens reach it`.
- README line 61: replace `appears once when the context grows by 120k tokens` with `appears when the context grows by 120k tokens, again at +250k and +400k (\`ORCH_LONG_REPEAT\`: comma list or \`off\`), suggesting a checkpoint and a new session,`.
- `## What's new`: insert `### 1.11.0` above `### 1.10.1` with bullets:
  - long-session reminders;
  - `budget=<N>k` for plain `on`;
  - `scripts/trace-tokens.mjs` plus the measured startup cost (numbers from T14);
  - honest graders (trace-based main-session and write-success checks, `tool_order` review ordering);
  - 5 new evals plus the filled token log;
  - validator: eval structure, `on` budget rule, new smoke tests.
- `## Plugin contents` hooks line: add `long-session reminder (UserPromptSubmit)`.
- Append directly after the `- Baru di 1.10.1:` line (before `- Mode orkestrasi aktif otomatis...`):
  > - Baru di 1.11.0: pengingat sesi panjang berulang di +250k dan +400k token konteks (`ORCH_LONG_REPEAT`) dengan saran checkpoint, `budget=<N>k` juga untuk `/orchestrator:on` biasa, skrip `scripts/trace-tokens.mjs` (total token dan biaya startup per agent dari trace eval), grader yang lebih jujur (cek trace khusus sesi utama dan keberhasilan tulis checkpoint, urutan review dengan `tool_order`), 5 eval baru dan log token berisi hasil terukur, serta validator memeriksa struktur eval.

**Verify:**
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && node scripts/validate.mjs | tail -1 | grep -q 'version 1.11.0' && grep -q '^### 1.11.0' README.md && grep -q '^- Baru di 1.11.0' README.md && grep -q 'ORCH_LONG_REPEAT' README.md && grep -q 'orchestrator:on budget=50k' README.md && echo T15 PASS
```

## RUN steps (B3; main session runs, or `haiku-coder TYPE: RUN`; each in the background, at most 3 at once)
**Setup:** `mkdir -p /private/tmp/claude-501/orch-v1110`

**EVAL(case, step, runs, ablation, cost)** expands to:
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && "$HOME/Library/Application Support/Claude/claude-code/2.1.317/91184d3d9ba3/claude.app/Contents/MacOS/claude" plugin eval . --case "<case>" --runs <runs> --ablation <ablation> --scaffold --trust-plugin --allow-tools Bash Edit Write --model claude-opus-5-5 --judge-model claude-haiku-5-5 --max-cost-usd <cost> --no-publish --output-dir /private/tmp/claude-501/orch-v1110/<step>-out --json /private/tmp/claude-501/orch-v1110/<step>.json 2>&1 | tail -n 15
```

**After each run:**
- SUM:
  ```bash
  node -e 'const j=require(process.argv[1]);console.log("cost",j.costUsd,"partial",j.partial);for(const c of j.cases)for(const [a,rs] of Object.entries(c.arms))rs.forEach((r,i)=>console.log(c.name,a,i+1,r.passed?"PASS":"FAIL",r.graders.map(g=>g.name+":"+(g.passed?"P":"F")+" ("+g.explanation.slice(0,50)+")").join("; ")))' /private/tmp/claude-501/orch-v1110/<step>.json
  ```
- TT: `node scripts/trace-tokens.mjs /private/tmp/claude-501/orch-v1110/<step>.json` and the same with `--md`.
- If the `--json` file lacks `cases`, use the `aggregate-result.json` found by `ls -R /private/tmp/claude-501/orch-v1110/<step>-out`.

| Step | Command | Purpose / check |
|---|---|---|
| R0 | `cd R && for f in evals/results/*/aggregate-result.json; do node scripts/trace-tokens.mjs "$f" --md; done \| grep -v '\| ? \| ? \|'` | 1.10.0 rows from existing runs (traces still on disk); no model calls |
| R1 | EVAL(on-small-edit, R1, 1, none, 2) then SCOPE (below) | Confirms `tool_used` scope; expected: `no-main-edit` FAIL with "Edit called N x" = main 0 + sub N |
| R2 | EVAL(plain-edit-ablation, R2, 2, with-without, 3) | Plugin value: with vs without tokens, cost and pass |
| R3 | EVAL(delegation-startup, R3, 2, none, 2) | Fixed cost per delegation: AGENT lines (call 1 vs call 2 vs reviewer) |
| R4 | EVAL(team-parallel, R4, 1, none, 2) then PILOT(no-main-edit, team-parallel, not) | Team lanes; trace-target pilot (not_contains) |
| R5 | EVAL(on-learned-errors-write, R5, 1, none, 2) then C1 | Learned-errors write path; `save-written` expected FAIL (sandbox) |
| R6 | EVAL(chat-terse, R6, 3, none, 2) | Terse rule present |
| R7 | NOTERSE then the R6 command with `plugin eval /private/tmp/claude-501/orch-v1110/plugin-noterse` (instead of `.`) and step R7; then C2 | Terse rule absent (A/B) |
| R8 | EVAL(autopilot-budget-stop, R8, 1, none, 2) | `checkpoint-written` must FAIL when the write is denied (the old `checkpoint` grader passes) |
| R9 | EVAL(on-sonnet-prd-save, R9, 1, none, 2) then PILOT(prd-write-main, on-sonnet-prd-save, contains) | Main-thread PRD save; trace-target pilot; `review-after-prd` |
| R10 (optional) | R8 command with step R10 and `--allow-tools Bash Edit Write "Write(//private/tmp/**)" "Edit(//private/tmp/**)"` | Is the store write possible with a grant? If `checkpoint-written` passes, document the flags in T14 |

**Estimated total cost:** about $5 (each command is capped by `--max-cost-usd`).

**SCOPE (R1):**
```bash
node -e 'const j=require(process.argv[1]),fs=require("fs");for(const c of j.cases)for(const r of Object.values(c.arms).flat()){const g=r.graders.find(x=>x.name==="no-main-edit");let m=0,s=0;const seen=new Set();for(const l of fs.readFileSync(r.tracePath,"utf8").split("\n")){let o;try{o=JSON.parse(l)}catch{continue}if(o.type!=="assistant")continue;for(const b of o.message?.content||[])if(b.type==="tool_use"&&b.name==="Edit"&&!seen.has(b.id)){seen.add(b.id);o.parent_tool_use_id?s++:m++}}console.log("grader:",g.explanation,"| trace main Edit",m,"sub Edit",s)}' /private/tmp/claude-501/orch-v1110/R1.json
```
Grader count = m+s with s>0 confirms subagent counting. Grader count = m means main-only; then T14 states that, and the "Open decisions" item is void.

**PILOT(grader, case, mode):**
```bash
node -e 'const [f,gn,cs,mode]=process.argv.slice(1),j=require(f),fs=require("fs");const p=/^pattern: \x27(.*)\x27$/m.exec(fs.readFileSync("evals/"+cs+"/graders/"+gn+".md","utf8"))[1];for(const c of j.cases)for(const r of Object.values(c.arms).flat()){const g=r.graders.find(x=>x.name===gn);const hit=new RegExp(p).test(fs.readFileSync(r.tracePath,"utf8"));console.log(gn,"grader",g.passed,"local",mode==="not"?!hit:hit)}' /private/tmp/claude-501/orch-v1110/<step>.json <grader> <case> <contains|not>
```
(Run from `R`.) Grader and local agree: `target: trace` matches raw-JSONL semantics. They disagree: T14 documents the trace-target graders as unreliable and keeps `prd-write`/`checkpoint` as the attempt-only checks.

**NOTERSE** (haiku-coder `TYPE: RUN`, not the main session):
```bash
mkdir -p /private/tmp/claude-501/orch-v1110 && rsync -a --exclude .git --exclude evals/results /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/ /private/tmp/claude-501/orch-v1110/plugin-noterse/ && node -e 'const fs=require("fs"),f=process.argv[1],t=fs.readFileSync(f,"utf8"),a=" Chat replies to the user: terse telegraphic style",b="normal full sentences.";const i=t.indexOf(a),k=t.indexOf(b,i);if(i<0||k<0)process.exit(1);fs.writeFileSync(f,t.slice(0,i)+t.slice(k+b.length))' /private/tmp/claude-501/orch-v1110/plugin-noterse/hooks/rules.md && ! grep -q terse /private/tmp/claude-501/orch-v1110/plugin-noterse/hooks/rules.md && node /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/scripts/validate.mjs /private/tmp/claude-501/orch-v1110/plugin-noterse | tail -1
```

**C1** (learned-errors store cleanup, no shell-variable rm):
```bash
node -e 'const fs=require("fs"),p=require("path"),d=p.join(require("os").homedir(),".claude","orchestrator");for(const n of fs.existsSync(d)?fs.readdirSync(d):[])if(/^-private-tmp-e-[a-z0-9]+-home-cwd$/.test(n)){fs.rmSync(p.join(d,n),{recursive:true,force:true});console.log("removed",n)}'
```

**C2:** `rm -rf /private/tmp/claude-501/orch-v1110/plugin-noterse`

**C3** (after T14 passes): `rm -rf /private/tmp/claude-501/orch-v1110`. The `/private/tmp/e-*` run dirs are read-only system temp; leave them.

## Acceptance tests
- **AT-1:** `node scripts/validate.mjs | tail -1` prints `OK: 8 skills, 4 agents, version 1.10.1` after B2, and `... version 1.11.0` after B5.
- **AT-2:** the T1 and T2 verify commands print `T1 PASS` / `T2 PASS`.
- **AT-3:** the T3 verify prints `T3 PASS`.
- **AT-4** (validator catches regressions):
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && V=scripts/validate.mjs && cp_(){ mkdir -p /private/tmp/claude-501/orch-v1110/at4 && rsync -a --exclude .git --exclude evals/results ./ "/private/tmp/claude-501/orch-v1110/at4/$1/"; } && \
cp_ a && perl -pi -e 's/\[budget=<N>k\] //' /private/tmp/claude-501/orch-v1110/at4/a/skills/on/SKILL.md && node $V /private/tmp/claude-501/orch-v1110/at4/a | grep -q 'argument-hint must include' && \
cp_ b && perl -pi -e 's/report status BUDGET/report status BUDGETX/' /private/tmp/claude-501/orch-v1110/at4/b/skills/on/SKILL.md && node $V /private/tmp/claude-501/orch-v1110/at4/b | grep -q 'stop status "BUDGETX" is not defined' && \
cp_ c && perl -pi -e 's/^type: regex/type: foo/' /private/tmp/claude-501/orch-v1110/at4/c/evals/chat-terse/graders/answer.md && node $V /private/tmp/claude-501/orch-v1110/at4/c | grep -q 'type "foo"' && \
cp_ d && perl -pi -e 's/reminder \$\{/remind \$\{/' /private/tmp/claude-501/orch-v1110/at4/d/hooks/long-session.mjs && node $V /private/tmp/claude-501/orch-v1110/at4/d | grep -q 'long repeat' && \
cp_ e && perl -pi -e 's/TRACE: total/TRACE total/' /private/tmp/claude-501/orch-v1110/at4/e/scripts/trace-tokens.mjs && node $V /private/tmp/claude-501/orch-v1110/at4/e | grep -q 'scripts/trace-tokens.mjs' && \
[ "$(git diff -U0 -- scripts/validate.mjs | grep -c '^-[^-]')" = 0 ] && rm -rf /private/tmp/claude-501/orch-v1110/at4 && echo AT4 PASS
```
- **AT-5** (fixtures run; validator section 9 already passes):
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && B=/private/tmp/claude-501/orch-v1110/at5 && mkdir -p /private/tmp/claude-501/orch-v1110/at5/team /private/tmp/claude-501/orch-v1110/at5/le/repo /private/tmp/claude-501/orch-v1110/at5/le/home /private/tmp/claude-501/orch-v1110/at5/terse /private/tmp/claude-501/orch-v1110/at5/plain && \
(cd /private/tmp/claude-501/orch-v1110/at5/team && bash /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/evals/team-parallel/fixture.sh && node test-a.js && node test-b.js) && \
(cd /private/tmp/claude-501/orch-v1110/at5/le/repo && HOME=/private/tmp/claude-501/orch-v1110/at5/le/home bash /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/evals/on-learned-errors-write/fixture.sh && ls /private/tmp/claude-501/orch-v1110/at5/le/home/.claude/orchestrator/*/lessons/learned-errors.md && node test.js 2>&1 | grep -q ORCH_E42; mkdir -p config && echo '{"mode":"safe"}' > config/defaults.json && node test.js 2>&1 | grep -q 'ORCH_E77: limits config missing' && echo '{"max":10}' > config/limits.json && node test.js | grep -q ok) && \
(cd /private/tmp/claude-501/orch-v1110/at5/terse && bash /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/evals/chat-terse/fixture.sh && node test.js) && \
(cd /private/tmp/claude-501/orch-v1110/at5/plain && bash /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill/evals/plain-edit-ablation/fixture.sh && node test.js) && \
for c in team-parallel on-learned-errors-write delegation-startup chat-terse plain-edit-ablation; do grep -q "^name: $c$" evals/$c/case.yaml || exit 1; done && node scripts/validate.mjs | tail -1 | grep -q '^OK' && rm -rf /private/tmp/claude-501/orch-v1110/at5 && echo AT5 PASS
```
- **AT-6** (trace grader patterns behave on synthetic main/sub entries, in both JSONL and one-line array rendering):
```bash
cd /Users/bagushariwijaya/Downloads/Claude-Orchestrator-Skill && node -e '
const fs=require("fs"),J=JSON.stringify,pat=f=>new RegExp(/^pattern: \x27(.*)\x27$/m.exec(fs.readFileSync(f,"utf8"))[1]);
const tu=(name,input,parent)=>({type:"assistant",message:{id:"m",content:[{type:"tool_use",id:"t",name,input,caller:{type:"direct"}}],usage:{}},parent_tool_use_id:parent,uuid:"u"});
const res=(text)=>({type:"user",message:{content:[{type:"tool_result",tool_use_id:"t",content:text}]},parent_tool_use_id:"toolu_9"});
const both=(L)=>[L.map(J).join("\n"),J(L)];
const prd=pat("evals/on-sonnet-prd-save/graders/prd-write-main.md"),ed=pat("evals/team-parallel/graders/no-main-edit.md"),cp=pat("evals/autopilot-budget-stop/graders/checkpoint-written.md"),le=pat("evals/on-learned-errors-write/graders/save-written.md");
const mainPrd=[tu("Write",{file_path:"/x/docs/prd/p.md",content:"c"},null)],subPrd=[tu("Write",{file_path:"/x/docs/prd/p.md",content:"c"},"toolu_1"),tu("Bash",{command:"ls"},null)];
const mainEd=[tu("Edit",{replace_all:false,file_path:"/x/src/a.js",old_string:"a",new_string:"b"},null)],subEd=[tu("Edit",{replace_all:false,file_path:"/x/src/a.js",old_string:"a",new_string:"b"},"toolu_1"),tu("Agent",{prompt:"p"},null)];
const ok=[res("File created successfully at: /h/.claude/orchestrator/k/checkpoints/x.md (file state is current)")],deny=[res("Permission to use Write has been denied because Claude Code is running in do not ask mode.")];
const leok=[res("The file /h/.claude/orchestrator/k/lessons/learned-errors.md has been updated successfully. (x)")];
const chk=(name,re,L,want)=>{for(const s of both(L)){if(re.test(s)!==want){console.log("FAIL",name);process.exit(1)}}};
chk("prd main",prd,mainPrd,true);chk("prd sub",prd,subPrd,false);chk("edit main",ed,mainEd,true);chk("edit sub",ed,subEd,false);chk("edit prd main",ed,mainPrd,false);
chk("cp ok",cp,ok,true);chk("cp deny",cp,deny,false);chk("le ok",le,leok,true);chk("le deny",le,deny,false);console.log("AT6 PASS")'
```
- **AT-7** (final, after T15):
  - `git diff --quiet -- hooks/rules.md .github evals/on-small-edit evals/on-sonnet-guardrails evals/status-slash evals/on-learned-errors agents` exits 0.
  - `[ "$(wc -c < hooks/rules.md | tr -d ' ')" -le 2544 ]`.
  - `git diff -U0 -- evals/autopilot-budget-stop/graders/checkpoint.md evals/on-sonnet-prd-save/graders/prd-write.md evals/on-sonnet-prd-save/graders/planner-used.md | grep -E '^[-+](type|tool|input_match|min|max|pattern|target|flags):'` prints nothing.
  - Re-run AT-1 through AT-6.

## Risks
- **Trace-target rendering is undocumented.** The patterns were verified on raw JSONL and one-line JSON, but the grader may render the trace differently, for example truncated for long runs. The R4/R9 pilots decide; on a mismatch those graders are documented as unreliable (no silent pass).
- **`tool_used` subagent scope is from code reading** (CLI 2.1.317, function `Np`). R1 confirms. It also implies the two old `no-main-edit` graders fail on correct behaviour (see Open decisions).
- **Store writes are outside the eval run dir.** `checkpoint-written` and `save-written` are expected to FAIL locally (truthful). R10 tests a grant; if that does not work, those graders are verifiable only where `<store>` is writable.
- **Plain-`on` budget in evals:** `budget.mjs` could not read the transcript in the eval sandbox (it printed unreadable), so an eval would only exercise the notice-sum fallback. No eval is added; coverage is the validator (7d) plus a manual run.
- **Long-session cost:** after the first warning, each prompt re-reads up to 2 MB (head/tail) until the last level is reached. Sessions without usage data are silenced after one warning. It fails open, and `ORCH_LONG_REPEAT=off` disables reminders.
- **Marker format change** (empty marker becomes a level number): older hook versions only test existence, so this is compatible both ways.
- **Terse A/B** has 3 runs per arm on one question; the result is directional, not significant.
- **`plain-edit-ablation` without-arm** has no plugin. Token comparison is fair; the `with-only` graders are indicators only.
- **`team-parallel` `background` grader** proves `run_in_background`, not true concurrency.
- **`hits-update`/`new-entry` input_match** may miss unusual brief wording (false FAIL) or match a TRIAGE brief that quotes an entry-format line (unlikely; `-> CAUSE:` is required).
- **CI eval workflow** with `case='*'` now runs 11 cases; cost rises, capped by the `max_cost` input.
- **`trace-tokens.mjs`** depends on SDK trace fields (`task_started`, `task_notification`, `modelUsage`) of CLI 2.1.317; other versions print `?`.
- **Eval-structure validator** must be updated if the CLI adds grader types.

## Cannot be verified, or only partly
- Checkpoint and lesson write success inside the local eval sandbox (by design FAIL; R10 optional).
- Whether `target: trace` regex graders see raw-JSONL-like text (pilot).
- `budget=<N>k` in plain `on` end to end (sandbox blocks `budget.mjs` transcript reads); deterministic coverage only.
- The effect of the terse rule beyond a directional A/B.
- Whether a new-entry save is triggered at all (the lesson-save gate "failure, escalation, fix round, or correction" is ambiguous for a task that starts from a failing test). The `new-entry` grader result is itself the measurement.

## Open decisions for the user (not in scope; constraint: old evals not weakened or removed)
- If R1 confirms subagent counting, `on-small-edit/graders/no-main-edit.md` and `on-sonnet-guardrails/graders/no-main-edit.md` fail on correct behaviour. Option: add a trace-based `no-main-edit-trace.md` (MAIN_EDIT, `not_contains`) to those cases, and change the old graders only with explicit user approval.

## Assumptions
- Eval CLI 2.1.317 schema as extracted: `regex.target: trace`, `match: not_contains`, `tool_order.before/after: {tool, input_match}`, and `arm: with-only` on any grader. The `--json` output has the same shape as `aggregate-result.json` (`cases[].arms.<arm>[].tracePath/passed/costUsd/graders`).
- A case `model:` overrides `--model` (seen in run 15:26: the case's Sonnet ran despite the `--model claude-opus-5-5` override).
- The scaffold `HOME` for `on-learned-errors-write` is the same as for `on-learned-errors`; C1 cleans up either way.
- `rsync`, `perl` and `diff` with process substitution are available (macOS bash).
- The main session may run eval commands via Bash (verification). The `plugin-noterse` copy is created by haiku-coder `TYPE: RUN`.
