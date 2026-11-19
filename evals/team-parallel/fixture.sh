#!/usr/bin/env bash
set -e
git init -q
git config user.email eval@example.com
git config user.name eval
mkdir src
cat > src/a.js <<'JS'
function inc(x) { return x + 1; }
module.exports = { inc };
JS
cat > src/b.js <<'JS'
function dec(x) { return x - 1; }
module.exports = { dec };
JS
cat > test-a.js <<'JS'
const assert = require('assert');
const a = require('./src/a');
assert.strictEqual(a.inc(1), 2);
console.log('a ok');
JS
cat > test-b.js <<'JS'
const assert = require('assert');
const b = require('./src/b');
assert.strictEqual(b.dec(1), 0);
console.log('b ok');
JS
cat > package.json <<'JSON'
{ "name": "fixture", "version": "1.0.0", "scripts": { "test": "node test-a.js && node test-b.js" } }
JSON
git add -A
git commit -qm init
