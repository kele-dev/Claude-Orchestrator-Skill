# Claude Orchestrator Skill

Bahasa Indonesia: plugin ini membalas dalam bahasa pengguna. Lihat [ringkasan](#ringkasan-bahasa-indonesia).

Claude Code plugin for token-saving orchestration: the main session (any model; Opus-class recommended) thinks and writes the PRD, `haiku-coder` executes, and `sonnet-dev` handles escalation. The main session never edits code itself.
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

- `/orchestrator:on` - turn on (or `/orchestrator:on <task>` to give a task directly); optional `budget=<N>k` (e.g. `/orchestrator:on budget=50k <task>`) stops before the next group once the budget script reports OVER, with status BUDGET and a checkpoint
- `/orchestrator:off` - turn off for the rest of this session (Claude works directly as usual)
- `/orchestrator:team <task>` - parallel mode: the main session splits the work into lanes that own separate files, Haiku lanes run at the same time, only failed lanes are retried. Caps: 3 lanes (4 only at plan time, when the work has 4 or more independent, file-disjoint parts), 2 fix rounds per lane, raised automatically up to 4 rounds only while fixes make progress (a cap you set, e.g. `lanes=N`, is never raised; optional `budget=<N>k` stops with status BUDGET and a checkpoint once the agents' total tokens reach it). Lanes that need each other's files cooperate through the main session. Add `--dry-run` to see the lane plan first. `isolate=worktree` (opt-in) runs each lane in its own git worktree; needs `worktree.baseRef` set to `"head"` in settings, a clean working tree, and `commit=batch`, otherwise it warns and uses the shared tree; passed lanes are copied back into the main tree.
- `/orchestrator:autopilot <task>` - autonomous mode: one short clarification round, a PRD, then batch after batch without asking in between, until done or a cap is hit. Caps: 5 batches, 2 fix rounds per batch, raised automatically up to 8 batches / 4 rounds only while work keeps passing (a cap you set, e.g. `batches=N`, is never raised; optional `budget=<N>k` stops with status BUDGET and a checkpoint once the agents' total tokens reach it). Add `--dry-run` to see the plan first.
- Claude suggests `team` or `autopilot` when a task fits, but always starts in `on` mode; you decide whether to switch.
- `/orchestrator:learn [list | add <lesson> | prune]` - project lessons: at the end of a task Claude decides by itself whether to save up to 3 verified lessons (working test commands, root causes, pitfalls) and fixes or removes outdated ones, as local files in the project store (see Data location below), so every later session in that project can read them, also from a git worktree. Nothing is written into the repo. Old `.claude/skills/learned-*` lessons are still read and copied into the store on the next save.
- `/orchestrator:init [--refresh]` - maps a new project in one cheap Haiku pass: stack, key folders, and verified test/build/lint commands, saved as the `learned-map` lesson. It also writes `verify.sh` in the project store, one command that runs the verified checks and prints `VERIFY: PASS|FAIL`.
- `/orchestrator:resume [<name>]` - continues long work from a checkpoint after a context limit, rate limit, `/compact`, or crash. team/autopilot write checkpoints automatically at stops and between waves/batches. Checkpoints are kept in the project store.
- `/orchestrator:status` - read-only summary: mode in this session, plugin version, project lessons, checkpoints, and team/autopilot caps.
- `commit=batch` (team/autopilot) - one local commit per passed wave or batch, with a conventional message; never pushed.

**Data location:** lessons, checkpoints, and `verify.sh` are stored per project in `~/.claude/orchestrator/<project-key>/` (`lessons/`, `checkpoints/`, `verify.sh`). This store is shared by the main checkout and all git worktrees, is never committed, and needs no git ignore entries. Older lessons in the project's `.claude/` folders are still read and copied into the store on the next lesson save (per topic missing from the store). Older checkpoints are not migrated: `resume` and `status` still read them and mark them as legacy; delete them yourself once that work is finished.

### Token-saving defaults
- Concise answers: no preamble, no restated plan, tables or bullets; detail only when you ask.
- Test/build output is trimmed before it reaches the main session; large suites are run by Haiku, which reports only PASS/FAIL and the first error.
- The main session dictates exact text only for small edits; for long content it writes a spec and the executor writes the file.
- One self-review pass before reporting on full-path or multi-file doc/config work, so you need fewer review rounds.
- A `learned-map` lesson (max 20 lines) remembers the project layout and commands, so new sessions skip re-exploring.
- Claude suggests a new session or `/compact` when you switch to an unrelated task.
- Every report ends with one token line per agent, e.g. `Tokens: audit Explore 96k · batch1 haiku-coder 12k · 3 delegations, total ≈125k`.
- Code questions and test-failure triage go to Haiku; the main session reads only a short answer with file:line references.
- Briefs start with a type (`TYPE: EDIT | CREATE | RUN | TRIAGE | SCAN | COMMIT | APPLY`) that Haiku already knows, so briefs stay short.
- Before verifying a larger change, Haiku scans the diff for mechanical mistakes; the main session reads only the flagged hunks and the main logic.
- In a long conversation Claude writes a checkpoint and suggests continuing in a new session.
- Always-loaded rules are smaller: `hooks/rules.md` is shortened, and `orchestrator:on` is split into a core plus an on-demand `reference.md`.
- A long-session warning appears when the context grows by 120k tokens, again at +250k and +400k (`ORCH_LONG_REPEAT`: comma list or `off`), suggesting a checkpoint and a new session (from message usage; 2 MB transcript size if usage is missing) or after 30 delegations (`ORCH_LONG=off`, `ORCH_LONG_TOKENS`, `ORCH_LONG_BYTES`, `ORCH_LONG_DELEGATIONS`); `scripts/digest.mjs` gives planners a compact conversation summary.

### Hooks

- Session info: SessionStart prints the project store path, a one-line index of saved lessons (at most 20), the 5 newest checkpoints, and a note when legacy files exist, so Claude needs no extra tool calls to find them. Needs Node 18+; without Node the skills compute the path themselves.
- Output trim: Bash/PowerShell output is trimmed only when it is over 80 lines AND over 4000 chars. It keeps the first 3 lines, up to 10 error/failure lines, and the last 30 lines before the model sees it. `git diff/show`, `cat`, `jq`, `Get-Content`, `type`, and JSON output are not line-trimmed (a ~26k-char cap still applies to everything). Read, list and search commands at the start of a statement (`ls`, `find`, `git ls-files`, `grep`, `rg`, `head`, `tail`, `sed -n`, `wc`, `Get-ChildItem`, `Select-String`) are line-trimmed only above 300 lines. Add `# notrim` to a command, or set env `ORCH_NO_TRIM=1`, for full output. Env `ORCH_TRIM_TAIL` and `ORCH_TRIM_ERRORS` change the 30 and the 10.
- Edit guard: the main session cannot Edit/Write project files (except `docs/prd/`); subagents can. Turn it off with `/orchestrator:off` or env `ORCH_GUARD=off`.
- Guard limits: the edit guard keeps orchestration discipline; it is not a security boundary. It checks only Edit/Write/NotebookEdit (shell writes such as `sed -i` or `>` are not checked), any subagent may edit, and `/orchestrator:off` is user-only (the skill sets `disable-model-invocation: true`). Subagents are not guarded at all: executors (haiku-coder, sonnet-dev) can edit and run any shell command by design, and the read-only agents (opus-planner, opus-reviewer) keep Bash for git and test commands, limited only by their instructions.
- Debugging: hooks fail open and print nothing on errors; set env `ORCH_DEBUG=1` to write swallowed errors to stderr (top-level failures plus failed file, git and transcript reads in guard-edit, long-session and session-info). Messages are shortened and quoted input is masked; `ORCH_DEBUG=2` prints full stacks (may include input, do not paste publicly).
- The edit guard and output trim need Node 18+ on PATH. Without Node they do nothing (fail open). macOS desktop app: Node from nvm or Homebrew may be missing from the app's PATH; check that `/orchestrator:status` shows `Guards: active` (the session-start `Guards:` line comes only from the hooks), or install Node system-wide.
- Review guard (`guard-review`): a PreToolUse hook on Agent/Task that denies `orchestrator:opus-reviewer` when its prompt names a `docs/prd/*.md` file that does not exist. It fails open when Node is missing or the check cannot run. Turn it off with env `ORCH_GUARD=off`.

## What's new (1.9.0 and later)

### 1.13.0
- Guards are visible: session start prints `Guards: active` (or `Guards: off` with `ORCH_GUARD=off`) and `/orchestrator:status` reports it; the README states what the edit guard does not cover.
- `ORCH_DEBUG=1` writes swallowed hook errors (top-level failures and failed file, git and transcript reads) to stderr.
- Commits the user asks for in chat are allowed under `orchestrator:on`; the ask-first rule applies to every main model; non-Opus sessions send only the final diff to `opus-reviewer`.
- Autopilot: a BLOCKED batch skips only dependent batches, a failing final check gets fix rounds, and team/autopilot print one progress line per wave or batch.
- `scripts/budget.mjs`: an unreadable transcript prints `mark ?` and the budget becomes UNKNOWN (no more silent `mark 0`); `auto` stops at the git top level (outside git it still walks to the filesystem root) and names the file it picked.
- `scripts/eval-compare.mjs` prints EMPTY when nothing was measured and MISSING for baseline pairs absent from the run.
- CI: GitHub Actions pinned by SHA, read-only token for validate, Dependabot for actions; more hook smoke tests (kill switches, invalid input, large inputs, store-key copies).

### 1.12.2
- Slash commands for the user go in text blocks, never shell blocks (Run button ran them in PowerShell).

### 1.12.1
- Short-path review rules apply only to non-Opus main sessions; the review guard accepts absolute and quoted PRD paths with spaces.
- Session start prints `Map: none` when the project has no learned-map, so Claude suggests `/orchestrator:init` first.
- Output trim: read, list and search commands at the start of a statement are line-trimmed only above 300 lines.
- `scripts/budget.mjs --main` reports main-session token usage (calls, cache read/write, output, current context); `/orchestrator:status` shows it.

### 1.12.0
- Always-loaded rules are split: non-Opus PRD rules moved to `skills/on/non-opus.md`, and situational token rules moved to `skills/on/reference.md` (read on demand, so they may be followed less often).
- Validator size budget: `CONTEXT_BUDGET_BYTES` caps `hooks/rules.md` + `skills/on/SKILL.md`.
- `scripts/eval-compare.mjs` compares eval token totals with a stored baseline; the scheduled run is opt-in. The eval baseline is not committed yet, so the CI compare step stays inactive until the owner runs the eval once and commits the `--write` output.
- Stale checkpoints (older than `ORCH_STALE_DAYS`, default 14) are marked in the session-info line.

### 1.11.0
- Long-session reminders repeat at +250k and +400k tokens (`ORCH_LONG_REPEAT`), suggesting a checkpoint and a new session.
- `budget=<N>k` now also works for plain `/orchestrator:on`.
- New `scripts/trace-tokens.mjs` plus the measured startup cost: about 10.6k fixed tokens per haiku-coder delegation (no reduction made).
- Honest graders: trace-based main-session and write-success checks, and `tool_order` review ordering.
- 5 new evals plus the filled token log.
- Validator checks eval structure, the `on` budget rule, and new smoke tests.

### 1.10.1
- `budget.mjs auto` finds its own transcript when no `Digest:` line is printed (the newest transcript for this project).
- Non-Opus PRD rule aligned: the planner's PRD is saved to `docs/prd/` only when step 2 requires it.

### 1.10.0
- New `scripts/budget.mjs` that sums agent tokens from the transcript; it prints a `BUDGET: spent <X>k (...) of <N>k: UNDER|OVER|UNKNOWN` output line for team/autopilot.
- Review guard (`guard-review`, Agent/Task PreToolUse): denies `orchestrator:opus-reviewer` when its prompt names a missing `docs/prd/*.md`; fails open; `ORCH_GUARD=off` turns it off.
- Edit-guard message now says that `docs/prd/` is writable.
- `learned-errors` lessons track `hits:` and prune the least-hit ones (max 15).
- Validator checks stop-status names (for example `BUDGET`) and the "Baru di" order.
- 3 new evals and the token log; the cache claim is softened.

### 1.9.0
- `budget=<N>k` for team/autopilot: stops with status BUDGET and a checkpoint.
- `learned-errors` lesson, checked before TRIAGE.
- Brief order: stable parts first, variable parts last (may help prompt caching; not measured).

## Plugin contents

- Skills `on` and `off`: the PRD -> delegate -> escalate -> review flow, and the switch to turn it off.
- Skills `team` and `autopilot` (user-invoked only): parallel and autonomous modes on top of `on`, with hard caps to keep token cost bounded.
- Skill `learn`: project lessons saved and maintained automatically as local files in the project store; one report line tells you what changed, and the manual commands are optional.
- Skills `init`, `resume`, and `status`: one-pass project map, checkpoints to continue in a new session, and a read-only state summary.
- Agents `haiku-coder` (executor), `sonnet-dev` (escalation), `opus-reviewer` (review, read-only; now runs on Opus), `opus-planner` (hard-design PRD and diagnosis when the main session is not Opus-class, read-only).
- Hooks: SessionStart rules (loads the orchestration rules into every session), SessionStart session info (store path, lesson index, open checkpoints), edit guard (PreToolUse), review guard (PreToolUse, Agent/Task), output trim (PostToolUse), long-session reminder (UserPromptSubmit).

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
- `/orchestrator:init` - memetakan proyek sekali dan menulis learned-map
- `/orchestrator:resume <slug>` - melanjutkan dari checkpoint di sesi baru
- `/orchestrator:status` - ringkasan read-only: mode, versi, guard, store, lessons, checkpoint
- `budget=<N>k` - batas token untuk semua delegasi
- cek `Guards: active` di `/orchestrator:status` (tanpa Node guard mati diam-diam)
- `ORCH_DEBUG=1` menulis error hook ke stderr
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
- Baru di 1.7.3: guard-edit mengizinkan PRD di folder worktree, pemangkas output tidak lagi salah mengenali `--type`/`[INFO]`, indeks checkpoint mengenali `- Task:`, validator memeriksa file rujukan, heading, frontmatter, dan smoke test ketiga hook, CI berjalan di Linux/Windows/macOS.
- Baru di 1.7.4: verifikasi lane hanya untuk file miliknya, cek file di luar daftar dibandingkan dengan gabungan semua lane, COMMIT hanya menambah path yang dicantumkan, opsi `isolate=worktree` dengan brief `APPLY`, output perintah gagal wajib dipangkas lewat `tail`, dan sonnet-dev tidak menjalankan perintah git tulis di lane; cek gabungan memakai baseline `git status` sebelum wave, urutan wave isolate dibuat eksplisit, dan dua perbaikan hook (pemangkasan `[1/12]`, huruf kecil path di macOS).
- Baru di 1.8.0: model sesi utama bebas (Opus disarankan); bila bukan kelas Opus, PRD dan diagnosis dari agent baru `opus-planner`, dan diff akhir wajib ke `opus-reviewer` (kini selalu Opus); sesi Haiku menyarankan ganti model; `scripts/digest.mjs` meringkas transcript (baris `Digest:` di awal sesi); peringatan sekali saat sesi panjang (>2 MB atau 30 delegasi; `ORCH_LONG=off`, `ORCH_LONG_BYTES`, `ORCH_LONG_DELEGATIONS`).
- Baru di 1.8.1: sesi utama yang bukan kelas Opus memakai jalur pendek hanya untuk 1 file dengan perubahan teks yang jelas (selain itu lewat `opus-planner` dan `opus-reviewer`); bertanya sekali bila permintaan bisa masuk ke beberapa tempat (memory, skill, config, kode); laporan dianggap belum selesai bila lebih dari 1 file berubah tanpa `opus-reviewer`.
- Baru di 1.8.2: pekerjaan rutin yang jatuh bersamaan (COMMIT, hapus checkpoint, simpan lesson) digabung dalam satu brief `haiku-coder` (hemat ~10k token per delegasi); brief COMMIT bisa membawa baris `TRAILER:` sehingga atribusi commit sesuai model sesi utama; `/orchestrator:resume` mengecek commit baru di main yang menyentuh file checkpoint sebelum lanjut; eval baru `on-sonnet-guardrails`; baris `Lessons:` di awal sesi kini menyebut foldernya; laporan `haiku-coder` tidak lagi memuat catatan token.
- Baru di 1.8.3: peringatan sesi panjang kini diukur dari pertambahan token konteks (`message.usage`, ambang `ORCH_LONG_TOKENS`, bawaan 120k) alih-alih ukuran file transcript yang membengkak oleh entri lampiran; ukuran 2 MB hanya dipakai bila data usage tidak ada; `guard-edit` hanya mem-parse baris perintah/Skill orchestrator dan mengabaikan `<system-reminder>` di depan perintah; validator menambah smoke test deteksi `/orchestrator:off` dan metrik token; penghitung delegasi dan digest melewati baris lampiran/api-request saat parsing; naik versi dan changelog digabung ke batch kode terakhir (modes.md); hitungan delegasi kini inkremental (offset disimpan di file tmp, hanya byte baru yang dibaca); eval CI memakai versi Claude Code yang dipatok.
- Baru di 1.8.4: hemat token di sesi utama: ronde perbaikan dikirim ke agent yang sama lewat `SendMessage` (tanpa startup ~10k), review diff per batch hanya membaca delta sejak batch lulus terakhir (snapshot tree), verifikasi dan delegasi berikutnya dalam satu giliran tanpa pesan status kosong, audit read-only wajib ke `Explore` (haiku), laporan `haiku-coder` yang bersih cukup 3 baris, dan deskripsi skill dipersingkat.
- Baru di 1.8.5: hemat token per sesi dan per tugas: `/orchestrator:status` membaca `skills/status/caps.md` yang kecil (dicek validator terhadap Budget team/autopilot), `learn` memindahkan perintah Store dan manual ke `skills/learn/reference.md`, teks COMMIT/APPLY di `haiku-coder` dan tiga baris aturan sesi dipersingkat.
- Baru di 1.9.0: argumen opsional `budget=<N>k` untuk team/autopilot (berhenti dengan status BUDGET dan checkpoint bila total token agent mencapai batas), lesson khusus `learned-errors` (pola error terverifikasi -> penyebab -> perbaikan, dipakai sebelum TRIAGE), dan urutan brief yang ramah cache (bagian tetap dulu, bagian variabel terakhir).
- Baru di 1.10.0: skrip `scripts/budget.mjs` (ringkasan token agent, baris `BUDGET: spent <X>k (...) of <N>k: UNDER|OVER|UNKNOWN` untuk team/autopilot), review guard `guard-review` (memblokir `opus-reviewer` bila prompt menyebut `docs/prd/*.md` yang tidak ada; fail open; `ORCH_GUARD=off`), pesan guard-edit kini menyebut `docs/prd/` boleh ditulis, `learned-errors` punya penghitung `hits:` dan pemangkasan yang paling sedikit dipakai (maks 15), validator memeriksa nama status stop dan urutan "Baru di", 3 eval baru dan log token, serta klaim cache dilunakkan.
- Baru di 1.10.1: `budget.mjs auto` menemukan transcript sendiri bila tidak ada baris `Digest:` (transkrip terbaru proyek ini), dan aturan PRD non-Opus diselaraskan: PRD planner hanya disimpan ke `docs/prd/` bila langkah 2 mewajibkannya.
- Baru di 1.11.0: pengingat sesi panjang berulang di +250k dan +400k token konteks (`ORCH_LONG_REPEAT`) dengan saran checkpoint, `budget=<N>k` juga untuk `/orchestrator:on` biasa, skrip `scripts/trace-tokens.mjs` (total token dan biaya startup per agent dari trace eval), grader yang lebih jujur (cek trace khusus sesi utama dan keberhasilan tulis checkpoint, urutan review dengan `tool_order`), 5 eval baru dan log token berisi hasil terukur, serta validator memeriksa struktur eval.
- Baru di 1.11.1: saat sesi panjang atau tugas berhenti, Claude menulis checkpoint, memberi ringkasan maks 5 baris, lalu langsung menawarkan card sesi baru yang menjalankan `/orchestrator:resume <slug>` (bila tool sesi tersedia, mis. desktop app); selain itu perintahnya dicetak untuk dijalankan di sesi baru.
- Baru di 1.12.0: aturan dipisah (aturan non-Opus di `non-opus.md`, aturan token situasional di `reference.md` dibaca bila perlu), validator punya batas ukuran konteks, `scripts/eval-compare.mjs` membandingkan token eval dengan baseline (jadwal CI opsional; baseline belum di-commit, jadi langkah compare di CI tetap nonaktif sampai pemilik repo menjalankan eval dan meng-commit output `--write`), dan checkpoint basi ditandai sesuai `ORCH_STALE_DAYS` (default 14).
- Baru di 1.12.1: aturan jalur pendek hanya berlaku untuk sesi utama non-Opus dan guard review menerima path PRD absolut atau berkutip yang berspasi; sesi dimulai dengan `Map: none` bila learned-map belum ada sehingga Claude menyarankan `/orchestrator:init` dulu; trim output hanya memotong perintah baca, listing, dan cari di atas 300 baris; dan `scripts/budget.mjs --main` melaporkan pemakaian token sesi utama (panggilan, cache baca/tulis, output, konteks saat ini) yang ditampilkan `/orchestrator:status`.
- Baru di 1.12.2: perintah slash untuk pengguna ditaruh di blok teks, tidak pernah di blok shell (tombol Run menjalankannya di PowerShell).
- Baru di 1.13.0: status guard terlihat (`Guards: active` atau `Guards: off`) beserta batas guard; `ORCH_DEBUG=1` menulis error hook ke stderr; commit yang diminta user di chat diizinkan, ask-first berlaku untuk setiap model utama, dan diff akhir non-Opus hanya dikirim ke `opus-reviewer`; autopilot melewati batch BLOCKED hanya bila bergantung, cek akhir yang gagal dapat putaran fix, dan ada satu baris progres per batch atau wave; budget mencetak `mark ?` bila transkrip tak terbaca dan `auto` berhenti di top level git; eval-compare mencetak EMPTY dan MISSING; CI memakai SHA pin, token read-only, Dependabot, dan lebih banyak smoke test.
- Mode orkestrasi aktif otomatis di setiap sesi.

## Maintainers

Releasing: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json` on every release so `claude plugin update` picks it up. Run `node scripts/validate.mjs` before pushing (Node 18+, no dependencies); CI runs the same check on every push and pull request. Add the new `Baru di X.Y.Z` line after the newest one at the end of the list (the validator requires ascending order).

## License

MIT, see [LICENSE](LICENSE).
