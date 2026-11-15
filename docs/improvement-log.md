# Improvement Log

## PROFIL (diperbarui: 2026-11-15)
- Jenis: tool/plugin (plugin Claude Code: skills, agents, hooks, script Node) + konten (prompt Markdown).
- Stack: Markdown (skills/, agents/, hooks/rules.md), Node.js ESM tanpa dependency npm (hooks/*.mjs, scripts/*.mjs), GitHub Actions (validate di ubuntu/windows/macos; eval manual).
- Perintah aman: build tidak ada · test/lint `node scripts/validate.mjs` (harus mencetak `OK: <n> skills, <n> agents, version x.y.z`) · ukur token sub-agent sebuah sesi `node scripts/budget.mjs <transcript.jsonl>`.
- Perintah terlarang di siklus ini: `claude plugin eval` dan workflow `eval` (API berbayar, tidak jalan di Windows); hanya user yang menjalankannya.
- Batasan: sesi utama tidak mengedit file project (hook guard-edit; hanya `docs/prd/` yang boleh), semua perubahan lewat `haiku-coder`/`sonnet-dev`, termasuk log ini; tidak commit/push tanpa diminta; versi di `.claude-plugin/plugin.json` dan `marketplace.json` harus sama; README wajib punya baris "Baru di <versi>"; klaim hemat token butuh baris before/after di `evals/README.md`.
- Konvensi commit repo: subjek `v<versi>: <ringkasan>`, body berupa daftar poin, trailer Co-Authored-By.
- Dokumen acuan: `README.md`, `docs/ideas/token-saving.md`, `docs/prd/*.md`, `evals/README.md`.
- Area audit: (1) skills/on + modes + reference (2) skills/team + autopilot (3) skills/resume + learn + init + status + off (4) agents/ (5) hooks/ (6) scripts/ (7) evals/ + .github/workflows (8) README + manifest + docs.

## FOKUS
- Akurasi kerja agent dan penghematan token, status: dikonfirmasi (2026-11-15)

## SESI TERAKHIR
- 2026-11-15, base origin/main 8fa1f6d (v1.12.0); commit 219f3ea (IMP-001), 110d252 (log), lalu satu commit per item

## CAKUPAN
| Area | Terakhir diaudit |
|------|------------------|
| skills/on + modes + reference | 2026-11-15 (SKILL.md dan modes.md penuh; reference.md baru lewat audit Explore 2026-11-14) |
| skills/team + autopilot | 2026-11-14 (audit Explore; baris 18 diverifikasi langsung) |
| skills/resume + learn + init + status + off | 2026-11-14 (audit Explore; belum diverifikasi langsung) |
| agents/ | 2026-11-15 |
| hooks/ | 2026-11-15 (rules.md, trim-output, session-info, guard-review penuh; guard-edit dan long-session sebagian) |
| scripts/ | 2026-11-15 (budget.mjs penuh; validate, trace-tokens, digest sebagian) |
| evals/ + .github/workflows | 2026-11-15 (evals/README.md penuh; case dan grader baru daftar nama) |
| README + manifest + docs | 2026-11-14 (sebagian) |

## TEMUAN
| ID | Tanggal | Sumber | Kategori | Temuan (bukti) | Dampak | Effort | Prioritas | Status | Catatan |
|----|---------|--------|----------|----------------|--------|--------|-----------|--------|---------|
| IMP-001 | 2026-11-15 | audit 2026-11-14 | akurasi (aturan) + hook | Batch pra-siklus: konflik aturan short path dan reviewer non-Opus (skills/on/SKILL.md:18,19,69; skills/team/SKILL.md:18; skills/autopilot/SKILL.md:18), catatan bundling (docs/ideas/token-saving.md:43), checklist review PRD (agents/opus-reviewer.md:17), batas lane (README.md:37), regex path PRD berspasi dan drive Windows (hooks/guard-review.mjs:7) | tinggi | kecil | - | ✅ | Verifikasi: `node scripts/validate.mjs` mencetak `OK: 8 skills, 4 agents, version 1.11.1`, termasuk 5 smoke case baru (scripts/validate.mjs:605-609). BELUM di-commit (8 file). Aturan non-Opus belum diuji eval (lihat IMP-008). |
| IMP-002 | 2026-11-15 | audit + sesi | akurasi + token | Hook session-info tidak menandai `learned-map` yang belum ada: hooks/session-info.mjs:51-62 hanya mencetak daftar lesson. Store project ini hanya berisi `learned-verify.md` (`ls <store>/lessons`). Sesi 2026-11-15 menjalankan task ubah-file tanpa init (skills/init/SKILL.md:3) dan tanpa menyimpan map walau skills/on/SKILL.md:78 memintanya. Hanya `status` yang menandai map hilang (skills/status/SKILL.md:15) | sedang-tinggi | kecil | P1 | ✅ | Selesai 2026-11-15: baris Map: none di hooks/session-info.mjs + smoke "session-info map"; validate OK. Rencana: satu baris `Map: none ...` di hooks/session-info.mjs saat `learned-map.md` tidak ada, plus smoke test di scripts/validate.mjs (sekitar baris 391). |
| IMP-003 | 2026-11-15 | audit + sesi | token | Hook trim memotong output baca/listing yang sengaja dibatasi model: listing `git ls-files` dengan `head -200` dan `tail -40` (164 baris) dipotong jadi 43 baris, perintah harus diulang (1 panggilan sesi utama terbuang); setelah itu 7 dari 16 perintah shell sesi itu memakai `# notrim`. Penyebab: pengecualian hanya untuk `git diff/show/log -p`, `cat`, `jq`, `Get-Content`, `type` (hooks/trim-output.mjs:20); ambang 80 baris dan 4000 char (hooks/trim-output.mjs:49); regex error cocok ke nama path seperti `on-learned-errors` (hooks/trim-output.mjs:57) | sedang | kecil | P1 | 🔲 | Rencana: ambang lebih longgar (misalnya 300 baris) untuk perintah baca/listing/cari di awal statement (ls, find, git ls-files, grep, rg, head, tail, sed -n, wc); batas 30000 char tetap; smoke test baru di scripts/validate.mjs (sekitar baris 320); perbarui README.md:66. |
| IMP-004 | 2026-11-15 | audit (ukur transkrip) | token (pengukuran) | Alat ukur hanya menghitung sub-agent (scripts/budget.mjs:2; skills/on/modes.md:10 "main session excluded"), padahal sesi utama adalah biaya dominan (evals/README.md:90: Opus 98-99%, Haiku 1-2%). Sesi 2026-11-15: `node scripts/budget.mjs <transcript>` mencetak `BUDGET: spent 226k (4 agents)`, sedangkan sesi utama memakai 25 panggilan API: cache-read 2,70M, cache-write 238k, output 72k token, konteks 71k menjadi 202k | sedang (prasyarat semua klaim hemat) | kecil-sedang | P1 | 🔲 | Rencana: flag `--main` di scripts/budget.mjs (jumlah usage pesan assistant non-sidechain, dedupe per message.id), smoke test di scripts/validate.mjs (sekitar baris 516), dipakai `orchestrator:status`. |
| IMP-005 | 2026-11-15 | audit (data eval) | token | Jalur pendek menggandakan biaya edit kecil tanpa menaikkan akurasi: plain-edit-ablation dengan plugin 172k token / $0.178, tanpa plugin 51k / $0.0905, lulus 2/2 di kedua arm (evals/README.md:75-76, :91). Titik impas tidak diketahui: tidak ada baris with/without untuk tugas multi-file (evals/README.md:84-85 keduanya arm "with") | tinggi | sedang | P2 | 🔲 | Butuh eval berbayar (user) atau IMP-004 untuk mengukur di sesi nyata. Eksperimen: (a) catat jumlah turn per run (scripts/trace-tokens.mjs:141 sudah mencetaknya); (b) brief pass-through tanpa Read di sesi utama untuk permintaan yang sudah menyebut file dan perubahannya; (c) resep jalur pendek tanpa memuat skill penuh (skills/on/SKILL.md 12,8 KB); (d) ablation with-without untuk multi-file-batch. Opsi desain yang butuh keputusan user: izinkan edit langsung di bawah ambang tertentu. |
| IMP-006 | 2026-11-15 | audit (data eval) | akurasi | Sesi utama non-Opus: review PRD sebelum eksekusi hanya dipatuhi sekitar 50% (n=2) (evals/README.md:94; evals/README.md:86 on-sonnet-prd-save 1.11.0 lulus 1/2). Sonnet dipakai nyata sebagai sesi utama (`git log`: trailer Claude Sonnet 5.5 di b3501b2, f8cebfd, f940930, 722dc3e, 3c602f3) | tinggi | sedang | P2 | 🔲 | Butuh trace run gagal (R9e) dari user untuk tahu polanya. Opsi: PRD non-Opus selalu ditulis ke docs/prd/ (reviewer dan eksekutor membaca dari path), lalu gate di hooks/guard-review.mjs yang menolak haiku-coder/sonnet-dev selama PRD yang ditulis sesi utama belum direview. |
| IMP-007 | 2026-11-15 | audit + sesi | akurasi | Aturan commit tanpa pengecualian untuk permintaan eksplisit user: skills/on/SKILL.md:81 ("Do not commit (unless commit=batch ...)") sedangkan skills/off/SKILL.md:13 menulis "without being asked"; bentrok dengan instruksi user seperti improvement-cycle (satu commit per item) | sedang | kecil | P2 | 🔲 | Rencana: tambah "kecuali user meminta di chat: delegasikan TYPE: COMMIT" di skills/on/SKILL.md:81 dan baris Hard rules skills/on/modes.md. |
| IMP-008 | 2026-11-15 | audit (data eval) | akurasi (eval) | Eval belum bisa mendeteksi regresi: tidak ada baris hasil untuk 1.11.1 (evals/README.md:62-86); `on-learned-errors-write` gagal karena case bertentangan dengan aturan "task bersih tidak menyimpan lesson" (evals/README.md:79, :93; skills/on/SKILL.md:78); `autopilot-budget-stop` lulus 1 dari 4 karena sandbox menolak tulis ke store (evals/README.md:54, :66, :69, :71, :82) | sedang-tinggi | sedang | P2 | 🔲 | Butuh eval berbayar (user, Linux/CI). Minimal: jalankan ulang `on-sonnet-*` setelah IMP-001 di-commit. |
| IMP-009 | 2026-11-15 | audit | token (kecil) | hooks/rules.md (2.659 byte, disuntik tiap SessionStart: hooks/hooks.json:5-9) mengulang aturan: baris 12 mengulang akhir baris 10; baris 3 setara skills/on/SKILL.md:13; baris 4 setara skills/on/SKILL.md:20; baris 13 setara skills/on/SKILL.md:75 | kecil (sekitar 0,2k token per sesi) | kecil | P3 | 🔲 | Risiko regresi kepatuhan non-Opus; ukur `chat-terse` dan `on-small-edit` sebelum dan sesudah. |
| IMP-010 | 2026-11-15 | audit 2026-11-14 | dokumentasi | Teks basi: skills/learn/legacy.md:3 ("removal planned in v1.8.0", versi sekarang 1.11.1); skills/status/SKILL.md:18 (hitungan delegasi tanpa opus-planner); README.md:73 (bagian Inggris berhenti di 1.11.0, catatan 1.11.1 hanya di README.md:152) | kecil | kecil | P3 | 🔲 | |
| IMP-011 | 2026-11-15 | audit 2026-11-14 | hook | Hook rules memakai `cat` tanpa `timeout`, satu-satunya hook yang bukan node (hooks/hooks.json:9) | kecil | kecil | P3 | 🔲 | Rencana: hooks/session-info.mjs mencetak rules.md sendiri (hemat 1 proses per sesi). Bisa digabung dengan IMP-002. |

Status: 🔲 belum · 🔄 sedang · ⏸ tertunda · ✅ selesai · 🚫 ditolak

## PERLU DICEK (dugaan, bukan temuan)
- Apakah rules.md ikut disuntik saat resume/compact: pada resume sesi 2026-11-15 hanya blok session-info yang tampil.
- hooks/rules.md:2 tidak menyebut "muat sekali per sesi" (skills/on/modes.md:6 punya syarat "not in context yet"); risiko skill 12,8 KB dimuat ulang per task belum teramati.
- agents/haiku-coder.md:19 tidak punya aturan "teks OLD tidak ditemukan: berhenti dan lapor"; belum ada kegagalan teramati.
- `effort: low` untuk haiku-coder (agents/haiku-coder.md:6): belum ada A/B akurasi.
- Hook long-session hanya jalan di UserPromptSubmit (hooks/hooks.json:54): di satu giliran otonom yang panjang tidak ada pengingat (sesi 2026-11-15 melewati +120k di tengah giliran).
- Temuan audit Explore 2026-11-14 yang belum diverifikasi langsung: project non-git, interupsi user di tengah batch, validator tidak menjalankan string `command` asli hooks.json, helper terduplikasi di lima hook, case eval untuk off/resume/init belum ada.
- Klaim audit yang TIDAK lolos verifikasi (jangan diangkat lagi tanpa bukti baru): "`/orchestrator:off` lama diabaikan" hanya berlaku untuk transkrip di atas 16 MB (hooks/guard-edit.mjs:99-106 membaca ulang seluruh transkrip kalau tail tanpa penanda); "pemicu after compaction tidak diimplementasi" keliru karena hooks/rules.md:11 adalah instruksi ke model, bukan janji hook.

## ARSIP
- (kosong)
