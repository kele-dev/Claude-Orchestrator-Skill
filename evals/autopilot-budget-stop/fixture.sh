#!/usr/bin/env bash
set -e
git init -q
git config user.email eval@example.com
git config user.name eval
cat > README.md <<'MD'
# Fixture
MD
git add -A
git commit -qm init
