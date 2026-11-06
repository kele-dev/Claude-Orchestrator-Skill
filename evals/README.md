# Orchestrator eval suite

The suite checks orchestrator behavior end to end:

- Work is delegated to `orchestrator:haiku-coder`.
- The main session never edits files itself.
- Files end up changed correctly.
- Status reads are read-only.

## Case layout

Each case is a directory `<case>/` containing:

- `case.yaml` - case definition
- `prompt.md` - the user prompt sent to the session
- `fixture.sh` - sets up the starting repo state
- `graders/*.md` - grading rubrics

## Run on GitHub

1. Add the repository secret `ANTHROPIC_API_KEY`.
2. Go to Actions -> eval -> Run workflow, or run `gh workflow run eval.yml -f case='*'`.
3. Results are in the `eval-results` artifact.
4. Case `on-sonnet-guardrails` checks the rules for a non-Opus-class main session. Its `prompt.md` pins `model: claude-sonnet-5-5`; whether that overrides `--model` is not documented, so also run it with `gh workflow run eval.yml -f case='on-sonnet-*' -f model=claude-sonnet-5-5`.
5. Case `autopilot-budget-stop` and case `on-learned-errors` need Bash. Case `on-learned-errors` writes a lesson into the runner's `$HOME/.claude/orchestrator/<key>/`; delete it after a local run. Run `on-sonnet-prd-save` with `-f model=claude-sonnet-5-5`. Reviewer-after-PRD ordering is enforced by `hooks/guard-review.mjs` and smoke-tested in `scripts/validate.mjs`; it is graded with `tool_order` in `on-sonnet-prd-save/graders/review-after-prd.md`.
6. Cases added in 1.11.0: `team-parallel` (team lanes), `on-learned-errors-write` (lesson save after a verified fix; writes into `$HOME/.claude/orchestrator/<key>/` like `on-learned-errors`, delete after a local run), `delegation-startup` (per-delegation fixed token cost; `--ablation none --runs 2`), `chat-terse` (reply length; compare against a plugin copy without the terse sentence in `hooks/rules.md`), `plain-edit-ablation` (plugin value; run with `--ablation with-without`). Token rows: `node scripts/trace-tokens.mjs <result.json> --md`.

## Run locally (Linux/macOS)

Export `ANTHROPIC_API_KEY`, then run:

```sh
claude plugin eval . --case "*" --runs 1 --ablation none --scaffold --trust-plugin --allow-tools Bash Edit Write --model claude-opus-5-5 --judge-model claude-haiku-5-5 --max-cost-usd 3 --no-publish --json evals/ci-result.json
```

## Windows limitations

- Shell grants are refused because there is no sandbox backend.
- Scaffold scripts fail because the runner strips backslashes from the script path.

Run the suite on Linux, macOS or WSL.

## Cost

Every run makes real model calls. `--max-cost-usd` caps spend. Keep `--runs 1` while iterating.

Results under `evals/results/` are git-ignored.

## Grader notes

- `tool_used`/`tool_order` scope as confirmed by R1: count tool calls of the main session and of subagents (CLI 2.1.317); for main-session-only checks use `regex` with `target: trace` and `"parent_tool_use_id":null` (examples: `team-parallel/graders/no-main-edit.md`, `on-sonnet-prd-save/graders/prd-write-main.md`).
- `no-main-edit` graders in `on-small-edit` and `on-sonnet-guardrails` were converted to trace-based (`regex`, `target: trace`) in 1.11.0; they previously failed on correct delegation (see R1, main 0 Edit, subagent 2). Verified live: R1b `on-small-edit` PASS (all 4 graders); before the fix, R1 failed with "Edit called 2x" (main 0, subagent 2).
- `target: trace` pilot: R9 `prd-write-main` grader true, local regex true; R4 `no-main-edit` grader true, local regex true. They agree on positive and negative-absent cases only; a negative-hit case was not seen.
- Writes to `<store>` (checkpoints, lessons) land outside the run directory; the local sandbox denies them, so `checkpoint-written` and `save-written` FAIL there by design. R10 (extra grant for store writes) was not run, so the grant is untested and no `--allow-tools` flags are recorded.

## Token log per plugin version

Rows are filled from `evals/ci-result.json` after a run. A token-saving claim in skills or the README needs a before and an after row for the same case and model.

Total tokens and Cost USD are means per run over all models (final `modelUsage`).

