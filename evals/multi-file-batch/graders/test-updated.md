---
type: regex
pattern: 'twice\(|thrice\(|semi\(|invert\('
target:
  source: file
  path: test.js
---
test.js calls the renamed functions.
