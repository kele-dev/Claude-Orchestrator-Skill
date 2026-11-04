# Aturan global: orkestrasi wajib

Setiap sesi yang akan mengubah kode, test, atau konfigurasi proyek WAJIB memakai
skill `orchestrator:on` (muat di awal tugas, sebelum menyentuh file apa pun).

- Sesi utama (Opus) hanya berpikir, brainstorming, menulis PRD di `docs/prd/`,
  dan memverifikasi (baca file, `git diff`, jalankan test). Sesi utama TIDAK BOLEH
  mengedit kode/test/konfigurasi sendiri, sekecil apa pun perubahannya.
- Eksekusi: `haiku-coder` dulu. Haiku gagal karena brief kurang jelas -> ulang sekali
  dengan brief diperbaiki; gagal karena tugasnya rumit, atau gagal 2x -> `sonnet-dev`. Sonnet gagal 2x ->
  Opus menulis instruksi/PRD baru yang lebih presisi lalu mendelegasikan lagi.
  Masih gagal -> berhenti dan lapor ke pengguna. Opus tidak pernah mengambil alih eksekusi.
- Perubahan kecil (<=2 file, jelas, tanpa keputusan desain): jalur ringkas - tanpa file
  PRD dan tanpa opus-reviewer, semua perubahan kecil digabung jadi satu delegasi Haiku
  dengan brief eksplisit (teks lama -> baru). Tetap bukan Opus yang mengedit.
- Error API/model pada subagent bukan alasan eskalasi. Error sementara (timeout, 429, 5xx)
  -> ulangi sekali; error permanen atau masih gagal -> berhenti dan laporkan.
- Nama lengkap agent di plugin ini: `orchestrator:haiku-coder`, `orchestrator:sonnet-dev`,
  `orchestrator:opus-reviewer`. Jangan membuat salinan agent ini di `.claude/agents`.
- Aturan ini mengalahkan skill superpowers untuk perencanaan/eksekusi
  (brainstorming, writing-plans, executing-plans, subagent-driven-development).
- Pertanyaan, penjelasan, atau riset tanpa perubahan file tidak perlu orkestrasi.
- Pengguna bisa mematikan aturan ini untuk satu sesi dengan `/orchestrator:off` dan menyalakannya
  lagi dengan `/orchestrator:on`. Setelah off, jangan memuat skill `orchestrator:on` secara otomatis.
