# Installer orkestrasi Claude Code (Windows)
# Pasang: agent haiku-coder/sonnet-dev/opus-reviewer, skill orkestrator,
# aturan global di CLAUDE.md, dan izin perintah aman di settings.json.
param([string]$ClaudeHome = (Join-Path $env:USERPROFILE ".claude"))
$ErrorActionPreference = "Stop"
$src = if ($PSScriptRoot) { Join-Path $PSScriptRoot "files" } else { "" }
if (-not $src -or -not (Test-Path $src)) {
  # Dijalankan langsung dari URL: unduh isi repo ke folder sementara
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $tmp = Join-Path $env:TEMP ("orkestrasi-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "repo.zip"
  Write-Host "Mengunduh orkestrasi dari GitHub..."
  Invoke-WebRequest -UseBasicParsing "https://github.com/kele-dev/Claude-Orchestrator-Skill/archive/refs/heads/main.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $tmp -Force
  $src = Join-Path $tmp "Claude-Orchestrator-Skill-main\files"
}
$ts = Get-Date -Format "yyyyMMddHHmmss"
$backup = Join-Path $ClaudeHome "backups\orkestrasi-$ts"

New-Item -ItemType Directory -Force -Path (Join-Path $ClaudeHome "agents"), (Join-Path $ClaudeHome "skills\orkestrator"), $backup | Out-Null

function Copy-WithBackup($from, $to) {
  if (Test-Path $to) { Copy-Item $to (Join-Path $backup ((Split-Path $to -Leaf) + ".bak")) -Force }
  Copy-Item $from $to -Force
}

# 1. Agent dan skill
foreach ($a in "haiku-coder", "sonnet-dev", "opus-reviewer") {
  Copy-WithBackup (Join-Path $src "agents\$a.md") (Join-Path $ClaudeHome "agents\$a.md")
}
Copy-WithBackup (Join-Path $src "skills\orkestrator\SKILL.md") (Join-Path $ClaudeHome "skills\orkestrator\SKILL.md")

# 2. CLAUDE.md global: blok orkestrasi di antara penanda (isi lain dipertahankan)
$begin = "<!-- BEGIN:orkestrasi -->"; $end = "<!-- END:orkestrasi -->"
$block = "$begin`r`n" + (Get-Content (Join-Path $src "CLAUDE-orkestrasi.md") -Raw -Encoding UTF8).Trim() + "`r`n$end"
$claudeMd = Join-Path $ClaudeHome "CLAUDE.md"
if (Test-Path $claudeMd) {
  Copy-Item $claudeMd (Join-Path $backup "CLAUDE.md.bak") -Force
  $old = Get-Content $claudeMd -Raw -Encoding UTF8
  $pattern = [regex]::Escape($begin) + "[\s\S]*?" + [regex]::Escape($end)
  if ($old -match $pattern) { $new = [regex]::Replace($old, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block }) }
  else { $new = $old.TrimEnd() + "`r`n`r`n" + $block + "`r`n" }
} else { $new = $block + "`r`n" }
[IO.File]::WriteAllText($claudeMd, $new, (New-Object Text.UTF8Encoding $false))

# 3. settings.json: tambah izin perintah aman + mode acceptEdits (setelan lain tidak diubah)
$settingsPath = Join-Path $ClaudeHome "settings.json"
if (Test-Path $settingsPath) {
  Copy-Item $settingsPath (Join-Path $backup "settings.json.bak") -Force
  $s = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else { $s = New-Object PSObject }
if (-not $s.permissions) { $s | Add-Member -NotePropertyName permissions -NotePropertyValue (New-Object PSObject) }
$allow = @()
if ($s.permissions.allow) { $allow = @($s.permissions.allow) }
$safe = @("Bash(npm test)", "Bash(npm test *)", "Bash(npm run test *)", "Bash(npm run build *)", "Bash(npm run lint *)",
  "Bash(npm run typecheck *)", "Bash(node --test *)", "Bash(npx tsc --noEmit *)",
  "Bash(git status)", "Bash(git status *)", "Bash(git diff)", "Bash(git diff *)", "Bash(git log *)", "Bash(git show *)")
foreach ($r in $safe) { if ($allow -notcontains $r) { $allow += $r } }
$s.permissions | Add-Member -NotePropertyName allow -NotePropertyValue $allow -Force
$s.permissions | Add-Member -NotePropertyName defaultMode -NotePropertyValue "acceptEdits" -Force
[IO.File]::WriteAllText($settingsPath, ($s | ConvertTo-Json -Depth 32), (New-Object Text.UTF8Encoding $false))

Write-Host ""
Write-Host "Orkestrasi terpasang di $ClaudeHome" -ForegroundColor Green
Write-Host "Backup file lama: $backup"
Write-Host "Mulai sesi Claude Code BARU (model Opus) agar aturan termuat."
