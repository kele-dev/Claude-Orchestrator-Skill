#!/usr/bin/env bash
set -e
git init -q
git config user.email eval@example.com
git config user.name eval
mkdir src
cat > src/math.js <<'JS'
function add(a, b) { return a + b; }
module.exports = { add };
JS
cat > test.js <<'JS'
const assert = require('assert');
const { add } = require('./src/math');
assert.strictEqual(add(2, 3), 5);
console.log('ok');
JS
cat > package.json <<'JSON'
{ "name": "fixture", "version": "1.0.0", "scripts": { "test": "node test.js" } }
JSON
git add -A
git commit -qm init