| Plugin version | Date | Case | Main model | Runs | Total tokens | Cost USD | Notes |
|---|---|---|---|---|---|---|---|
| 1.9.0 | - | - | - | - | not measured | - | baseline missing |
| 1.10.0 | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | ? | 0.0000 | arm with; pass 0/1; agent startup -; reply ? chars |
| 1.10.0 | 2026-11-05 | autopilot-budget-stop | claude-opus-5-5 | 1 | ? | 0.2913 | arm with; pass 0/1; agent startup -; reply ? chars |
| 1.10.0 | 2026-11-05 | on-learned-errors | claude-opus-5-5 | 1 | ? | 0.1848 | arm with; pass 1/1; agent startup -; reply ? chars |
| 1.10.0 | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | ? | 0.0890 | arm with; pass 0/1; agent startup -; reply ? chars |
| 1.10.0 | 2026-11-05 | autopilot-budget-stop | claude-opus-5-5 | 1 | 288k | 0.2952 | arm with; pass 0/1; agent startup 10.6-11.0k; reply 1399 chars |
| 1.10.0 | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | 178k | 0.0907 | arm with; pass 0/1; agent startup 10.7-10.7k; reply 481 chars |
| 1.10.0 | 2026-11-05 | autopilot-budget-stop | claude-opus-5-5 | 1 | 288k | 0.2895 | arm with; pass 1/1; agent startup 10.6-11.1k; reply 1346 chars |
| 1.10.0 | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | 371k | 0.3205 | arm with; pass 0/1; agent startup 9.2-10.8k; reply 1330 chars |
| 1.10.0 | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | ? | 0.3181 | arm with; pass 1/1; agent startup -; reply ? chars |
| 1.11.0-dev | 2026-11-05 | on-small-edit | claude-opus-5-5 | 1 | 154k | 0.1727 | arm with; pass 0/1; agent startup 10.7-10.7k; reply 506 chars |
| 1.11.0-dev | 2026-11-05 | plain-edit-ablation | claude-opus-5-5 | 2 | 172k | 0.1782 | arm with; pass 2/2; agent startup 10.7-10.7k; reply 456 chars |
| 1.11.0-dev | 2026-11-05 | plain-edit-ablation | claude-opus-5-5 | 2 | 51k | 0.0905 | arm without; pass 2/2; agent startup -; reply 247 chars |
| 1.11.0-dev | 2026-11-05 | delegation-startup | claude-opus-5-5 | 2 | 125k | 0.1690 | arm with; pass 2/2; agent startup 10.6-10.6k; reply 55 chars |
| 1.11.0-dev | 2026-11-05 | team-parallel | claude-opus-5-5 | 1 | 267k | 0.2724 | arm with; pass 1/1; agent startup 10.8-10.8k; reply 1104 chars |
| 1.11.0-dev | 2026-11-05 | on-learned-errors-write | claude-opus-5-5 | 1 | 145k | 0.0687 | arm with; pass 0/1; agent startup 10.7-10.7k; reply 798 chars |
| 1.11.0-dev | 2026-11-05 | chat-terse | claude-opus-5-5 | 3 | 37k | 0.0969 | arm with; pass 3/3; agent startup -; reply 465 chars |
| 1.11.0-dev | 2026-11-05 | chat-terse | claude-opus-5-5 | 2 valid (1 empty, $0) | 37k | about 0.099 (valid runs; 0.0660 averaged over 3 incl. the empty run) | arm with, no-terse rules (A/B vs row above); pass 2/3; agent startup -; reply 776 chars; main out 433/415 |
| 1.11.0-dev | 2026-11-05 | autopilot-budget-stop | claude-opus-5-5 | 1 | 272k | 0.2770 | arm with; pass 0/1; agent startup 10.6-11.1k; reply 1244 chars |
| 1.11.0-dev | 2026-11-05 | on-sonnet-prd-save | claude-sonnet-5-5 | 1 | ? | 0.2361 | arm with; pass 0/1; agent startup 9.3-10.8k; reply ? chars |
| 1.11.0-dev | 2026-11-06 | multi-file-batch | claude-opus-5-5 | 2 | 162k | 0.1892 | arm with bundling+planner-budget rules (1.11.0); pass 0/2; agent startup 10.8-10.9k; reply 737 chars |
| 1.11.0-dev | 2026-11-06 | multi-file-batch | claude-opus-5-5 | 2 | 181k | 0.1927 | same plugin without those two rules (A/B copy); pass 0/2; agent startup 10.8-10.8k; reply 709 chars |

### Findings (1.11.0)

- Fixed cost per delegation (R3): about 10.6k tokens per delegation (haiku-coder startup 10.56k, cached prefix 6,258; opus-reviewer 9.08k). multi-file-batch (4 independent renames, Opus main, 2 runs each): both arms used ONE haiku-coder delegation; with rules 150k/173k tokens, $0.378 total for 2 runs; without 174k/188k, $0.385. No measurable effect of the bundling rule on an Opus main session (it already bundles); the planner Budget line and Sonnet main were not measured. 7/8 graders pass in all runs; skill-fired removed.
- Plain 1-file edit, with vs without plugin (R2, 2 runs each): 172k vs 51k tokens, $0.178 vs $0.0905, pass 2/2 in both arms.
- Terse chat A/B (R6 vs R7; R7 has 2 valid runs, run 2 empty; directional only): mean reply 465 vs 776 chars (about 40% shorter); main out tokens per run R6 245/286/302 (mean 278) vs R7 433/415 (mean 424); mean cost 0.0969 vs about 0.099.
- Team lanes (R4, 1 run): PASS; 2 background Agent calls, no main edit, both modules done; 267k tokens, $0.272. Learned-errors write (R5, 1 run): FAIL; no lesson-save delegation ran because the task had no failure or escalation, so nothing was saved ($0.069).
- Sonnet main (R9, 1 run): skipped opus-planner (`planner-used` FAIL, 0 Agent calls) and wrote the PRD itself; `prd-write-main` and `review-after-prd` passed. `prd-write-main` proves a main-thread PRD save, not that it came from the planner. The planner skip is not a v1.10.1 regression: the HEAD copy (v1.10.0, `git archive`) also failed `planner-used` 2/2 (R9h, 2 runs, $0.745). Sonnet main writes the PRD itself. `skills/on/SKILL.md` line 16 was reworded in 1.11.0 ("the PRD ALWAYS comes from opus-planner; never draft it yourself"); R9c (1 run) still failed `planner-used`, so the wording has no proven effect. 3 earlier runs (R9b) timed out at 1200s; the case timeout was raised to 2700s in `prompt.md`. Root cause open: Sonnet ignoring the rule, or the planner being too slow for the eval. R9c trace: the Sonnet main wrote `docs/prd/*.md` itself and used opus-reviewer to review it (it did not call opus-planner); cause = Sonnet chooses to self-write the PRD, not a timeout (thinking not recorded).
- Honest checkpoint grader (R8, 1 run): `checkpoint-written` FAIL (sandbox denied the write) while the old `checkpoint` grader PASSED, confirming the old grader was weak.
