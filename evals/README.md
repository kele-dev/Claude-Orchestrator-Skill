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
5. Case `autopilot-budget-stop` and case `on-learned-errors` need Bash. Case `on-learned-errors` writes a lesson into the runner's `$HOME/.claude/orchestrator/<key>/`; delete it after a local run. Run `on-sonnet-prd-save` with `-f model=claude-sonnet-5-5`. Reviewer-after-PRD ordering is enforced by `hooks/guard-review.mjs` and smoke-tested in `scripts/validate.mjs`; it cannot be graded with `tool_used` or `regex`.

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

## Token log per plugin version

Rows are filled from `evals/ci-result.json` after a run. A token-saving claim in skills or the README needs a before and an after row for the same case and model.

| Plugin version | Date | Case | Main model | Runs | Total tokens | Cost USD | Notes |
|---|---|---|---|---|---|---|---|
| 1.9.0 | - | - | - | - | not measured | - | baseline missing |
