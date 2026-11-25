# Maestro workers (read on demand from `skills/maestro/SKILL.md`)

## Routing by task type
| Task type | Profile | Worker | Effort |
|---|---|---|---|
| Write or change code | `code` | codex | high |
| Fix a known bug or failing check | `fix` | codex | medium |
| Review a diff or PRD | `review` | gemini | high |
| Read and analyze files | `read` | gemini | medium |

Gemini never writes files and never gets tools. It receives content on stdin only.

## Profiles (default effort)
| Profile | Worker | Default effort |
|---|---|---|
| `code` | codex | high |
| `fix` | codex | medium |
| `review` | gemini | high |
| `read` | gemini | medium |

## Override order
1. Call flag (`--effort`, `--model`, `--profile`), highest.
2. Project config (`<store>/maestro.json`).
3. Global config (`~/.claude/orchestrator/maestro.json`).
4. Defaults (table above), lowest.

`enabled` is read from the project config only. An empty `model` means automatic. Gemini model ids must start with `gemini-`.
`codex.windowsSandbox` (default `elevated`) is passed on Windows as `-c windows.sandbox=...` because `--ignore-user-config` drops the user's own setting; set it to an empty string to omit the flag.

## Status -> action
| Status | Worker | Action |
|---|---|---|
| PASS | codex, gemini | Codex: review `git diff` of the task files, run the project check. Gemini: read the findings and decide each. |
| FAIL | codex, gemini | One retry with a fixed brief; then the `orchestrator:on` ladder (`haiku-coder`, then `sonnet-dev`) with the failed summary in the brief. |
| VIOLATION | codex, gemini | Same as FAIL. Files changed outside `--files` or the tree changed during the run; the working tree is left as it was. |
| QUOTA | codex, gemini | No retry on that worker. Codex tasks go to the ladder; Gemini tasks go to `Explore` (haiku). One line to the user. |
| DENIED | gemini | Retry once with "you have no tools; answer from the content below"; then `Explore`. |
| CONFLICT | codex | Re-run once on the current tree; then `sonnet-dev`. |
| TIMEOUT | codex, gemini | Split the task smaller once; then the ladder. |
| DISABLED | codex, gemini | Back to setup (`SKILL.md` step 0). |

## Secret paths (skipped for Gemini; matched by basename)
`.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `.npmrc`, `.netrc`, `.pypirc`, `secrets.*`, `credentials*`.

Skipped paths are listed in the summary `skipped` field.

## Privacy note
- Code is sent to OpenAI (Codex) and Google (Gemini through Antigravity CLI).
- Codex sees every tracked file, including tracked secrets. Secret-path skipping applies to Gemini only.
- Maestro is opt-in per project (`on`); turn it off with `off`.
- Both CLIs use the user's own subscription login. No API keys.
