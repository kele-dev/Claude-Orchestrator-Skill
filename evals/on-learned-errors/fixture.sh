#!/usr/bin/env bash
set -e
git init -q
git config user.email eval@example.com
git config user.name eval
cat > test.js <<'JS'
const fs = require('fs');
if (!fs.existsSync('config/defaults.json')) {
  console.error('ORCH_E42: defaults config missing');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync('config/defaults.json', 'utf8'));
if (cfg.mode !== 'safe') {
  console.error('ORCH_E42: mode must be safe');
  process.exit(1);
}
console.log('ok');
JS
cat > package.json <<'JSON'
{ "name": "fixture", "version": "1.0.0", "scripts": { "test": "node test.js" } }
JSON
git add -A
git commit -qm init
store=$(m=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && m=$(dirname "$m") || m=$(pwd -W 2>/dev/null || pwd); h=$(cygpath -m ~ 2>/dev/null || echo ~); k=$(printf %s "$m" | tr A-Z a-z | sed 's/[^a-z0-9][^a-z0-9]*/-/g' | tr -d '\n' | tail -c 80); echo "$h/.claude/orchestrator/$k")
mkdir -p "$store/lessons"
cat > "$store/lessons/learned-errors.md" <<'MD'
---
name: learned-errors
description: Verified error patterns of this project (error text, cause, fix). Read when a test/build fails, before TRIAGE.
---

# Learned: errors

- [2026-01-01] ERROR: ORCH_E42 defaults config missing -> CAUSE: config/defaults.json is not generated and must be created by hand -> FIX: create config/defaults.json with {"mode": "safe"}. Source: eval fixture. hits: 1
MD
