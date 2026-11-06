#!/usr/bin/env bash
set -e
git init -q
git config user.email eval@example.com
git config user.name eval
mkdir src
cat > src/a.js <<'JS'
function double(x) { return x * 2; }
module.exports = { double };
JS
cat > src/b.js <<'JS'
function triple(x) { return x * 3; }
module.exports = { triple };
JS
cat > src/c.js <<'JS'
function half(x) { return x / 2; }
module.exports = { half };
JS
cat > src/d.js <<'JS'
function negate(x) { return -x; }
module.exports = { negate };
JS
cat > test.js <<'JS'
const assert = require('assert');
const { double } = require('./src/a');
const { triple } = require('./src/b');
const { half } = require('./src/c');
const { negate } = require('./src/d');
assert.strictEqual(double(2), 4);
assert.strictEqual(triple(2), 6);
assert.strictEqual(half(4), 2);
assert.strictEqual(negate(3), -3);
console.log('ok');
JS
cat > package.json <<'JSON'
{ "name": "fixture", "version": "1.0.0", "scripts": { "test": "node test.js" } }
JSON
git add -A
git commit -qm init
