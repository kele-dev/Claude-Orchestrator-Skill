# Claude Orchestrator Skill

Bahasa Indonesia: plugin ini membalas dalam bahasa pengguna. Lihat [ringkasan](#ringkasan-bahasa-indonesia).

Claude Code plugin for token-saving orchestration: Opus thinks and writes the PRD, `haiku-coder` executes, and `sonnet-dev` handles escalation. Opus never edits code itself.
Runs on Windows, macOS, and Linux.

## Installation

**Terminal (Windows, macOS, Linux)** - one command:

```bash
claude plugin install orchestrator --marketplace kele-dev/Claude-Orchestrator-Skill
```

If your version of Claude Code does not support the command above, use these two commands:

```bash
claude plugin marketplace add kele-dev/Claude-Orchestrator-Skill
claude plugin install orchestrator@kele-dev
```

Inside a `claude` session you can also run: `/plugin marketplace add kele-dev/Claude-Orchestrator-Skill`, then `/plugin install orchestrator@kele-dev`.

**Claude Desktop (Code tab)** - click `+` next to the prompt box, select **Add plugins**, add the marketplace `kele-dev/Claude-Orchestrator-Skill`, then install `orchestrator` with **User** scope.

After installing, start a new session (Opus recommended as the main model). User scope means it applies to all projects.

Update: `claude plugin update orchestrator@kele-dev`. Uninstall: `claude plugin uninstall orchestrator@kele-dev`.

## Usage

Orchestration mode is active automatically in every session. Manual commands:

- `/orchestrator:on` - turn on (or `/orchestrator:on <task>` to give a task directly)
- `/orchestrator:off` - turn off for the rest of this session (Claude works directly as usual)
- `/orchestrator:team <task>` - parallel mode: Opus splits the work into lanes that own separate files, Haiku lanes run at the same time, only failed lanes are retried. Caps: 3 lanes, 2 fix rounds per lane, raised automatically up to 4 lanes / 4 rounds only while fixes make progress (a cap you set, e.g. `lanes=N`, is never raised). Lanes that need each other's files cooperate through Opus. Add `--dry-run` to see the lane plan first.
- `/orchestrator:autopilot <task>` - autonomous mode: one short clarification round, a PRD, then batch after batch without asking in between, until done or a cap is hit. Caps: 5 batches, 2 fix rounds per batch, raised automatically up to 8 batches / 4 rounds only while work keeps passing (a cap you set, e.g. `batches=N`, is never raised). Add `--dry-run` to see the plan first.
- Claude suggests `team` or `autopilot` when a task fits, but always starts in `on` mode; you decide whether to switch.
- `/orchestrator:learn [list | add <lesson> | prune]` - project lessons: at the end of a task Claude decides by itself whether to save up to 3 verified lessons (working test commands, root causes, pitfalls) and fixes or removes outdated ones, as local `learned-*` skills in the main checkout's `.claude/skills/` (also when a session runs in a git worktree), so every later session in that project can read them. They stay out of git via the repo's shared `info/exclude`.

### Token-saving defaults
- Concise answers: no preamble, no restated plan, tables or bullets; detail only when you ask.
- Test/build output is trimmed before it reaches Opus; large suites are run by Haiku, which reports only PASS/FAIL and the first error.
- Opus dictates exact text only for small edits; for long content it writes a spec and the executor writes the file.
- One self-review pass before every report, so you need fewer review rounds.
- A `learned-map` lesson (max 20 lines) remembers the project layout and commands, so new sessions skip re-exploring.
- Claude suggests a new session or `/compact` when you switch to an unrelated task.
- Every report ends with one token line, e.g. `Tokens: haiku 45k · sonnet 0 · 6 delegations`.

## Plugin contents

- Skills `on` and `off`: the PRD -> delegate -> escalate -> review flow, and the switch to turn it off.
- Skills `team` and `autopilot` (user-invoked only): parallel and autonomous modes on top of `on`, with hard caps to keep token cost bounded.
- Skill `learn`: project lessons saved and maintained automatically as local skills; one report line tells you what changed, and the manual commands are optional.
- Agents `haiku-coder` (executor), `sonnet-dev` (escalation), `opus-reviewer` (review, read-only).
- A session-start hook that loads the orchestration rules into every session.

## Optional: reduce permission prompts

The plugin cannot change permissions. To keep subagents from waiting for approval so often, pick the **Accept edits** mode when opening a session, or add this to `~/.claude/settings.json`:

```json
{ "permissions": { "defaultMode": "acceptEdits", "allow": ["Bash(npm test *)", "Bash(git diff *)", "Bash(git status *)"] } }
```

`/orchestrator:team` runs its lanes as background subagents, which cannot show you permission prompts. Use it with **Accept edits** (or auto) mode, or a lane may fail when an edit or command needs approval.

## Moving from the old installer version

If you previously installed via `install.ps1`, delete `haiku-coder.md`, `sonnet-dev.md`, and `opus-reviewer.md` from `~/.claude/agents/`, the folder `~/.claude/skills/orkestrator/`, and the `BEGIN/END:orkestrasi` block in `~/.claude/CLAUDE.md`.

## Ringkasan (Bahasa Indonesia)

- Pasang: `claude plugin install orchestrator --marketplace kele-dev/Claude-Orchestrator-Skill`
- Aktifkan: `/orchestrator:on`
- Matikan untuk sesi ini: `/orchestrator:off`
- Mode paralel: `/orchestrator:team <tugas>` (beberapa lane Haiku jalan bersamaan, maks 3 lane, 2 putaran fix per lane)
- Mode otomatis: `/orchestrator:autopilot <tugas>` (batch demi batch tanpa bertanya, maks 5 batch, 2 putaran fix per batch)
- Tambahkan `--dry-run` untuk melihat rencananya dulu.
- Claude akan menyarankan team/autopilot kalau tugasnya cocok, tapi default tetap `on`. Batas iterasi naik otomatis (maks 4 putaran fix) hanya selama perbaikannya ada kemajuan.
- Belajar: di akhir tugas Claude sendiri yang memutuskan pelajaran mana yang disimpan (maks 3, hanya yang sudah terbukti), serta memperbaiki atau menghapus yang usang, sebagai skill lokal `learned-*` di project. Satu baris di laporan memberi tahu apa yang berubah. `/orchestrator:learn list` untuk melihat, `prune` untuk merapikan.
- Hemat token: jawaban ringkas, output test dipotong, Opus tidak mendikte file panjang, self-review sebelum lapor, `learned-map` untuk peta project, saran sesi baru saat ganti topik, dan satu baris laporan token di akhir.
- Mode orkestrasi aktif otomatis di setiap sesi.

## Maintainers

Releasing: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json` on every release so `claude plugin update` picks it up.

## License

MIT, see [LICENSE](LICENSE).
