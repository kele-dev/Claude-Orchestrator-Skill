# Claude Orchestrator Skill

Bahasa Indonesia: plugin ini membalas dalam bahasa pengguna. Lihat [ringkasan](#ringkasan-bahasa-indonesia).

Claude Code plugin for token-saving orchestration: the main session (any model; Opus-class recommended) thinks and writes the PRD, `haiku-coder` executes, and `sonnet-dev` handles escalation. The main session never edits code itself.
Runs on Windows, macOS, and Linux.

## Installation

### Prerequisites

- Claude Code.
- Node 18+ on PATH (hooks: guards, trim, session info; without it they do nothing).
- git 2.31+ (project store key).
- bash for `verify.sh` (Git Bash on Windows), or `verify.ps1` with PowerShell when Git Bash is missing.

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

Update: `claude plugin update orchestrator@kele-dev`. Start a new session after updating.

Uninstall: `claude plugin uninstall orchestrator@kele-dev`. The per-project store in `~/.claude/orchestrator/` (lessons, checkpoints) is kept; delete it by hand if you no longer need it.

## Usage

Orchestration mode is active automatically in every session. Manual commands:

- `/orchestrator:on` - turn on (or `/orchestrator:on <task>` to give a task directly); optional `budget=<N>k` (e.g. `/orchestrator:on budget=50k <task>`) stops before the next group once the budget script reports OVER, with status BUDGET and a checkpoint. See the legend under the token example (Token-saving defaults) for `?` and `UNKNOWN`.
- `/orchestrator:off` - turn off for the rest of this session (Claude works directly as usual)
- `/orchestrator:team <task>` - parallel mode: the main session splits the work into lanes that own separate files, Haiku lanes run at the same time, only failed lanes are retried. Caps: 3 lanes (4 only at plan time, when the work has 4 or more independent, file-disjoint parts), 2 fix rounds per lane, raised automatically up to 4 rounds only while fixes make progress (a cap you set, e.g. `lanes=N`, is never raised; optional `budget=<N>k` stops with status BUDGET and a checkpoint once the agents' total tokens reach it). Lanes that need each other's files cooperate through the main session. Add `--dry-run` to see the lane plan first. When the PRD has a task table, the lane plan comes from `scripts/plan-dag.mjs`. `isolate=worktree` (opt-in) runs each lane in its own git worktree; needs `worktree.baseRef` set to `"head"` in settings, no uncommitted tracked changes outside `docs/prd/`, and `commit=batch` on, otherwise it warns and uses the shared tree; passed lanes are copied back into the main tree.
- `/orchestrator:autopilot <task>` - autonomous mode: one short clarification round, a PRD, then batch after batch without asking in between, until done or a cap is hit. Caps: 5 batches, 2 fix rounds per batch, raised automatically up to 8 batches / 4 rounds only while work keeps passing (a cap you set, e.g. `batches=N`, is never raised; optional `budget=<N>k` stops with status BUDGET and a checkpoint once the agents' total tokens reach it). Add `--dry-run` to see the plan first.
- Claude suggests `team` or `autopilot` when a task fits, but always starts in `on` mode; you decide whether to switch.
- `/orchestrator:learn [list | add <lesson> | remove <lesson> | prune]` - project lessons: at the end of a task Claude decides by itself whether to save up to 3 verified lessons (working test commands, root causes, pitfalls) and fixes or removes outdated ones, as local files in the project store (see Data location below), so every later session in that project can read them, also from a git worktree. Nothing is written into the repo. Old `.claude/skills/learned-*` lessons are still read and copied into the store on the next save.
- `/orchestrator:init [--refresh]` - maps a new project in one cheap Haiku pass: stack, key folders, and verified test/build/lint commands, saved as the `learned-map` lesson. It also writes `verify.sh` in the project store (or `verify.ps1` with PowerShell when Git Bash is missing), one command that runs the verified checks and prints `VERIFY: PASS|FAIL`.
- `/orchestrator:resume [<name>]` - continues long work from a checkpoint after a context limit, rate limit, `/compact`, or crash. team/autopilot write checkpoints automatically at stops and between waves/batches. Checkpoints are kept in the project store.
- `/orchestrator:status` - read-only summary: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps.
- `/orchestrator:help` - short list of commands, kill switches and where the docs live (release notes: [CHANGELOG.md](CHANGELOG.md))
- `commit=batch` (team/autopilot) - one local commit per passed wave or batch, with a conventional message; never pushed.

**Data location:** lessons, checkpoints, and `verify.sh` are stored per project in `~/.claude/orchestrator/<project-key>/` (`lessons/`, `checkpoints/`, `verify.sh`). This store is shared by the main checkout and all git worktrees, is never committed, and needs no git ignore entries. The `<project-key>` comes from the git remote origin URL (credentials stripped), so separate clones of one repo share a store; without a remote it comes from the folder path, and an existing path-based folder keeps being used even if a remote-based folder also exists. Older lessons in the project's `.claude/` folders are still read and copied into the store on the next lesson save (per topic missing from the store). Older checkpoints are not migrated: `resume` and `status` still read them and mark them as legacy; delete them yourself once that work is finished.

### Token-saving defaults
- Concise answers: no preamble, no restated plan, tables or bullets; detail only when you ask.
- Test/build output is trimmed before it reaches the main session; large suites are run by Haiku, which reports only PASS/FAIL and the first error.
- The main session dictates exact text only for small edits; for long content it writes a spec and the executor writes the file.
- One self-review pass before reporting on full-path or multi-file doc/config work, so you need fewer review rounds.
- A `learned-map` lesson (max 20 lines) remembers the project layout and commands, so new sessions skip re-exploring.
- Claude suggests a new session or `/compact` when you switch to an unrelated task.
- Every report ends with one token line per agent, e.g. `Tokens: audit Explore 96k · batch1 haiku-coder 12k · 3 delegations, total ≈125k`.

`?` means that agent's completion notice had no usage data; `UNKNOWN` (budget) means the total could not be counted because some agents lack usage or the transcript was unreadable.

- Code questions and test-failure triage go to Haiku; the main session reads only a short answer with file:line references.
- Briefs start with a type (`TYPE: EDIT | CREATE | RUN | TRIAGE | SCAN | COMMIT | APPLY`) that Haiku already knows, so briefs stay short.
- Before verifying a larger change, Haiku scans the diff for mechanical mistakes; the main session reads only the flagged hunks and the main logic.
- In a long conversation Claude writes a checkpoint and suggests continuing in a new session.
- Always-loaded rules are smaller: `hooks/rules.md` is shortened, and `orchestrator:on` is split into a core plus an on-demand `reference.md`.
- A long-session warning appears when the context grows by 120k tokens, again at +250k and +400k (`ORCH_LONG_REPEAT`: comma list or `off`), suggesting a checkpoint and a new session (from message usage; 2 MB transcript size if usage is missing) or after 30 delegations (`ORCH_LONG=off`, `ORCH_LONG_TOKENS`, `ORCH_LONG_BYTES`, `ORCH_LONG_DELEGATIONS`); `scripts/digest.mjs` gives planners a compact conversation summary.
- `node scripts/otel-export.mjs <transcript.jsonl> [--out <file>]` exports a session as OTLP/JSON spans (OpenTelemetry GenAI conventions: agent calls, tool calls, token usage; no prompts, message text or tool output) for Jaeger, Langfuse or Grafana.

### Hooks

- Session info: SessionStart prints the project store path, a one-line index of saved lessons (at most 10, then a "+N more" count), the 5 newest checkpoints, and a note when legacy files exist, so Claude needs no extra tool calls to find them. Needs Node 18+; without Node the skills compute the path themselves.
- Output trim: Bash/PowerShell output is trimmed only when it is over 80 lines AND over 4000 chars. It keeps the first 3 lines (10 when the command failed or any output line looks like an error), up to 10 error/failure lines, and the last 30 lines before the model sees it. `git diff/show`, `cat`, `jq`, `Get-Content`, `type`, and JSON output are not line-trimmed (a ~26k-char cap still applies to everything). Read, list and search commands at the start of a statement (`ls`, `find`, `git ls-files`, `grep`, `rg`, `head`, `tail`, `sed -n`, `wc`, `Get-ChildItem`, `Select-String`) are line-trimmed only above 300 lines. Add `# notrim` to a command, or set env `ORCH_NO_TRIM=1`, for full output. Env `ORCH_TRIM_TAIL` and `ORCH_TRIM_ERRORS` change the 30 and the 10.
- Edit guard: the main session cannot Edit/Write project files (except `docs/prd/`); subagents can. Turn it off with `/orchestrator:off` or env `ORCH_GUARD=off`.
- Guard limits: the edit guard keeps orchestration discipline; it is not a security boundary. It checks only Edit/Write/NotebookEdit (shell writes such as `sed -i` or `>` are not checked), any subagent may edit, and `/orchestrator:off` is user-only (the skill sets `disable-model-invocation: true`). Subagents are not guarded at all: executors (haiku-coder, sonnet-dev) can edit and run any shell command by design, and the read-only agents (opus-planner, opus-reviewer) keep Bash for git and test commands, limited only by their instructions.
- Security reports: see [SECURITY.md](SECURITY.md).
- Debugging: hooks fail open and print nothing on errors; set env `ORCH_DEBUG=1` to write swallowed errors to stderr (top-level failures plus failed file, git and transcript reads in guard-edit, long-session and session-info). Messages are shortened and quoted input is masked; `ORCH_DEBUG=2` prints full stacks (may include input, do not paste publicly). The same lines are appended to `<tmpdir>/orchestrator-debug.log` (stops at 256 KB), because hook stderr on exit 0 is not shown in chat. Env `ORCH_STALE_DAYS` (default 14) sets how many days a lesson or checkpoint may be old before session start marks it stale; env `ORCH_STATE_DIR` moves the hooks' marker and state files (default: a private per-user dir under the OS temp dir).
- The edit guard, read guard and output trim need Node 18+ on PATH. Without Node they do nothing (fail open). macOS desktop app: Node from nvm or Homebrew may be missing from the app's PATH; check that `/orchestrator:status` shows `Guards: active` (the session-start `Guards:` line comes only from the hooks), or install Node system-wide.
- Hook messages are in English; the model is told to relay them in the user's language.
- Review guard (`guard-review`): a PreToolUse hook on Agent/Task that denies `orchestrator:opus-reviewer` when its prompt names a `docs/prd/*.md` file that does not exist. It fails open when Node is missing or the check cannot run. Turn it off with env `ORCH_GUARD=off`.
- Read guard (`guard-read`): a PreToolUse hook on Read. A main-session Read without `offset`/`limit` of a file over 2000 lines or 100 KB is denied once per file per session, with a hint to use `offset`/`limit`, Grep or the Explore agent; repeating the same Read is allowed. Subagents are not affected. Fails open. Inactive after `/orchestrator:off`. Turn it off with env `ORCH_READ_GUARD=off`.

## Plugin contents

- Skills `on` and `off`: the PRD -> delegate -> escalate -> review flow, and the switch to turn it off.
- Skills `team` and `autopilot` (user-invoked only): parallel and autonomous modes on top of `on`, with hard caps to keep token cost bounded.
- Skill `learn`: project lessons saved and maintained automatically as local files in the project store; one report line tells you what changed, and the manual commands are optional.
- Skills `init`, `resume`, and `status`: one-pass project map, checkpoints to continue in a new session, and a read-only state summary.
- Agents `haiku-coder` (executor), `sonnet-dev` (escalation), `opus-reviewer` (review, read-only; now runs on Opus), `opus-planner` (hard-design PRD and diagnosis when the main session is not Opus-class, read-only).
- Hooks: SessionStart rules (loads the orchestration rules into every session), SessionStart session info (store path, lesson index, open checkpoints), edit guard (PreToolUse), review guard (PreToolUse, Agent/Task), read guard (PreToolUse, Read), output trim (PostToolUse), long-session reminder (UserPromptSubmit), delegation ledger (SubagentStop, appends one line per delegation to `delegations.jsonl` in the project store). The status LEDGER row shows the pass rate per tier from that file; `unknown` means no STATUS line was found and is not counted as a failure.

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
- Prasyarat: Node 18+ di PATH, git 2.31+, bash (Git Bash di Windows); setelah update buka sesi baru; uninstall tidak menghapus ~/.claude/orchestrator/.
- Aktifkan: `/orchestrator:on`
- Matikan untuk sesi ini: `/orchestrator:off`
- Mode paralel: `/orchestrator:team <tugas>` (beberapa lane Haiku jalan bersamaan, maks 3 lane, 2 putaran fix per lane)
- Mode otomatis: `/orchestrator:autopilot <tugas>` (batch demi batch tanpa bertanya, maks 5 batch, 2 putaran fix per batch)
- Tambahkan `--dry-run` untuk melihat rencananya dulu.
- `/orchestrator:init` - memetakan proyek sekali dan menulis learned-map
- `/orchestrator:resume <slug>` - melanjutkan dari checkpoint di sesi baru
- `/orchestrator:status` - ringkasan read-only: mode, versi, guard, store, lessons, checkpoint
- `/orchestrator:help` - daftar singkat perintah, kill switch, dan lokasi dokumen
- `budget=<N>k` - batas token untuk semua delegasi
- Edit guard: sesi utama tidak bisa Edit/Write file proyek kecuali `docs/prd/`; subagent boleh; matikan dengan `/orchestrator:off` atau env `ORCH_GUARD=off`.
- Batas guard: guard menjaga disiplin orkestrasi, bukan batas keamanan; hanya Edit/Write/NotebookEdit yang dicek, penulisan lewat shell tidak dicek.
- `commit=batch` (team/autopilot): satu commit lokal per wave/batch yang lulus, tidak pernah di-push.
- Lokasi data: lessons, checkpoint dan `verify.sh` disimpan per project di `~/.claude/orchestrator/<project-key>/`, dipakai bersama semua worktree, tidak pernah di-commit.
- cek `Guards: active` di `/orchestrator:status` (tanpa Node guard mati diam-diam)
- `ORCH_DEBUG=1` menulis error hook ke stderr dan menambahkannya ke `<tmpdir>/orchestrator-debug.log` (berhenti di 256 KB), karena stderr hook pada exit 0 tidak tampil di chat
- `node scripts/otel-export.mjs <transcript.jsonl> [--out <file>]` mengekspor sesi sebagai span OTLP/JSON (konvensi GenAI OpenTelemetry: panggilan agent, tool, pemakaian token; tanpa isi prompt, pesan atau output tool) untuk Jaeger, Langfuse atau Grafana.
- Read guard (`guard-read`): Read sesi utama tanpa `offset`/`limit` untuk file di atas 2000 baris atau 100 KB ditolak sekali per file per sesi (gunakan `offset`/`limit`, Grep, atau agent Explore); Read yang sama diulang diizinkan; subagent tidak terpengaruh; matikan dengan `ORCH_READ_GUARD=off`
- Claude akan menyarankan team/autopilot kalau tugasnya cocok, tapi default tetap `on`. Batas iterasi naik otomatis (maks 4 putaran fix) hanya selama perbaikannya ada kemajuan.
- Belajar: di akhir tugas Claude sendiri yang memutuskan pelajaran mana yang disimpan (maks 3, hanya yang sudah terbukti), serta memperbaiki atau menghapus yang usang, sebagai file lokal di store project (`~/.claude/orchestrator/<project-key>/lessons/`). Satu baris di laporan memberi tahu apa yang berubah. `/orchestrator:learn list` untuk melihat, `prune` untuk merapikan.
- Hemat token: jawaban ringkas, output test dipotong, Opus tidak mendikte file panjang, self-review sebelum lapor, `learned-map` untuk peta project, saran sesi baru saat ganti topik, dan satu baris laporan token di akhir.
- Baru di 1.15.0: total TRIM di status, eval hanya untuk case terpilih, batas 10 lesson saat sesi mulai, read guard mengikuti `/orchestrator:off`, dan perbaikan ledger serta CI; daftar lengkap ada di [CHANGELOG.md](CHANGELOG.md).
Release notes per version: see [CHANGELOG.md](CHANGELOG.md).
- Mode orkestrasi aktif otomatis di setiap sesi.

## Maintainers

Releasing: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json` on every release so `claude plugin update` picks it up. Run `node scripts/validate.mjs` before pushing (Node 18+, no dependencies); CI runs the same check on pushes to `main` and on pull requests. Release notes go in `CHANGELOG.md` (add the new `Baru di X.Y.Z` line there after the newest one; the validator requires ascending order); in the README replace the single current `Baru di X.Y.Z` line with the new version.

## License

MIT, see [LICENSE](LICENSE).
