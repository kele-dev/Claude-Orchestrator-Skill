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
