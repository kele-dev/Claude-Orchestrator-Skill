---
type: regex
pattern: 'module\.exports\s*=\s*\{[^}]*\btriple\b|exports\.triple\s*='
target:
  source: file
  path: src/b.js
---
src/b.js exports triple.
