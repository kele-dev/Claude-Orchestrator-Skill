# Orkestrasi Claude Code

Opus berpikir dan menulis PRD, `haiku-coder` mengeksekusi, `sonnet-dev` untuk eskalasi.
Opus tidak pernah mengedit kode sendiri.

## Instalasi (Windows)

```bash
git clone https://github.com/marketingboedjang-dev/claude-orkestrasi.git
```

Lalu klik dua kali `install.bat` di folder `claude-orkestrasi`, dan buka sesi Claude Code baru dengan model Opus.

Update ke versi baru: `git pull`, lalu jalankan `install.bat` lagi (aman diulang).

## Yang dipasang ke `%USERPROFILE%\.claude`

- `agents/`: `haiku-coder`, `sonnet-dev`, `opus-reviewer`
- `skills/orkestrator/SKILL.md`
- Aturan orkestrasi di `CLAUDE.md` (di antara penanda `BEGIN/END:orkestrasi`; isi lain tidak dihapus)
- `settings.json`: izin perintah aman (`npm test`, `git diff`, dst.) dan `defaultMode: acceptEdits`; setelan lain tidak diubah

File lama disalin dulu ke `.claude\backups\orkestrasi-<waktu>\`.
