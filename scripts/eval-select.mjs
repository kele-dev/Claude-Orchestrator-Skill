#!/usr/bin/env node
// Pick the eval cases affected by changed files, so a run skips the rest. A manual all-cases run (--case "*") stays available.
// Usage: node scripts/eval-select.mjs --files a,b,c | --base <git-ref>   (--base uses git diff --name-only <ref>...HEAD)
// Output: selected case names, sorted, one per line (nothing when none). Exit: 0 ok, 2 bad args or git/read failure.
// Unknown skills/, agents/ or hooks/ paths, and changes to evals/touches.json, scripts/eval-* or .github/workflows/, select every case, so a wrong map never skips a regression.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

const argValue = (name) => {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('-')) fail(`eval-select: ${name} needs a value`);
  return v;
};

let files;
if (argValue('--files') !== undefined) {
  files = argValue('--files').split(',').filter(Boolean);
} else if (argValue('--base') !== undefined) {
  const ref = argValue('--base');
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/@^~-]*$/.test(ref)) fail(`eval-select: invalid --base ref ${JSON.stringify(ref)}`);
  const r = spawnSync('git', ['diff', '--name-only', `${ref}...HEAD`], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) fail((r.stderr ?? '').trim() || `eval-select: git diff ${ref}...HEAD failed`);
  files = r.stdout.split('\n').filter(Boolean);
} else {
  fail('eval-select: usage: --files a,b | --base <ref>');
}

let touches;
try {
  touches = JSON.parse(readFileSync(join(root, 'evals', 'touches.json'), 'utf8'));
} catch (e) {
  fail(`eval-select: cannot read evals/touches.json (${e.message})`);
}

const cases = Object.keys(touches);
const prefixesOf = (c) => (Array.isArray(touches[c]) ? touches[c] : []);
const picked = new Set();
const all = () => cases.forEach((c) => picked.add(c));

for (const raw of files) {
  const f = raw.replace(/\\/g, '/');
  if (f.startsWith('hooks/') || f.startsWith('.claude-plugin/') || f === 'evals/touches.json' || f.startsWith('scripts/eval-') || f.startsWith('.github/workflows/')) {
    all();
    continue;
  }
  const folder = cases.find((c) => f.startsWith(`evals/${c}/`));
  if (folder) {
    picked.add(folder);
    continue;
  }
  const hits = cases.filter((c) => prefixesOf(c).some((p) => f.startsWith(p)));
  if (hits.length) {
    hits.forEach((c) => picked.add(c));
    continue;
  }
  if (f.startsWith('skills/') || f.startsWith('agents/')) all();
}

process.stdout.write([...picked].sort().map((c) => `${c}\n`).join(''));
