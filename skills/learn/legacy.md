# orchestrator:learn legacy rules

## Legacy (v1.6.0 and older; removal planned in v1.8.0)
All legacy rules live here; other skills only point to this section.
- `<main>` = parent of the absolute git-common-dir (outside git: the current folder).
- Legacy lessons: `<main>/.claude/skills/learned-<topic>/SKILL.md`. Read per topic (frontmatter first, full text only when relevant) for topics not in the store.
- Every save (learn or init) first copies each legacy topic missing from the store to `<store>/lessons/learned-<topic>.md` (same frontmatter and lines), in the same delegation. Topics already in the store are never overwritten.
- Legacy checkpoints: `<main>/.claude/orchestrator/checkpoints/*.md`. `resume` and `status` read them, marked "(legacy)"; they are not migrated, and the user may delete them once finished.
- Never delete legacy files from a worktree session.
- `init` skips when a legacy `learned-map` exists (unless `--refresh`).
- After the legacy lessons are copied into the store, the user may delete the old `<main>/.claude/skills/learned-*` folders (never from a worktree session).
