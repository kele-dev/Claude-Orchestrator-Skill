# Orkestrasi Claude Code

Opus berpikir dan menulis PRD, `haiku-coder` mengeksekusi, `sonnet-dev` untuk eskalasi.
Opus tidak pernah mengedit kode sendiri.

## Instalasi (Windows)

### Cara 1: lewat terminal

Buka PowerShell, tempel satu baris ini, tekan Enter:

```powershell
irm https://raw.githubusercontent.com/kele-dev/Claude-Orchestrator-Skill/main/install.ps1 | iex
```

### Cara 2: lewat Claude Desktop

Buka sesi Claude Code di Claude Desktop dan ketik:

```text
Pasang orkestrasi dari https://github.com/kele-dev/Claude-Orchestrator-Skill dengan menjalankan perintah ini di PowerShell: irm https://raw.githubusercontent.com/kele-dev/Claude-Orchestrator-Skill/main/install.ps1 | iex
```

Setelah terpasang (cara mana pun), buka sesi Claude Code **baru** dengan model Opus.
Update ke versi baru: jalankan perintah yang sama lagi (aman diulang).

## Yang dipasang ke `%USERPROFILE%\.claude`

- `agents/`: `haiku-coder`, `sonnet-dev`, `opus-reviewer`
- `skills/orkestrator/SKILL.md`
- Aturan orkestrasi di `CLAUDE.md` (di antara penanda `BEGIN/END:orkestrasi`; isi lain tidak dihapus)
- `settings.json`: izin perintah aman (`npm test`, `git diff`, dst.) dan `defaultMode: acceptEdits`; setelan lain tidak diubah

File lama disalin dulu ke `.claude\backups\orkestrasi-<waktu>\`.

## Lisensi

MIT, lihat [LICENSE](LICENSE).
