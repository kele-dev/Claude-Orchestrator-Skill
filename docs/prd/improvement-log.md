# Improvement log: orchestrator plugin

Dipakai oleh prompt "siklus improvement" (diulang tiap sesi). Aturan: baca log ini dulu, jangan munculkan ulang temuan ✅ kecuali ada regresi (fitur yang tadinya benar jadi rusak dibanding klaim README), tambahkan hanya temuan baru, lalu kerjakan 1-3 item 🔲 setelah dikonfirmasi.

Legenda: status 🔲 belum, 🔄 sedang, ✅ selesai. Prioritas 🔴 Critical, 🟠 Tinggi, 🟡 Sedang, 🟢 Rendah. Effort S (< 1 jam kerja agent), M (beberapa file / perlu desain), L (besar). ID di awal kolom Temuan dipakai untuk rujukan antar sesi.

Dasar audit terakhir: v1.12.0 (commit a0909fb), 2026-11-15. Regresi vs klaim README: tidak ditemukan (angka README cocok dengan kode: trim 80 baris/4000 karakter/head 3/10 error/tail 30/cap 26k, budget konteks 14200 B, cap 3/4 lane, 5/8 batch, 2/4 putaran, stale 14 hari).

## Temuan terbuka

| Tanggal | Kategori | Temuan | Dampak | Effort | Prioritas | Status |
|---|---|---|---|---|---|---|
| 2026-11-15 | DX | DX-09 — `argument-hint` skill `on` hanya `[budget=<N>k]`; `--dry-run`/`commit=batch` diketik ke `/orchestrator:on` diam-diam jadi teks tugas; README tidak bilang itu khusus team/autopilot (skills/on/SKILL.md:4) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | DX | DX-11 — `/orchestrator:status` menghitung delegasi hanya untuk haiku-coder, sonnet-dev, opus-reviewer; `opus-planner` tidak ada (skills/status/SKILL.md:17) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | DX | DX-12 — Dua pemicu untuk hal yang sama: `learn` ("remember this") bertabrakan dengan aturan target ambigu di `on`; `init` memicu di awal tugas pertama sedangkan `learn` membuat map di akhir (skills/learn/SKILL.md:3, skills/init/SKILL.md:3) (UNVERIFIED perilaku nyata) | Low | M | 🟢 | 🔲 |
| 2026-11-15 | Fitur | FT-02 — `scripts/budget.mjs --mark` mencetak ukuran 0 bila file tidak terbaca (`auto` tanpa transcript), lalu budget menghitung seluruh sesi tanpa peringatan (scripts/budget.mjs:44-47) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fitur | FT-03 — README bilang budget = "agents' total tokens" tanpa catatan bahwa main session dan Explore di luar launch Agent tidak dihitung dan `auto` bisa salah baca bila ada sesi paralel (hanya ada di modes.md:11) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fitur | FT-04 — Sisa headroom budget konteks tipis: 13.278 B dari 14.200 B (922 B); aturan baru berikutnya akan menabrak batas (info, bukan bug) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-02 — `guard-edit`: tulisan lewat Bash (`sed -i`, redirect), PowerShell `Set-Content`, atau tool MCP file lolos; tidak ada hook Bash/PowerShell yang mendeteksi tulis ke proyek (rules.md mengakui keterbatasan ini) (hooks/hooks.json, hooks/rules.md:2) | High | M | 🟠 | 🔲 |
| 2026-11-15 | Fungsi | FN-03 — `guard-edit` lupa `/orchestrator:off` bila perintah lebih tua dari 512 KB dan transcript lebih dari 16 MB (return false => guard ON lagi diam-diam) (hooks/guard-edit.mjs:~99-104) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-04 — `guard-edit` tanpa realpath: symlink/junction, nama 8.3 Windows; file apa pun (`x.sh`) di `docs/prd/` lolos (symlink UNVERIFIED di Windows) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-05 — Kunci store untuk submodule git: `git-common-dir` = `.git/modules/<nama>`, semua submodule satu repo berbagi satu store yang beda dari store induk (lessons/checkpoints tidak ketemu) (hooks/session-info.mjs:~50, skills/learn/reference.md Store) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-06 — Kunci store tanpa git memakai cwd persis: sesi dari subfolder beda dapat store berbeda; huruf besar/kecil dan path non-ASCII bisa bertabrakan (session-info.mjs:~54) | Low | M | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-07 — `resume`: slug checkpoint 5 kata tanpa cek keberadaan; dua tugas mirip (atau dua worktree berbagi store) saling menimpa, dan "Finishing" menghapus milik tugas lain; tidak ada field Branch/session (skills/resume/SKILL.md Location, Finishing) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-08 — `resume`: isi checkpoint tidak mewajibkan path worktree lane (`isolate=worktree`) atau daftar file BLOCKED yang belum di-commit; tidak ada cek ancestor (`merge-base --is-ancestor`) (skills/resume/SKILL.md Content, Reading) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-09 — `resume`: `git fetch -q` + `origin/<main>` tidak menangani tanpa remote / detached HEAD; stale hanya dari mtime (bisa berubah karena sync OneDrive), baris `Updated:` tidak dipakai | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-10 — `team` di tree bersama: deteksi pelanggaran kepemilikan file lewat `git status --porcelain` tidak melihat edit tambahan ke file yang sudah dirty sebelum wave; subagent dikecualikan dari guard (skills/team/SKILL.md EXEC/VERIFY, guard-edit.mjs agent_id) | Med | M | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-11 — Snapshot review: `export GIT_INDEX_FILE=...` bisa bertahan di shell persisten, path relatif terhadap cwd, gagal di PowerShell, dan `git add -A` ikut memasukkan file BLOCKED (skills/on/reference.md:35) (UNVERIFIED persistensi) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-12 — Baris peta `Verify: bash <path>/verify.sh` tanpa tanda kutip (home dengan spasi memecah argumen); `verify.sh` ditulis ulang tanpa lock oleh beberapa sesi; butuh bash (skills/init/SKILL.md:38, skills/on/SKILL.md:30) (UNVERIFIED eksekusi) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fungsi | FN-13 — `learned-errors` dan lessons: read-modify-write oleh haiku-coder dari sesi paralel tanpa lock; update bisa hilang (skills/learn/SKILL.md Saving) (UNVERIFIED) | Low | M | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-14 — `APPLY` (`isolate=worktree`): `git worktree remove --force` menghapus perubahan di luar owned files tanpa laporan; hapus/rename hanya ikut bila tercantum; CRLF/autocrlf tidak ditangani (agents/haiku-coder.md APPLY) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-15 — `long-session`: setelah `/compact` growth negatif sehingga peringatan token tidak muncul dan fallback ukuran-byte nonaktif saat ada data usage (hooks/long-session.mjs run()) (UNVERIFIED) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-16 — `trim-output`: bentuk `tool_response` tool PowerShell tidak diverifikasi (hanya `stdout` string diproses); `updatedToolOutput` mengosongkan stderr (UNVERIFIED) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-18 — `validate.mjs` tidak mencocokkan `argument-hint` skill dengan flag README/body (hanya `budget=`), `tools:` agent dengan klaim skill, dan pointer di luar daftar tetap; smoke test hook memanggil file langsung, bukan lewat command di `hooks.json` (validate.mjs:195-204, 281-288, runHook:311) | Low | M | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-19 — Prasyarat Node: semua guard fail open bila `node` tidak ada di PATH, tanpa peringatan saat SessionStart; hanya ada di README:68 | Low | M | 🟢 | 🔲 |
| 2026-11-04 | Fungsi | FN-20 — Perintah SessionStart `cat rules.md` pada Windows PowerShell-only belum terverifikasi (dilewati di audit 2026-11-04) | Low | S | 🟢 | 🔲 |
| 2026-11-04 | Fungsi | FN-21 — Apakah rules diinjeksi dua kali saat `resume` belum terverifikasi (transcript yang ada tidak pernah di-resume sebelum audit itu) | Low | S | 🟢 | 🔲 |
| 2026-11-15 | Fungsi | FN-22 — `guard-review`: path absolut Windows dengan spasi (contoh `C:/Users/John Doe/p/docs/prd/x.md`) tidak dicocokkan utuh, sehingga PRD yang ada bisa ditolak (pra-ada, ditemukan saat review v1.12.1) (hooks/guard-review.mjs:7) | Med | S | 🟡 | 🔲 |
| 2026-11-15 | Fitur | BL-13 — Jalur edit langsung saat model utama sudah murah untuk edit 1-3 baris (mengubah aturan inti "sesi utama tidak mengedit": butuh keputusan pemilik) (docs/ideas/token-saving.md #13) | Med | M | 🟡 | 🔲 |
| 2026-11-15 | Fitur | BL-14 — Hook penjaga Read: peringatkan/tolak baca file besar tanpa `offset`/`limit`; frekuensi belum diukur (#14) | Med | M | 🟡 | 🔲 |
| 2026-11-15 | Fitur | BL-15 — Statistik hook trim ke store + tampil di `/orchestrator:status` (#15) | Low | M | 🟢 | 🔲 |
| 2026-11-15 | Fitur | BL-16 — Gerbang regresi token di CI: skrip compare sudah ada (v1.12.0), tinggal commit baseline dari run eval pertama dan keputusan jadwal (#16) | Med | S | 🟡 | 🔄 |
| 2026-11-15 | Fitur | BL-17 — Kunci store dari identitas repo (URL remote / commit pertama), jalur path jadi fallback; menyelesaikan FN-05/FN-06 sekaligus (#17) | Med | M | 🟡 | 🔲 |

## Selesai (riwayat dari sesi sebelumnya, dicatat agar tidak muncul lagi)

| Tanggal | Kategori | Temuan | Dampak | Effort | Prioritas | Status |
|---|---|---|---|---|---|---|
| 2026-11-04 | Fungsi | DONE — Guard edit mati hanya karena transcript *menyebut* `/orchestrator:off`; sekarang hanya pemanggilan asli/Skill tool yang dihitung (v1.7.0) | High | S | 🟠 | ✅ |
| 2026-11-04 | Fungsi | DONE — Root proyek guard dari `cwd`; sekarang `CLAUDE_PROJECT_DIR` lalu git toplevel lalu cwd; kasus root drive (v1.7.0) | High | S | 🟠 | ✅ |
| 2026-11-04 | Fungsi | DONE — Trim: satu baris sangat panjang tidak terpotong, newline akhir, stderr digabung; cap karakter ~26k (v1.7.0) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — Trim memotong `git diff`/`cat`/JSON; sekarang dilewati, ambang 80 baris dan 4000 karakter, 3 baris awal disimpan (v1.7.1) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — Kunci store beda antara Bash/PowerShell/macOS (sed BSD, non-ASCII, 80 karakter) (v1.6.1, v1.7.0) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — Lessons dan checkpoint tidak bisa ditulis dari sesi worktree; dipindah ke store di `~/.claude/orchestrator/<key>/` (v1.6.1) | High | M | 🟠 | ✅ |
| 2026-11-04 | Fungsi | DONE — Lessons legacy hilang setelah `init`; migrasi per topik di setiap simpan (v1.7.0) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — `resume` melanjutkan mode team/autopilot sendiri; sekarang menyerahkan ke pengguna; hapus checkpoint lewat `TYPE: RUN` (v1.7.0) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — Ambiguitas batas putaran perbaikan vs tangga eskalasi, penjepitan cap argumen, status NEEDS ARCHITECTURE DECISION (v1.7.0) | Med | S | 🟡 | ✅ |
| 2026-11-04 | DX | DONE — Trailer di brief COMMIT selalu ditimpa executor; sekarang baris `TRAILER:` terpisah dari sesi utama (v1.7.1, v1.8.2) | Med | S | 🟡 | ✅ |
| 2026-11-04 | Fungsi | DONE — Validator: cek sintaks `node --check` semua `.mjs`, cek field hook dan file skill tambahan (v1.7.0, v1.7.1) | Med | S | 🟡 | ✅ |
| 2026-11-15 | Fitur | DONE — Konteks selalu-dimuat membengkak +75% sejak v1.7.1; split `on/SKILL.md` dan gerbang ukuran 14.200 B (v1.12.0) | High | M | 🟠 | ✅ |
| 2026-11-15 | Fungsi | DONE — Hitungan ambang `eval-compare` salah karena float (115.000 vs 100.000 pada 15% terhitung OVER); kini bilangan bulat, `--threshold` divalidasi (v1.12.0) | Med | S | 🟡 | ✅ |
| 2026-11-15 | DX | DONE — Checkpoint basi tercetak di setiap awal sesi; kini ditandai `(stale Nd)` setelah 14 hari (`ORCH_STALE_DAYS`) (v1.12.0) | Low | S | 🟢 | ✅ |
| 2026-11-15 | Fitur | DONE — Backlog #18 (kedaluwarsa checkpoint) selesai di v1.12.0 | Low | S | 🟢 | ✅ || 2026-11-15 | Fitur | DONE — FT-01: blok English 1.11.1 dan 1.12.1 ditambahkan; validator mewajibkannya (v1.12.1) | Med | S | 🟡 | ✅ |
| 2026-11-15 | DX | DONE — DX-01: Indonesia kini menyebut budget, isolate=worktree, lanes/batches (v1.12.1) | Med | S | 🟡 | ✅ |
| 2026-11-15 | DX | DONE — DX-02: kenaikan otomatis 3->4 lane, 5->8 batch, 2->4 putaran, dijelaskan dengan syarat (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-03: angka trim kini (80 baris, 4000 karakter, 3/10/30, cap 26k) di bagian non-riwayat (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-04: pesan guard-edit menyebut ORCH_GUARD=off (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-05: pesan guard-review menyebut ORCH_GUARD=off (v1.12.1) | Med | S | 🟡 | ✅ |
| 2026-11-15 | DX | DONE — DX-06: notice trim menyebut ORCH_NO_TRIM=1 (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-07: pesan long-session menyebut ORCH_LONG=off dan ORCH_LONG_TOKENS (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-08: tabel semua variabel ORCH_* di README (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | DX | DONE — DX-10: penjepitan argumen (lanes=6 jadi 4) didokumentasikan (v1.12.1) | Low | S | 🟢 | ✅ |
| 2026-11-15 | Fungsi | DONE — FN-01: guard-review menerima path absolut Windows, slug non-ASCII, dan `~` (RUNNER~1); tes smoke di validator (v1.12.1) | Med | S | 🟡 | ✅ |
| 2026-11-15 | Fungsi | DONE — FN-17: validator memeriksa matcher, event, registrasi hook, dan blok English; tes negatif (v1.12.1) | Med | S | 🟡 | ✅ |

## Riwayat sesi

- 2026-11-15 (audit v1.12.0): 42 butir terbuka dicatat (35 temuan audit baru, 2 carry-over tak terverifikasi, 5 butir backlog): 0 Critical, 1 Tinggi, 17 Sedang, 24 Rendah; 15 butir riwayat dicatat ✅. Usulan eksekusi: lihat bagian di bawah, menunggu konfirmasi.
- 2026-11-15 (siklus v1.12.1): D01, V01, G01 dikerjakan, 12 butir ✅ (FT-01, DX-01..08, DX-10, FN-01, FN-17); butir baru FN-22. Terbuka kini 31 (0 Critical, 1 Tinggi, 12 Sedang, 18 Rendah termasuk BL-16 🔄). Review opus-reviewer atas PRD dan diff menemukan bug `~` (nama 8.3) yang diperbaiki sebelum commit.

## Usulan sesi berikutnya (menunggu konfirmasi)

1. **R01** — checkpoint `resume`: FN-07 + FN-08 (tabrakan slug, path worktree lane, cek ancestor).
2. **R02** — ketahanan: FN-11 + FN-12 + FT-02 (snapshot review, verify.sh berkutip, `budget --mark` file tak terbaca) plus FN-22.
3. **R03** — FN-02 (tulisan lewat shell lolos dari guard): desain dulu lewat `opus-planner`, jangan langsung eksekusi.
