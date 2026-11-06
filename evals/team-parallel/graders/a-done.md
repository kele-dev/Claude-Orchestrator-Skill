---
type: regex
pattern: 'module\.exports\s*=\s*\{[^}]*\bdouble\b|exports\.double\s*='
target:
  source: file
  path: src/a.js
---
src/a.js exports double.
