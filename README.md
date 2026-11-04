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
- `/orchestrator:learn [list | add <lesson> | prune]` - project lessons: at the end of a task Claude decides by itself whether to save up to 3 verified lessons (working test commands, root causes, pitfalls) and fixes or removes outdated ones, as local files in the project store (see Data location below), so every later session in that project can read them, also from a git worktree. Nothing is written into the repo. Old `.claude/skills/learned-*` lessons are still read and copied into the store on the next save.
- `/orchestrator:init [--refresh]` - maps a new project in one cheap Haiku pass: stack, key folders, and verified test/build/lint commands, saved as the `learned-map` lesson. It also writes `verify.sh` in the project store, one command that runs the verified checks and prints `VERIFY: PASS|FAIL`.
- `/orchestrator:resume [<name>]` - continues long work from a checkpoint after a context limit, rate limit, `/compact`, or crash. team/autopilot write checkpoints automatically at stops and between waves/batches. Checkpoints are kept in the project store.
- `/orchestrator:status` - read-only summary: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps.
- `commit=batch` (team/autopilot) - one local commit per passed wave or batch, with a conventional message; never pushed.

**Data location:** lessons, checkpoints, and `verify.sh` are stored per project in `~/.claude/orchestrator/<project-key>/` (`lessons/`, `checkpoints/`, `verify.sh`). This store is shared by the main checkout and all git worktrees, is never committed, and needs no git ignore entries. Older lessons in the project's `.claude/` folders are still read and copied into the store on the next lesson save (per topic missing from the store). Older checkpoints are not migrated: `resume` and `status` still read them and mark them as legacy; delete them yourself once that work is finished.

### Token-saving defaults
- Concise answers: no preamble, no restated plan, tables or bullets; detail only when you ask.
- Test/build output is trimmed before it reaches Opus; large suites are run by Haiku, which reports only PASS/FAIL and the first error.
- Opus dictates exact text only for small edits; for long content it writes a spec and the executor writes the file.
- One self-review pass before reporting on full-path or multi-file doc/config work, so you need fewer review rounds.
- A `learned-map` lesson (max 20 lines) remembers the project layout and commands, so new sessions skip re-exploring.
- Claude suggests a new session or `/compact` when you switch to an unrelated task.
- Every report ends with one token line, e.g. `Tokens: haiku 45k · sonnet 0 · 6 delegations`.
- Code questions and test-failure triage go to Haiku; Opus reads only a short answer with file:line references.
- Briefs start with a type (`TYPE: EDIT | CREATE | RUN | TRIAGE | SCAN | COMMIT`) that Haiku already knows, so briefs stay short.
- Before verifying a larger change, Haiku scans the diff for mechanical mistakes; Opus reads only the flagged hunks and the main logic.
- In a long conversation Claude writes a checkpoint and suggests continuing in a new session.
- Always-loaded rules are smaller: `hooks/rules.md` is shortened, and `orchestrator:on` is split into a core plus an on-demand `reference.md`.

### Hooks

- Session info: SessionStart prints the project store path, a one-line index of saved lessons (at most 20), the 5 newest checkpoints, and a note when legacy files exist, so Claude needs no extra tool calls to find them. Needs Node 18+; without Node the skills compute the path themselves.
- Output trim: Bash/PowerShell output is trimmed only when it is over 80 lines AND over 4000 chars. It keeps the first 3 lines, up to 10 error/failure lines, and the last 30 lines before the model sees it. `git diff/show`, `cat`, `jq`, `Get-Content`, `type`, and JSON output are not line-trimmed (a ~26k-char cap still applies to everything). Add `# notrim` to a command, or set env `ORCH_NO_TRIM=1`, for full output. Env `ORCH_TRIM_TAIL` and `ORCH_TRIM_ERRORS` change the 30 and the 10.
- Edit guard: the main session cannot Edit/Write project files (except `docs/prd/`); subagents can. Turn it off with `/orchestrator:off` or env `ORCH_GUARD=off`.
- The edit guard and output trim need Node 18+ on PATH. Without Node they do nothing (fail open).

## Plugin contents

