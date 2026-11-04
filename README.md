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

## Plugin contents

- Skills `on` and `off`: the PRD -> delegate -> escalate -> review flow, and the switch to turn it off.
- Agents `haiku-coder` (executor), `sonnet-dev` (escalation), `opus-reviewer` (review, read-only).
- A session-start hook that loads the orchestration rules into every session.

## Optional: reduce permission prompts

The plugin cannot change permissions. To keep subagents from waiting for approval so often, pick the **Accept edits** mode when opening a session, or add this to `~/.claude/settings.json`:

```json
{ "permissions": { "defaultMode": "acceptEdits", "allow": ["Bash(npm test *)", "Bash(git diff *)", "Bash(git status *)"] } }
```

## Moving from the old installer version

If you previously installed via `install.ps1`, delete `haiku-coder.md`, `sonnet-dev.md`, and `opus-reviewer.md` from `~/.claude/agents/`, the folder `~/.claude/skills/orkestrator/`, and the `BEGIN/END:orkestrasi` block in `~/.claude/CLAUDE.md`.

## Ringkasan (Bahasa Indonesia)

- Pasang: `claude plugin install orchestrator --marketplace kele-dev/Claude-Orchestrator-Skill`
- Aktifkan: `/orchestrator:on`
- Matikan untuk sesi ini: `/orchestrator:off`
- Mode orkestrasi aktif otomatis di setiap sesi.

## Maintainers

Releasing: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json` on every release so `claude plugin update` picks it up.

## License

MIT, see [LICENSE](LICENSE).
