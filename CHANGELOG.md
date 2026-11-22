# Changelog

Per-version release notes. The README keeps only the current version's "Baru di" line.

## English

### Unreleased
- Fixed: lesson index without dangling colon; TRIM unavailable names ORCH_DEBUG=1; long-session uses shared session-id sanitizer; eval-select selects every case for an unmapped scripts/ file; README no longer claims failed commands keep a 10-line head; ideas doc store-key wording.
- CI: partial eval runs call the eval once per selected case; pinned Claude Code version recorded in evals/README.md and checked by the validator; smoke tests cover the 64 KB boundary and the root-fallback guard without inherited GIT_* env.

### 1.15.1
- New: `SECURITY.md` with a private vulnerability-reporting route; the team PLAN step derives lanes with `scripts/plan-dag.mjs` when the PRD has a task table; README and help document `ORCH_STALE_DAYS`, `ORCH_STATE_DIR`, the ledger hook and the `verify.ps1` fallback.
- Fixed: long-session counts delegations only in the last 4 MB of a transcript on a cold start; `trace-tokens` and `eval-compare` read a result's trace only inside the results folder (a relative `tracePath` now resolves against it); the no-Node warning names the read guard; init and learn print the `verify.sh` command lines and `on` shows them to the user first when they were not reported.

### 1.15.0
- New: `/orchestrator:status` TRIM row shows a project total across retained sessions and approx tokens saved; eval workflow `changed_since` input and `scripts/eval-select.mjs --plan` run only the selected eval cases; session start lists at most 10 lessons and reads only file heads; read guard honours `/orchestrator:off` and shows in the Guards line; trim-stats files compact into a summary line and are pruned after 14 days.
- Fixed: ledger parses STATUS only at line start with a colon, leniently, and counts unknown separately; ledger caps and appends under a lock with an atomic rewrite; guard-edit deny streak lives in the private state dir; otel-export no longer emits 1970 or zero-length spans and exits 3 on write failure; eval-select rejects option-like values and keeps git-quoted paths.
- CI: validator requires a CHANGELOG entry for the plugin version and checks help lists every skill; validate.mjs split into modules; Dependabot bumps of actions (checkout, setup-node, upload-artifact).