- Skills `on` and `off`: the PRD -> delegate -> escalate -> review flow, and the switch to turn it off.
- Skills `team` and `autopilot` (user-invoked only): parallel and autonomous modes on top of `on`, with hard caps to keep token cost bounded.
- Skill `learn`: project lessons saved and maintained automatically as local files in the project store; one report line tells you what changed, and the manual commands are optional.
- Skills `init`, `resume`, and `status`: one-pass project map, checkpoints to continue in a new session, and a read-only state summary.
- Agents `haiku-coder` (executor), `sonnet-dev` (escalation), `opus-reviewer` (review, read-only).
- Hooks: SessionStart rules (loads the orchestration rules into every session), SessionStart session info (store path, lesson index, open checkpoints), edit guard (PreToolUse), output trim (PostToolUse).

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
- Belajar: di akhir tugas Claude sendiri yang memutuskan pelajaran mana yang disimpan (maks 3, hanya yang sudah terbukti), serta memperbaiki atau menghapus yang usang, sebagai file lokal di store project (`~/.claude/orchestrator/<project-key>/lessons/`). Satu baris di laporan memberi tahu apa yang berubah. `/orchestrator:learn list` untuk melihat, `prune` untuk merapikan.
- Hemat token: jawaban ringkas, output test dipotong, Opus tidak mendikte file panjang, self-review sebelum lapor, `learned-map` untuk peta project, saran sesi baru saat ganti topik, dan satu baris laporan token di akhir.
- Baru di 1.4: `/orchestrator:init` (peta project sekali jalan), `/orchestrator:resume` (lanjut dari checkpoint), `commit=batch`, riset/triase oleh Haiku, tipe brief, dan scan diff oleh Haiku sebelum Opus memverifikasi.
- Baru di 1.5: `/orchestrator:status` (ringkasan status read-only), aturan orkestrasi kini juga dimuat saat sesi di-resume, dan validator plugin `node scripts/validate.mjs` + CI.
- Baru di 1.6: hook pemangkas output (Bash/PowerShell di atas 80 baris dipotong jadi baris error + 40 baris terakhir; `# notrim` atau `ORCH_NO_TRIM=1` untuk output penuh), hook penjaga edit (sesi utama tidak bisa Edit/Write file project kecuali `docs/prd/`; matikan dengan `/orchestrator:off` atau `ORCH_GUARD=off`), keduanya butuh Node 18+, dan `/orchestrator:init` kini menulis `verify.sh`.
- Baru di 1.6.1: lesson, peta project, dan `verify.sh` pindah dari `.claude/` di checkout utama ke `~/.claude/orchestrator/<project-key>/`, supaya sesi di worktree (misalnya desktop app) bisa menyimpannya. Checkpoint baru juga disimpan di sana. Tidak ada yang perlu di-ignore di git. Lesson lama di `.claude/` disalin ke store saat lesson berikutnya disimpan (per topik yang belum ada di store). Checkpoint lama tidak dipindah, tetap bisa dibaca oleh resume/status (ditandai legacy), dan boleh dihapus setelah selesai.
- Baru di 1.7.0: hook info sesi (path store + indeks lesson di awal sesi, tanpa tool call), output trim lebih ringkas (10 baris error + 30 baris terakhir; env `ORCH_TRIM_TAIL` dan `ORCH_TRIM_ERRORS` mengubah angkanya), aturan bersama team/autopilot disatukan di `modes.md`, aturan legacy dipindah ke `legacy.md` (dibaca hanya bila perlu), `init` tidak mengulang isi CLAUDE.md, `verify.sh` diperbarui otomatis saat perintah di map berubah, dan audit/riset read-only memakai agent Explore.
- Juga di 1.7.0 (perbaikan audit): guard tidak lagi mati hanya karena teks menyebut `/orchestrator:off`, root proyek memakai `CLAUDE_PROJECT_DIR`/git, output satu baris yang sangat panjang ikut dipotong, key store sama di macOS, dan aturan eskalasi/caps diperjelas.
- Baru di 1.7.1: trim lebih cerdas (tidak memotong diff/JSON, simpan 3 baris awal), indeks lesson/checkpoint dibatasi, guard hanya membaca 512 KB terakhir transcript, brief COMMIT tanpa trailer, SCAN hanya untuk diff >5 file, perbaikan kecil digabung satu delegasi, laporan agent maks 8 baris, agent memakai `effort`, dan lesson hanya disimpan setelah ada kegagalan/eskalasi/koreksi.
- Baru di 1.7.2: sonnet-dev dan opus-reviewer membatasi output perintah, resume mencocokkan argumen bebas ke baris `Task:` dan langsung bilang bila tidak ada checkpoint, status membaca cap dari skill team/autopilot (tidak ditulis ulang).
- Mode orkestrasi aktif otomatis di setiap sesi.

## Maintainers

Releasing: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json` on every release so `claude plugin update` picks it up. Run `node scripts/validate.mjs` before pushing (Node 18+, no dependencies); CI runs the same check on every push and pull request.

## License

MIT, see [LICENSE](LICENSE).
