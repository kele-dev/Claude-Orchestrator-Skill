# learn: reference (read only when pointed here)

## Store command
- Get it with exactly this one Bash command (prints an absolute path, `C:/...` on Windows Git Bash). Run it once per task and paste the result into every brief:
  ```bash
  m=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && m=$(dirname "$m") || m=$(pwd -W 2>/dev/null || pwd); h=$(cygpath -m ~ 2>/dev/null || echo ~); k=$(printf %s "$m" | tr A-Z a-z | sed 's/[^a-z0-9][^a-z0-9]*/-/g' | tr -d '\n' | tail -c 80); echo "$h/.claude/orchestrator/$k"
  ```
- Without Bash (PowerShell only), run this instead; it prints the same path:
  ```powershell
  $m = $null; try { $m = git rev-parse --path-format=absolute --git-common-dir 2>$null } catch {}; if ($LASTEXITCODE -eq 0 -and $m) { $m = Split-Path $m -Parent } else { $m = (Get-Location).Path }; $k = $m.ToLower() -replace '[^a-z0-9]+','-'; if ($k.Length -gt 80) { $k = $k.Substring($k.Length - 80) }; ($HOME -replace '\\','/') + '/.claude/orchestrator/' + $k
  ```
- Key rule (both shells): main checkout = parent of the absolute git-common-dir (outside git: the current folder); lowercase; every run of characters outside `[a-z0-9]` becomes one `-`; keep the last 80 characters (Windows path limit). Needs git 2.31+. Example: `C:/Users/me/Projects/My App` -> `C:/Users/me/.claude/orchestrator/c-users-me-projects-my-app`.

## Manual commands
- `list`: show every `learned-*` lesson file with its lesson count and the lesson lines, in one compact block.
- `add <lesson>`: check it against "What counts as a lesson", then save it per SKILL.md (What counts as a lesson / save rules).
- `prune`: check every lesson against the current project (commands and files still exist, no duplicates, nothing contradicted by recent work), then merge, fix, or remove automatically and report what changed in one short block. `learned-errors` over 15 entries: remove the fewest-hit entries first (missing `hits:` = 0; ties: oldest date).