### 1.14.0
- New: `/orchestrator:help`; read guard (a main-session whole-file read of a file over 2000 lines or 100 KB is denied once per file; `ORCH_READ_GUARD=off` turns it off); TRIM statistics row in `/orchestrator:status`; `ORCH_DEBUG` also writes `<tmpdir>/orchestrator-debug.log`; store key from the git remote URL for new stores (an existing path-based store keeps being used); release notes moved to CHANGELOG.md.
- Fixed: edit guard on transcripts over 16 MB; trim keeps the first 10 lines of failed commands; budget `auto` finds transcripts of sessions started above the repo, and its stderr line is shown only with `ORCH_DEBUG` or `--verbose`; rules hook no longer needs `cat` and warns when node is missing; atomic state writes; Windows Git Bash default path and verify.ps1 fallback.
- CI: validate.yml timeout and concurrency; eval workflow warns when the baseline is missing and fails when no result file exists; Claude Code pinned to 2.1.317.

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
- `scripts/budget.mjs --main` reports main-session token usage (calls, cache read/write, output, current context); it also flags cache breaks (a call whose cache read drops below half of the previous call's while context stays at least 70% as large); `/orchestrator:status` shows it.
- `hooks/ledger.mjs` (SubagentStop) appends each orchestrator delegation's tier and STATUS to `<store>/delegations.jsonl` (capped); `/orchestrator:status` shows the pass rate per tier.
- `scripts/otel-export.mjs <transcript.jsonl>` writes the session as OTLP/JSON spans (GenAI conventions: invoke_agent, execute_tool, token usage; no message content) for Jaeger, Langfuse or Grafana.
- `scripts/plan-dag.mjs <prd.md> [--lanes N]` reads the PRD task table (Task, Files) and prints file-disjoint parallel waves for `/orchestrator:team`.

### 1.12.0
- Always-loaded rules are split: non-Opus PRD rules moved to `skills/on/non-opus.md`, and situational token rules moved to `skills/on/reference.md` (read on demand, so they may be followed less often).
- Validator size budget: `CONTEXT_BUDGET_BYTES` caps `hooks/rules.md` + `skills/on/SKILL.md`.
- `scripts/eval-compare.mjs` compares eval token totals with a stored baseline; the scheduled run is opt-in. The eval baseline is not committed yet, so the CI compare step is skipped (the run emits a `::warning::` annotation). To activate it: run the `eval` workflow once, download the `eval-results` artifact, run `node scripts/eval-compare.mjs ci-result.json --write evals/baseline.json` with the trace files next to `ci-result.json`, and commit `evals/baseline.json` (details in `evals/README.md`).
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

## Catatan rilis (Bahasa Indonesia)

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
- Baru di 1.14.0: `/orchestrator:help`; read guard (Read sesi utama atas file di atas 2000 baris atau 100 KB ditolak sekali per file, `ORCH_READ_GUARD=off` mematikannya); baris statistik TRIM di status; `ORCH_DEBUG` juga menulis `<tmpdir>/orchestrator-debug.log`; store key dari URL git remote untuk store baru (store berbasis path yang sudah ada tetap dipakai); catatan rilis pindah ke CHANGELOG.md.
- Juga di 1.14.0 (perbaikan): guard edit pada transkrip di atas 16 MB; trim menyimpan 10 baris pertama perintah yang gagal; budget `auto` menemukan transkrip sesi yang dimulai di atas repo, baris stderr-nya hanya tampil dengan `ORCH_DEBUG` atau `--verbose`; hook rules tidak lagi butuh `cat` dan memberi peringatan bila node tidak ada; penulisan state atomik; path default Git Bash di Windows dan fallback verify.ps1.
- Juga di 1.14.0 (CI): timeout dan concurrency validate.yml; workflow eval memberi peringatan bila baseline hilang dan gagal bila tidak ada file hasil; Claude Code di-pin ke 2.1.317.
- Baru di 1.15.0: total TRIM di status (sesi yang disimpan dan perkiraan token yang dihemat); workflow eval memakai input `changed_since` dan `scripts/eval-select.mjs --plan` hanya menjalankan case terpilih; session start menampilkan maks 10 lesson dan hanya membaca bagian awal file; read guard mengikuti `/orchestrator:off` dan tampil di baris Guards; file statistik trim dipadatkan jadi satu baris ringkasan dan dihapus setelah 14 hari.
- Juga di 1.15.0 (perbaikan): ledger hanya membaca STATUS di awal baris dengan titik dua, secara lenient, dan menghitung status tak dikenal terpisah; ledger dibatasi dan menulis tambahan di bawah kunci dengan penulisan ulang atomik; streak deny guard-edit disimpan di direktori state privat; otel-export tidak lagi menghasilkan span 1970 atau span berdurasi nol dan keluar dengan kode 3 bila tulis gagal; eval-select menolak nilai yang mirip opsi dan mempertahankan path git yang dikutip.
- Juga di 1.15.0 (CI): validator mewajibkan entri CHANGELOG untuk versi plugin dan memeriksa help memuat setiap skill; validate.mjs dipecah ke modul; bump Dependabot untuk action (checkout, setup-node, upload-artifact).
- Baru di 1.15.1: `SECURITY.md` dengan jalur pelaporan kerentanan privat; langkah PLAN di team memakai `scripts/plan-dag.mjs` untuk menurunkan lane jika PRD punya tabel tugas; README dan help mendokumentasikan `ORCH_STALE_DAYS`, `ORCH_STATE_DIR`, hook ledger, dan cadangan `verify.ps1`.
- Juga di 1.15.1 (perbaikan): long-session pada start dingin hanya menghitung delegasi di 4 MB terakhir transkrip; `trace-tokens` dan `eval-compare` hanya membaca trace di dalam folder hasil (`tracePath` relatif kini dihitung dari folder itu); peringatan tanpa Node menyebut read guard; init dan learn menampilkan baris perintah `verify.sh`, dan `on` menampilkannya ke pengguna dulu bila belum dilaporkan.
