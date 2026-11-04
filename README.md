# Claude Orchestrator Skill

Plugin Claude Code untuk orkestrasi hemat token: Opus berpikir dan menulis PRD,
`haiku-coder` mengeksekusi, `sonnet-dev` untuk eskalasi. Opus tidak pernah mengedit kode sendiri.
Jalan di Windows, macOS, dan Linux.

## Instalasi

**Terminal (Windows, macOS, Linux)** - satu perintah:

```bash
claude plugin install orchestrator --marketplace kele-dev/Claude-Orchestrator-Skill
```

Kalau versi Claude Code-mu belum mendukung perintah di atas, pakai dua perintah ini:

```bash
claude plugin marketplace add kele-dev/Claude-Orchestrator-Skill
claude plugin install orchestrator@kele-dev
```

Di dalam sesi `claude` juga bisa: `/plugin marketplace add kele-dev/Claude-Orchestrator-Skill`, lalu `/plugin install orchestrator@kele-dev`.

**Claude Desktop (tab Code)** - klik `+` di samping kotak prompt, pilih **Add plugins**,
tambahkan marketplace `kele-dev/Claude-Orchestrator-Skill`, lalu pasang `orchestrator` dengan scope **User**.

Setelah terpasang, mulai sesi baru dengan model Opus. Scope user berarti berlaku di semua proyek.

Update: `claude plugin update orchestrator@kele-dev`. Hapus: `claude plugin uninstall orchestrator@kele-dev`.

## Pemakaian

Mode orkestrasi aktif otomatis di setiap sesi. Perintah manual:

- `/orchestrator:on` - aktifkan (atau `/orchestrator:on <tugas>` untuk langsung memberi tugas)
- `/orchestrator:off` - matikan untuk sisa sesi ini (Claude mengerjakan langsung seperti biasa)

## Isi plugin

- Skill `on` dan `off`: alur PRD -> delegasi -> eskalasi -> review, dan tombol mematikannya.
- Agent `haiku-coder` (eksekutor), `sonnet-dev` (eskalasi), `opus-reviewer` (review, hanya baca).
- Hook awal sesi yang memuat aturan orkestrasi ke setiap sesi.

## Opsional: kurangi kotak izin

Plugin tidak bisa mengubah izin. Supaya subagent tidak sering menunggu persetujuan,
pilih mode **Accept edits** saat membuka sesi, atau tambahkan ke `~/.claude/settings.json`:

```json
{ "permissions": { "defaultMode": "acceptEdits", "allow": ["Bash(npm test *)", "Bash(git diff *)", "Bash(git status *)"] } }
```

## Pindah dari versi installer lama

Kalau dulu memasang lewat `install.ps1`, hapus `haiku-coder.md`, `sonnet-dev.md`, `opus-reviewer.md`
dari `~/.claude/agents/`, folder `~/.claude/skills/orkestrator/`, dan blok `BEGIN/END:orkestrasi` di `~/.claude/CLAUDE.md`.

## Lisensi

MIT, lihat [LICENSE](LICENSE).
